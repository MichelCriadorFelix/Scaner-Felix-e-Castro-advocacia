// @ts-nocheck
import { loadPDFJS, PDFJS_BASE_OPTIONS, loadTesseract } from './loaders';
import { withTimeout } from './async';
import { extractStructuredTextFromPDFPage, isGenuineDigitalText, isCanvasBlank } from './textQuality';
import { wantsHighResImage, imageFilterEnabled, isHardHandwritingEnabled, countIllegibleMarks, AUTO_HARD_ILLEGIBLE_THRESHOLD, renderPdfPageForHardRead } from './handwritingMode';
import { enhanceImageForGemini } from './image';
import { MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY } from './geminiModels';
import { extractPageWithGemini } from './geminiExtract';
import { loadJSPDF } from './browserHelpers';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SZ = 0x8000;
  const c = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SZ)));
  }
  return window.btoa(c.join(''));
}

// Quantas páginas do PDF podem ser lidas AO MESMO TEMPO (teto). 1 = uma por vez (comportamento original).
// Liga com localStorage.lexscan_parallel = '5' (2 a 6). Com teto > 1 o controle é adaptativo: começa com 3, sobe
// enquanto tudo responde rápido e desce se o Google começar a recusar ou demorar.
function getParallelCeiling(): number {
  try {
    const v = Number(localStorage.getItem('lexscan_parallel'));
    return v >= 2 ? Math.min(6, Math.floor(v)) : 1;
  } catch (e) {
    return 1;
  }
}

interface PageOutcome {
  frag: string;       // texto desta página já com o cabeçalho [PÁGINA n - ...]
  conf: number;       // confiança somada (para a média do documento)
  evaluated: number;  // quantas "avaliações" entram na média
  aborted: boolean;   // interrompida pelo usuário (pausa) antes de terminar
  aiFailed: boolean;  // a IA falhou e entrou a contingência (sinal pro controle adaptativo)
}

