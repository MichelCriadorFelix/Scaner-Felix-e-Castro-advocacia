// @ts-nocheck
import { loadPDFJS, PDFJS_BASE_OPTIONS, loadTesseract } from './loaders';
import { withTimeout } from './async';
import { extractStructuredTextFromPDFPage, isGenuineDigitalText, isCanvasBlank } from './textQuality';
import { wantsHighResImage, isHardHandwritingEnabled, countIllegibleMarks, AUTO_HARD_ILLEGIBLE_THRESHOLD, renderPdfPageForHardRead } from './handwritingMode';
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

export async function extractPDFHybrid(file: File | Blob, onProgress: (percent: number, msg: string) => void, useAi: boolean, startPage: number = 1, forceRefresh: boolean = false, goldStandard: boolean = true, forceAi: boolean = false) {
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

  let activeDocumentApiKey: string | null = null;

  const processOCRFallback = async (pageNum: number, blob: Blob) => {
    onProgress(
      Math.round(((pageNum - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
      `Pág ${pageNum}: Falha na IA. Acionando OCR Local (Contingência)...`
    );
    if (!tesseractWorker) {
      tesseractWorker = await Tesseract.createWorker("por+eng", 1, { logger: () => {} });
    }
    try {
      const res = await withTimeout(tesseractWorker.recognize(blob), 60000, `OCR timeout ${pageNum}`);
      fullText += `[PÁGINA ${pageNum} - OCR LOCAL (Contingência)]\n` + res.data.text.trim() + "\n\n══════════════════════════════════════════════════\n\n";
      confidenceTotal += Math.round(res.data.confidence);
      pagesEvaluated++;
    } catch (e) {
      fullText += `[PÁGINA ${pageNum} - FALHA NA EXTRAÇÃO]\n\n`;
    }
  };

  for (let i = startIdx; i <= endIdx; i++) {
    if (window.lexscan_abort) {
        fullText += `\n\n[PROCESSO PAUSADO PELO USUÁRIO NA PÁGINA ${Math.max(1, i-1)}]\n\n`;
        break;
    }

    let pageSuccess = false;
    let pageText = "";
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
        
        onProgress(
          Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
          `Lendo pág ${i}/${endIdx} (Tentativa ${attempt}/3)...`
        );
        
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
          onProgress(
            Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
            `Pág ${i}/${endIdx}: Lida instantaneamente (Texto Digital Nativo)!`
          );
          fullText += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + pageText + "\n\n══════════════════════════════════════════════════\n\n";
          confidenceTotal += 100;
          pagesEvaluated++;
          pageSuccess = true;
          if (page && page.cleanup) page.cleanup();
          break;
        } else {
          onProgress(
            Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
            `Pág ${i}/${endIdx}: Renderizando imagem escaneada...`
          );
          
          let viewport = page.getViewport({ scale: wantsHighResImage() ? (attempt === 1 ? 3.0 : 2.0) : (attempt === 1 ? 1.5 : 1.0) });
          let canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          let ctx = canvas.getContext("2d");
          if (ctx) {
            let renderTask = page.render({ canvasContext: ctx, viewport });
            await withTimeout(renderTask.promise, 60000, `Render timeout pág ${i}`);
          }
          
          finalCanvasToUse = canvas;
          
          if (isCanvasBlank(finalCanvasToUse)) {
            fullText += `[PÁGINA ${i} - PÁGINA EM BRANCO / VERSO SEM CONTEÚDO]\n\n`;
            confidenceTotal += 100;
            pagesEvaluated++;
            pageSuccess = true;
            if (page && page.cleanup) page.cleanup();
            break;
          }
          
          if (useAi || forceAi) {
            onProgress(
              Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
              `Pág ${i}/${endIdx}: Transcrevendo manuscrito/scan via IA Jurídica...`
            );
            const enhancedBlob = wantsHighResImage()
              ? await enhanceImageForGemini(finalCanvasToUse, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, !isHardHandwritingEnabled())
              : await enhanceImageForGemini(finalCanvasToUse);
            try {
              const mistralFlags: { mistralFailed?: boolean } = {};
              const aiResult = await extractPageWithGemini(enhancedBlob, onProgress, goldStandard, activeDocumentApiKey, mistralFailedThisPage, mistralFlags);
              if (mistralFlags.mistralFailed) mistralFailedThisPage = true;
              let extractedText = typeof aiResult === 'object' && aiResult?.text ? aiResult.text : String(aiResult || '');
              if (typeof aiResult === 'object' && aiResult?.usedKey) {
                activeDocumentApiKey = aiResult.usedKey; // Mantém a chave fixa enquanto responder com sucesso!
              }
              if (!isHardHandwritingEnabled() && !window.lexscan_abort && countIllegibleMarks(extractedText) >= AUTO_HARD_ILLEGIBLE_THRESHOLD) {
                onProgress(
                  Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
                  `Pág ${i}/${endIdx}: muitas partes ilegíveis — reanalisando em modo manuscrito difícil...`
                );
                try {
                  const hardBlob = await renderPdfPageForHardRead(page);
                  if (hardBlob) {
                    const hardResult = await extractPageWithGemini(hardBlob, onProgress, goldStandard, activeDocumentApiKey, true, undefined, true);
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
              fullText += `[PÁGINA ${i} - RECUPERADO VIA IA JURÍDICA]\n` + extractedText + "\n\n══════════════════════════════════════════════════\n\n";
              confidenceTotal += 99;
              pagesEvaluated++;
              pageSuccess = true;
            } catch (aiErr) {
              console.warn(`[Pág ${i}] Falha geral na IA após tentativas em todas as chaves:`, aiErr);
              if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
              await processOCRFallback(i, enhancedBlob);
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
              await processOCRFallback(i, blob);
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
    
    if (!pageSuccess) {
       fullText += `[PÁGINA ${i} - FALHA ESTRUTURAL AO LER PDF]\n\n`;
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
            ? await enhanceImageForGemini(file, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, !isHardHandwritingEnabled())
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