export async function extractPDFHybrid(file: File | Blob, onProgressRaw: (percent: number, msg: string) => void, useAi: boolean, startPage: number = 1, forceRefresh: boolean = false, goldStandard: boolean = true, forceAi: boolean = false) {
  // forceRefresh (reprocessar ignorando cache) sempre implicou forçar a IA visual também,
  // pulando a detecção de texto digital nativo. Nenhum ponto de chamada no app passa o 7º
  // parâmetro (forceAi) diretamente, então sem esta linha "forçar reprocessamento" nunca
  // conseguia sobrepor uma camada de texto digital ruim.
  forceAi = forceAi || forceRefresh;
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_BASE_OPTIONS }).promise;
  let fullText = "";
  let confidenceTotal = 0;
  let pagesEvaluated = 0;

  let tesseractWorker: any = null;
  const Tesseract = await loadTesseract();

  let startIdx = parseInt(String(startPage)) || 1;
  const endIdx = pdf.numPages;
  const totalPages = Math.max(1, endIdx - startIdx + 1);

  let activeDocumentApiKey: string | null = null;

  const maxParallel = getParallelCeiling();
  const parallelMode = maxParallel > 1;
  let doneCount = 0;
  let lastPercent = 0;

  // Barra de progresso: nunca recebe "null" (antes ficava "%" vazio quando o servidor mandava só mensagem).
  const onProgress = (p: number | null, msg: string) => {
    if (typeof p === 'number') lastPercent = p;
    onProgressRaw(typeof p === 'number' ? p : lastPercent, msg);
  };
  // Progresso de UMA página: em sequência usa a posição da página; em paralelo, quantas já terminaram + prefixo [Pág n].
  const pagePercent = (i: number) => parallelMode ? Math.round((doneCount / totalPages) * 100) : Math.round(((i - startIdx + 1) / totalPages) * 100);
  const pp = (i: number, msg: string) => onProgress(pagePercent(i), parallelMode ? `[Pág ${i}] ${msg}` : msg);

  const ocrFallback = async (pageNum: number, blob: Blob): Promise<{ frag: string; conf: number; evaluated: number }> => {
    pp(pageNum, `Pág ${pageNum}: Falha na IA. Acionando OCR Local (Contingência)...`);
    if (!tesseractWorker) {
      tesseractWorker = await Tesseract.createWorker("por+eng", 1, { logger: () => {} });
    }
    try {
      const res = await withTimeout(tesseractWorker.recognize(blob), 60000, `OCR timeout ${pageNum}`);
      return {
        frag: `[PÁGINA ${pageNum} - OCR LOCAL (Contingência)]\n` + res.data.text.trim() + "\n\n══════════════════════════════════════════════════\n\n",
        conf: Math.round(res.data.confidence),
        evaluated: 1,
      };
    } catch (e) {
      return { frag: `[PÁGINA ${pageNum} - FALHA NA EXTRAÇÃO]\n\n`, conf: 0, evaluated: 0 };
    }
  };

  // Lê UMA página (todas as tentativas, texto digital, render, IA, releitura, contingência) e devolve o resultado
  // sem tocar no texto geral — quem junta na ordem certa é o controle lá embaixo.
  const processOnePage = async (i: number): Promise<PageOutcome> => {
    let pageSuccess = false;
    let pageText = "";
    let frag = "";
    let conf = 0;
    let evaluated = 0;
    let aiFailed = false;
    // Uma vez por página (não reseta entre as 3 tentativas de releitura/render abaixo, que
    // mudam até a escala da imagem) — garante que a Mistral seja tentada no máximo 1x por
    // página real, não 1x por tentativa de releitura.
    let mistralFailedThisPage = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (window.lexscan_abort) break;
      let finalCanvasToUse: HTMLCanvasElement | null = null;
      let tempCanvas: HTMLCanvasElement | null = null;

      try {
        if (attempt > 1) await new Promise(r => setTimeout(r, 1000 * attempt));

        pp(i, `Lendo pág ${i}/${endIdx} (Tentativa ${attempt}/3)...`);

        const currentTimeout = 20000 * attempt;
        const page = await withTimeout(pdf.getPage(i), currentTimeout, `Timeout ao carregar pág ${i}`);

        let isDigital = false;
        if (attempt === 1 && !forceAi) {
          try {
            const textContent = await withTimeout(page.getTextContent(), currentTimeout, `Timeout texto nativo ${i}`);
            pageText = extractStructuredTextFromPDFPage(textContent);

            let hasImage = false;
            try {
              const ops = await page.getOperatorList();
              if (ops && ops.fnArray) {
                hasImage = ops.fnArray.some((fn: any) =>
                  fn === pdfjsLib.OPS.paintImageXObject ||
                  fn === pdfjsLib.OPS.paintInlineImageXObject ||
                  fn === pdfjsLib.OPS.paintImageMaskXObject
                );
              }
            } catch(e) {}

            if (isGenuineDigitalText(pageText, hasImage)) {
              isDigital = true;
            }
          } catch(e) {}
        }

        if (isDigital) {
          pp(i, `Pág ${i}/${endIdx}: Lida instantaneamente (Texto Digital Nativo)!`);
          frag += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + pageText + "\n\n══════════════════════════════════════════════════\n\n";
          conf += 100;
          evaluated++;
          pageSuccess = true;
          if (page && page.cleanup) page.cleanup();
          break;
        } else {
          pp(i, `Pág ${i}/${endIdx}: Renderizando imagem escaneada...`);

          let viewport = page.getViewport({ scale: wantsHighResImage() ? (attempt === 1 ? 3.0 : 2.0) : (attempt === 1 ? 1.5 : 1.0) });
          let canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          let ctx = canvas.getContext("2d");
          if (ctx) {
            let renderTask = page.render({ canvasContext: ctx, viewport, intent: 'print' });
            await withTimeout(renderTask.promise, 60000, `Render timeout pág ${i}`);
          }

          finalCanvasToUse = canvas;

          if (isCanvasBlank(finalCanvasToUse)) {
            frag += `[PÁGINA ${i} - PÁGINA EM BRANCO / VERSO SEM CONTEÚDO]\n\n`;
            conf += 100;
            evaluated++;
            pageSuccess = true;
            if (page && page.cleanup) page.cleanup();
            break;
          }

          if (useAi || forceAi) {
            pp(i, `Pág ${i}/${endIdx}: Transcrevendo manuscrito/scan via IA Jurídica...`);
            const enhancedBlob = wantsHighResImage()
              ? await enhanceImageForGemini(finalCanvasToUse, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, imageFilterEnabled())
              : await enhanceImageForGemini(finalCanvasToUse);
            try {
              const mistralFlags: { mistralFailed?: boolean } = {};
              // Só a MENSAGEM do servidor interessa aqui (a porcentagem é do documento, não da página).
              const aiResult = await extractPageWithGemini(enhancedBlob, (_p: any, msg: string) => pp(i, msg), goldStandard, activeDocumentApiKey, mistralFailedThisPage, mistralFlags);
              if (mistralFlags.mistralFailed) mistralFailedThisPage = true;
              let extractedText = typeof aiResult === 'object' && aiResult?.text ? aiResult.text : String(aiResult || '');
              if (typeof aiResult === 'object' && aiResult?.usedKey) {
                activeDocumentApiKey = aiResult.usedKey; // Mantém a chave fixa enquanto responder com sucesso!
              }
              if (!isHardHandwritingEnabled() && !window.lexscan_abort && countIllegibleMarks(extractedText) >= AUTO_HARD_ILLEGIBLE_THRESHOLD) {
                pp(i, `Pág ${i}/${endIdx}: muitas partes ilegíveis — reanalisando em modo manuscrito difícil...`);
                try {
                  const hardBlob = await renderPdfPageForHardRead(page);
                  if (hardBlob) {
                    const hardResult = await extractPageWithGemini(hardBlob, (_p: any, msg: string) => pp(i, msg), goldStandard, activeDocumentApiKey, true, undefined, true);
                    const hardText = typeof hardResult === 'object' && hardResult?.text ? hardResult.text : String(hardResult || '');
                    if (hardText && countIllegibleMarks(hardText) < countIllegibleMarks(extractedText)) {
                      console.log(`[Releitura automática] Pág ${i}: ${countIllegibleMarks(extractedText)} → ${countIllegibleMarks(hardText)} trechos [ILEGÍVEL] com o modo manuscrito difícil. Usando a releitura.`);
                      extractedText = hardText;
                    }
                  }
                } catch (hardErr) {
                  console.warn(`[Releitura automática] Pág ${i}: releitura falhou, mantendo a 1ª leitura:`, hardErr);
                  if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
                }
              }
              frag += `[PÁGINA ${i} - RECUPERADO VIA IA JURÍDICA]\n` + extractedText + "\n\n══════════════════════════════════════════════════\n\n";
              conf += 99;
              evaluated++;
              pageSuccess = true;
            } catch (aiErr) {
              console.warn(`[Pág ${i}] Falha geral na IA após tentativas em todas as chaves:`, aiErr);
              if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
              aiFailed = true;
              const fb = await ocrFallback(i, enhancedBlob);
              frag += fb.frag; conf += fb.conf; evaluated += fb.evaluated;
              pageSuccess = true;
            }

            if (page && page.cleanup) page.cleanup();
            break;
          } else {
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = finalCanvasToUse.width; tempCanvas.height = finalCanvasToUse.height;
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
               tempCtx.filter = 'grayscale(100%) contrast(220%) brightness(105%)';
               tempCtx.drawImage(finalCanvasToUse, 0, 0);
            }
            const blob = await new Promise<Blob | null>(r => tempCanvas!.toBlob(r, "image/png", 0.9));
            if (blob) {
              const fb = await ocrFallback(i, blob);
              frag += fb.frag; conf += fb.conf; evaluated += fb.evaluated;
            }
            pageSuccess = true;

            if (page && page.cleanup) page.cleanup();
            break;
          }
        }
      } catch (err) {
        console.warn(`Erro na pág ${i}, tentativa ${attempt}:`, err);
      }
    }

    const aborted = !pageSuccess && !!window.lexscan_abort;
    if (!pageSuccess) {
      frag += `[PÁGINA ${i} - FALHA ESTRUTURAL AO LER PDF]\n\n`;
    }
    return { frag, conf, evaluated, aborted, aiFailed: aiFailed || !pageSuccess };
  };

  if (!parallelMode) {
    // Uma página por vez — exatamente como era.
    for (let i = startIdx; i <= endIdx; i++) {
      if (window.lexscan_abort) {
        fullText += `\n\n[PROCESSO PAUSADO PELO USUÁRIO NA PÁGINA ${Math.max(1, i-1)}]\n\n`;
        break;
      }
      const r = await processOnePage(i);
      fullText += r.frag;
      confidenceTotal += r.conf;
      pagesEvaluated += r.evaluated;
      doneCount++;
    }
  } else {
    // Janela deslizante: assim que uma página termina, entra a próxima (não espera a mais lenta de um bloco).
    // Teto = lexscan_parallel; começa em 3, sobe +1 a cada 3 páginas rápidas seguidas, desce -1 (mín. 2) quando
    // a IA falha ou uma página demora mais de 90s. Leitura manuscrita escalada é lenta por natureza (80-160s),
    // então ela também freia sozinha o ritmo.
    const results = new Map<number, PageOutcome>();
    let next = startIdx;
    let running = 0;
    let limit = Math.min(3, maxParallel);
    let okStreak = 0;
    await new Promise<void>((resolveAll) => {
      const finishIfIdle = () => {
        if (running === 0 && (next > endIdx || window.lexscan_abort)) resolveAll();
      };
      const launch = () => {
        while (running < limit && next <= endIdx && !window.lexscan_abort) {
          const i = next++;
          running++;
          const t0 = Date.now();
          processOnePage(i)
            .then((r) => {
              results.set(i, r);
              doneCount++;
              const ms = Date.now() - t0;
              if (r.aiFailed || ms > 90000) { limit = Math.max(2, limit - 1); okStreak = 0; }
              else if (!r.aborted && ms < 45000) { if (++okStreak >= 3 && limit < maxParallel) { limit++; okStreak = 0; } }
              onProgress(Math.round((doneCount / totalPages) * 100), `Páginas concluídas: ${doneCount}/${totalPages} (${Math.min(running, limit)} em leitura agora, até ${limit} ao mesmo tempo)`);
            })
            .catch(() => {
              results.set(i, { frag: `[PÁGINA ${i} - FALHA ESTRUTURAL AO LER PDF]\n\n`, conf: 0, evaluated: 0, aborted: !!window.lexscan_abort, aiFailed: true });
              doneCount++;
            })
            .finally(() => {
              running--;
              launch();
              finishIfIdle();
            });
        }
        finishIfIdle();
      };
      launch();
    });

    // Junta NA ORDEM. Se o usuário pausou, só vale o trecho contínuo de páginas completas (o resto é refeito ao retomar).
    let lastGood = startIdx - 1;
    for (let i = startIdx; i <= endIdx; i++) {
      const r = results.get(i);
      if (!r || r.aborted) break;
      fullText += r.frag;
      confidenceTotal += r.conf;
      pagesEvaluated += r.evaluated;
      lastGood = i;
    }
    if (lastGood < endIdx && window.lexscan_abort) {
      fullText += `\n\n[PROCESSO PAUSADO PELO USUÁRIO NA PÁGINA ${Math.max(1, lastGood)}]\n\n`;
    }
  }

  if (tesseractWorker) {
    await tesseractWorker.terminate().catch(()=>null);
  }

  return {
    text: fullText.trim(),
    confidence: pagesEvaluated > 0 ? Math.round(confidenceTotal / pagesEvaluated) : 0,
    fromCache: false
  };
}
export async function convertSingleImageToPDF(file) {
  const jsPDF = await loadJSPDF();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  
  const blobUrl = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(blobUrl); res(i); };
    i.onerror = () => { URL.revokeObjectURL(blobUrl); rej(); };
    i.src = blobUrl;
  });

  const pdfW = 210;
  const pdfH = 297;
  
  const compCanvas = document.createElement("canvas");
  const compCtx = compCanvas.getContext("2d");
  
  // Compressão Média
  let scale = 1;
  const MAX_SIZE = 1200;
  if (img.width > MAX_SIZE || img.height > MAX_SIZE) {
     scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height);
  }
  
  compCanvas.width = img.width * scale;
  compCanvas.height = img.height * scale;
  compCtx.drawImage(img, 0, 0, compCanvas.width, compCanvas.height);
  
  const compressedDataUrl = compCanvas.toDataURL("image/jpeg", 0.7);
  
  let imgW = (compCanvas.width * pdfH) / compCanvas.height;
  let imgH = (compCanvas.height * pdfW) / compCanvas.width;
  
  if (imgH > pdfH) {
     imgH = pdfH;
     imgW = (compCanvas.width * pdfH) / compCanvas.height;
  }
  
  const x = (pdfW - imgW) / 2;
  const y = (pdfH - imgH) / 2;

  doc.addImage(compressedDataUrl, 'JPEG', x, y, imgW, imgH, undefined, 'FAST');
  URL.revokeObjectURL(blobUrl);

  const pdfBlob = doc.output('blob');
  return new File([pdfBlob], file.name.replace(/\.[^/.]+$/, "") + ".pdf", { type: "application/pdf" });
}

export async function fetchItemBlob(item: any, supabaseContext: any = null): Promise<Blob> {
  if (item instanceof Blob || item instanceof File) return item;
  if (item?.localBlob) return item.localBlob;
  
  const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;
  if (!urlToFetch) throw new Error("URL do documento não encontrada");

  // Interceptar Supabase Storage
  if (urlToFetch.includes('.supabase.co/storage/v1/object/') && supabaseContext) {
    const match = urlToFetch.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
    if (match) {
      const bucket = match[1];
      const filePath = match[2].split('?')[0];
      try {
        const { data: fileBlob, error } = await supabaseContext.storage.from(bucket).download(decodeURIComponent(filePath));
        if (fileBlob && !error) return fileBlob;
      } catch(e) {
        console.warn("Falha no download via SDK do Supabase, tentando fetch direto:", e);
      }
    }
  }

  const res = await fetch(urlToFetch);
  if (!res.ok) throw new Error(`Falha ao obter arquivo (HTTP ${res.status})`);
  return await res.blob();
}

export async function extractImageHybrid(file, onProgress, useAi, forceAi = false, goldStandard = true) {
  if (useAi || forceAi) {
      onProgress(20, "Extraindo via IA Jurídica (Gemini Flash)...");
      try {
          const enhancedForAi = wantsHighResImage()
            ? await enhanceImageForGemini(file, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, imageFilterEnabled())
            : await enhanceImageForGemini(file);
          const aiResult = await extractPageWithGemini(enhancedForAi, onProgress, goldStandard);
          let aiText = typeof aiResult === 'object' && aiResult?.text ? aiResult.text : String(aiResult || '');
          if (!isHardHandwritingEnabled() && !window.lexscan_abort && countIllegibleMarks(aiText) >= AUTO_HARD_ILLEGIBLE_THRESHOLD) {
            onProgress(60, "Muitas partes ilegíveis — reanalisando em modo manuscrito difícil...");
            try {
              const hardBlob = await enhanceImageForGemini(file, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, false);
              const hardResult = await extractPageWithGemini(hardBlob, onProgress, goldStandard, null, true, undefined, true);
              const hardText = typeof hardResult === 'object' && hardResult?.text ? hardResult.text : String(hardResult || '');
              if (hardText && countIllegibleMarks(hardText) < countIllegibleMarks(aiText)) {
                console.log(`[Releitura automática] ${countIllegibleMarks(aiText)} → ${countIllegibleMarks(hardText)} trechos [ILEGÍVEL] com o modo manuscrito difícil. Usando a releitura.`);
                aiText = hardText;
              }
            } catch (hardErr) {
              console.warn("[Releitura automática] Releitura falhou, mantendo a 1ª leitura:", hardErr);
            }
          }
          return { text: `[RECUPERADO VIA IA JURÍDICA]\n` + aiText, confidence: 99 };
      } catch(e: any) {
          let errMsg = e?.message || "Erro desconhecido";
          return { text: `[ERRO CRÍTICO NA IMAGEM - FALHA IA: ${errMsg}]\n`, confidence: 0 };
      }
  }

  onProgress(10, "Avaliando qualidade da imagem via OCR Local (Modo sem IA)...");
  const ocrRes = await runOCR(file, (p) => onProgress(10 + Math.round(p * 40), `Avaliando OCR: ${Math.round(p*100)}%`));
  
  if (ocrRes.confidence >= 99) {
      return { text: `[TEXTO DIGITAL NATIVO]\n` + ocrRes.text, confidence: 100 };
  }
  
  return { text: `[OCR BRUTO (${ocrRes.confidence}%)]\n` + ocrRes.text, confidence: 0 };
}

// ── OCR via Tesseract ─────────────────────────────────────────────────────────
export async function runOCR(imageBlob, onProgress) {
  // Pré-processamento para imagens enviadas diretamente
  const enhancedBlob = await (async () => {
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        const url = URL.createObjectURL(imageBlob);
        i.onload = () => { URL.revokeObjectURL(url); res(i); };
        i.onerror = () => { URL.revokeObjectURL(url); rej(); };
        i.src = url;
      });
      const canvas = document.createElement("canvas");
      
      const MAX_DIM = 2400; // Limite seguro para OCR mobile sem OOM
      let scale = 1;
      if (img.width > MAX_DIM || img.height > MAX_DIM) {
         scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
      }
      
      canvas.width = Math.floor(img.width * scale); 
      canvas.height = Math.floor(img.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      // Filtro otimizado para fotos de celular (mais contraste para manuscritos)
      ctx.filter = 'grayscale(100%) contrast(200%) brightness(105%)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const resBlob = await new Promise(r => canvas.toBlob(r, "image/png", 1.0));
      canvas.width = 0; canvas.height = 0;
      return resBlob;
    } catch (e) {
      console.warn("Falha no pré-processamento, usando original", e);
      return imageBlob;
    }
  })();

  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(enhancedBlob, "por+eng", {
    logger: ({ status, progress }) => {
      if (status === "recognizing text") onProgress(progress);
    }
  });
  return {
    text: result.data.text.trim(),
    confidence: Math.round(result.data.confidence)
  };
}
