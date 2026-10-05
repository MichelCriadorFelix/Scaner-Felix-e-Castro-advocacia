// @ts-nocheck

// Detecta se o Gemini travou em loop de repetição (ex: linha separadora de tabela ou sublinhado repetido sem parar).
// O limite é propositalmente ALTO (bloco repetido de pelo menos 2000 caracteres) para nunca confundir uma
// tabela larga legítima (poucas dezenas de colunas) com um loop genuíno, que sempre gera dezenas de milhares
// de caracteres do mesmo padrão. Um limite baixo demais aqui rejeita texto bom e trava a transcrição inteira.
export function containsDegenerateRepetition(text: string): boolean {
  if (!text || text.length < 2000) return false;
  const match = text.slice(0, 300000).match(/(.{1,50})\1{40,}/);
  return !!match && match[0].length >= 2000;
}

// Detecta se a resposta do Gemini foi cortada por estourar o limite de tokens (maxOutputTokens)
export function isTruncatedResponse(res: any): boolean {
  try {
    return res?.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  } catch (e) {
    return false;
  }
}

// Auxiliar para verificar se o canvas da página renderizada é totalmente em branco (ex: verso de certidão, folha vazia)
export function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    // Amostra rápida em grade de 30x30 pontos ao longo da folha (baixíssimo custo de CPU)
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return true;
    
    const sampleCols = 30;
    const sampleRows = 30;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    
    let nonWhitePixels = 0;
    const totalSamples = sampleCols * sampleRows;
    
    for (let r = 1; r <= sampleRows; r++) {
      for (let c = 1; c <= sampleCols; c++) {
        const x = Math.floor((c / (sampleCols + 1)) * w);
        const y = Math.floor((r / (sampleRows + 1)) * h);
        const idx = (y * w + x) * 4;
        const red = data[idx];
        const green = data[idx + 1];
        const blue = data[idx + 2];
        const alpha = data[idx + 3];
        
        // Se o pixel não for branco/quase branco (fundo claro com luminância < 240) ou transparente
        if (alpha > 30) {
          const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
          if (lum < 235) {
            nonWhitePixels++;
          }
        }
      }
    }
    
    // Se menos de 0.6% das amostras tiverem contraste (menos de 6 pontos escuros em 900 amostras), é página em branco
    return (nonWhitePixels / totalSamples) < 0.006;
  } catch (e) {
    return false;
  }
}
export function extractStructuredTextFromPDFPage(textContent: any): string {
  if (!textContent || !textContent.items || textContent.items.length === 0) return "";
  
  const items = textContent.items
    .filter((item: any) => item && typeof item.str === 'string')
    .map((item: any) => ({
      str: item.str,
      x: item.transform ? item.transform[4] : 0,
      y: item.transform ? item.transform[5] : 0,
      width: item.width || 0,
      height: item.height || 0
    }));

  if (items.length === 0) return "";

  // Sort top-to-bottom (Y desc), then left-to-right (X asc)
  items.sort((a: any, b: any) => {
    if (Math.abs(a.y - b.y) > 4) {
      return b.y - a.y; // Top to bottom
    }
    return a.x - b.x; // Left to right
  });

  const lines: string[] = [];
  let currentLineY: number | null = null;
  let currentLineText = "";

  for (const item of items) {
    if (currentLineY === null || Math.abs(item.y - currentLineY) > 4) {
      if (currentLineText.trim()) {
        lines.push(currentLineText.trim());
      }
      currentLineY = item.y;
      currentLineText = item.str;
    } else {
      currentLineText += (currentLineText && !currentLineText.endsWith(" ") && !item.str.startsWith(" ") ? " " : "") + item.str;
    }
  }
  if (currentLineText.trim()) {
    lines.push(currentLineText.trim());
  }

  return lines.join("\n");
}

export function isGenuineDigitalText(text: string, hasImage: boolean = false): boolean {
  if (!text) return false;
  
  // 1. Remove carimbos/rodapés e cabeçalhos automáticos de sistemas como INSS, PJe, eproc, TramitaSign, SEI, etc.
  let bodyText = text
    .replace(/Autenticado por:[^\n]*/gi, '')
    .replace(/Sem dados de autentica[çc][ãa]o/gi, '')
    .replace(/Anexo ID:\s*\d+/gi, '')
    .replace(/P[áa]gina\s+\d+\s+de\s+\d+/gi, '')
    .replace(/Emitido em:\s*\d{2}\/\d{2}\/\d{4}[^\n]*/gi, '')
    .replace(/Protocolo de Requerimento:?\s*\d+/gi, '')
    .replace(/Hash do documento[^\n]*/gi, '')
    .replace(/Identificador do documento[^\n]*/gi, '')
    .replace(/Documento assinado digitalmente[^\n]*/gi, '')
    .replace(/Você pode conferir a autenticidade[^\n]*/gi, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/_{2,}/g, '')
    .replace(/-{3,}/g, '')
    .replace(/={3,}/g, '')
    .replace(/\[\s*\]/g, '')
    .trim();

  // Se após remover os carimbos de cabeçalho/rodapé não sobrar conteúdo substancial (menos de 150 caracteres),
  // significa que a página é na verdade uma imagem/foto escaneada com apenas o carimbo do INSS em cima!
  // Logo, DEVE ser renderizada e enviada para OCR / IA Jurídica.
  if (bodyText.length < 150) {
    return false;
  }

  // 2. Se a página contém imagem embutida:
  if (hasImage) {
    // Se o texto for curto (< 350 caracteres), geralmente é uma imagem de documento (ex: RG/CNH/Laudo manuscrito) com carimbos
    if (bodyText.length < 350) {
      return false;
    }
    
    // Se contiver termos específicos de documento oficial de identificação/comprovante com imagem
    const isScannedIdDoc = /\b(CARTEIRA DE IDENTIDADE|IDENTIFICA[ÇC][ÃA]O CIVIL|REGISTRO GERAL|DETRAN|HABILITA[ÇC][ÃA]O|CNH|POLEGAR DIREITO|IMPRESS[ÃA]O DIGITAL|FOTO 3X4)\b/i.test(bodyText);
    if (isScannedIdDoc && bodyText.length < 700) {
      return false;
    }
  }

  // 3. Detecção de OCR antigo corrompido / caracteres espúrios:
  const corruptedTokens = bodyText.match(/\b(?=[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9]*[0-9])(?=[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9]*[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ])[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9]{3,}\b/g) || [];
  const abnormalTokens = corruptedTokens.filter(t => 
    !/^\d{7,}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(t) && // Não é num processo
    !/^[A-Z]{2,4}\d{4,}$/.test(t) && // Não é código de órgão
    !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t) // Não é CNPJ
  );
  if (abnormalTokens.length >= 3) {
    return false;
  }

  // Palavras com maiúsculas anômalas no meio (ex: "DiRETQRIA", "SANTOns", "Assiratua", "GRANDEJ")
  const weirdCaseWords = bodyText.match(/\b[a-z]{1,2}[A-Z]{2,}[a-z]*\b|\b[A-Z]{2,}[a-z]+[A-Z]+\b/g) || [];
  if (weirdCaseWords.length >= 3) {
    return false;
  }

  if (/[/\\|]{10,}/.test(bodyText)) {
    return false; // Rejeita ruídos extremos de scanner corrompido
  }

  // Símbolos de ruído real do OCR
  const noiseSymbols = (bodyText.match(/[•■~¤¢¶*«»§]/g) || []).length;
  if (noiseSymbols / bodyText.length > 0.03 && bodyText.length > 50) {
    return false;
  }

  // Conta caracteres alfabéticos em português/inglês
  const letters = (bodyText.match(/[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g) || []).length;
  if (letters < 20) return false;

  // Letras devem representar pelo menos 35% do texto total em textos normais digitais (formulários e tabelas numéricas).
  if (letters / bodyText.length < 0.35) {
    return false;
  }

  // Verifica se possui pelo menos 8 palavras de comprimento mínimo de 3 caracteres
  const words = bodyText.split(/\s+/).filter(w => w.length >= 3);
  if (words.length < 8) return false;

  return true;
}

export function detectFailedPages(text: string): number[] {
  if (!text || typeof text !== "string") return [];
  const failedPages: number[] = [];

  // 1. Erro crítico explícito ou falha na página
  const r1 = /(?:ERRO\s+CR[ÍI]TICO|FALHA\s+CR[ÍI]TICA)\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
  let m;
  while ((m = r1.exec(text)) !== null) {
    failedPages.push(parseInt(m[1], 10));
  }

  // 2. Página explicitamente indicada como pulada, corrompida ou com falha (estrutural ou de extração)
  const r2 = /\[?P[ÁA]GINA\s+(\d+)[^\]\n]*\b(?:PULADA|FALHOU|CORROMPIDA|FALHA\s+ESTRUTURAL|FALHA\s+NA\s+EXTRA[ÇC][ÃA]O)\b/gi;
  while ((m = r2.exec(text)) !== null) {
    failedPages.push(parseInt(m[1], 10));
  }

  // 3. Marcador de falha na IA ou OCR com 0% / falha explícita
  const r3 = /\[P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO\s*\(\s*(?:0%|FALHA|ERRO)/gi;
  while ((m = r3.exec(text)) !== null) {
    failedPages.push(parseInt(m[1], 10));
  }

  // 4. Aviso de texto truncado por limite de tokens: fica DENTRO do bloco da página, não no cabeçalho,
  // então associa cada aviso ao cabeçalho [PÁGINA N ...] mais próximo que vem antes dele no texto.
  const truncMarker = /\[⚠️\s*TEXTO\s+TRUNCADO/gi;
  const headerRegex = /\[P[ÁA]GINA\s+(\d+)\s*-/gi;
  while ((m = truncMarker.exec(text)) !== null) {
    const truncIndex = m.index;
    headerRegex.lastIndex = 0;
    let lastPageNum: number | null = null;
    let hm;
    while ((hm = headerRegex.exec(text)) !== null) {
      if (hm.index > truncIndex) break;
      lastPageNum = parseInt(hm[1], 10);
    }
    if (lastPageNum !== null) {
      failedPages.push(lastPageNum);
    }
  }

  return [...new Set(failedPages)].sort((a, b) => a - b);
}

export function getRealConfidence(text, fallbackConfidence) {
  if (!text || typeof text !== 'string') return fallbackConfidence || 0;
  
  const textLower = text.toLowerCase();
  
  // Se o texto explicitamente disser "ERRO CRÍTICO" ou similar, confiança é 0
  if (textLower.includes('erro crítico') || textLower.includes('erro critico') || textLower.includes('pagina pulada') || textLower.includes('página pulada')) {
    return 0;
  }

  // Se o texto já foi refinado pela IA ou é digital nativo, a confiabilidade real dele é excelente (98% a 100%)
  const isAlreadyRefinedOrDigital = 
    textLower.includes('digital nativo') || 
    textLower.includes('texto digital nativo') || 
    textLower.includes('recuperado via ia') || 
    textLower.includes('refinado via ia') || 
    textLower.includes('ia jurídica') || 
    textLower.includes('ia juridica') || 
    textLower.includes('tramitasign') || // Documentos assinados digitalmente e estruturados
    textLower.includes('clicksign') ||
    textLower.includes('docusign') ||
    textLower.includes('assinatura eletrônica') ||
    textLower.includes('assinatura eletronica') ||
    textLower.includes('comprovante de protocolo') ||
    textLower.includes('carta de concessão') ||
    textLower.includes('declaração de hipossuficiência') ||
    textLower.includes('declaracao de hipossuficiencia') ||
    textLower.includes('processo administrativo');

  // Vamos analisar a qualidade real do texto
  // Removemos as tags de estrutura de página para não interferir no cálculo
  let cleanText = text.replace(/\[P[ÁA]GINA\s+\d+\s*-\s*[^\]]+\]/gi, '');
  cleanText = cleanText.replace(/\[RECUPERADO VIA IA JURÍDICA\]/gi, '');
  cleanText = cleanText.replace(/\[TEXTO DIGITAL NATIVO\]/gi, '');
  cleanText = cleanText.replace(/\[OCR BRUTO \(\d+%\)\]/gi, '');
  
  const totalLength = cleanText.length;
  if (totalLength < 10) {
    return 0; // Praticamente vazio
  }

  // Criamos uma versão limpa de avaliação (removendo markdown, tabelas e divisórias decorativas)
  // para que símbolos legítimos de formatação/layout não baixem falsamente a pontuação.
  let evalText = cleanText;

  // Remove linhas de tabelas markdown (contendo '|')
  evalText = evalText.split('\n').filter(line => !line.includes('|')).join('\n');

  // Remove caracteres decorativos de linhas divisórias comuns
  evalText = evalText.replace(/[─═━┼┤├┬┴_=-]{3,}/g, ' ');

  // Remove marcadores de lista, negrito, títulos do markdown
  evalText = evalText.replace(/[\*#>`~•■]/g, ' ');

  // 1. Proporção de símbolos e caracteres especiais ruidosos na versão de avaliação
  const totalSymbols = (evalText.match(/[-=_+•■~|\\#§¤¢¶*\[\]{}()<>]/g) || []).length;
  const hifensEqualsUnderscores = (evalText.match(/[-=_]{3,}/g) || []).length; // Sequências de tabelas escaneadas
  const symbolRatio = evalText.length > 0 ? totalSymbols / evalText.length : 0;

  // 2. Proporção de letras normais em relação ao comprimento total (excluindo espaços)
  const letters = (evalText.match(/[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g) || []).length;
  const spaces = (evalText.match(/\s/g) || []).length;
  const nonSpaceLength = evalText.length - spaces;
  const letterRatioOfNonSpace = nonSpaceLength > 0 ? letters / nonSpaceLength : 0;

  // 3. Proporção de palavras corrompidas (que misturam letras e números, ou têm pontuação interna estranha)
  const words = evalText.split(/\s+/).filter(w => w.trim().length > 0);
  let corruptWordsCount = 0;
  let validPortugueseCommonCount = 0;
  
  // Lista de palavras em português ultra comuns que confirmam que o texto faz sentido
  const commonWords = new Set([
    'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'um', 'uma', 'com', 'para', 'por', 'que', 'se', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'ou', 'sua', 'seu', 'suas', 'seus', 'esta', 'este', 'isso', 'esteve', 'como', 'mais', 'não', 'sim', 'doença', 'médico', 'medico', 'laudo', 'processo', 'autor', 'réu', 'reu', 'direito', 'justiça', 'justica', 'lei', 'artigo', 'art', 'arts', 'civis', 'advogado', 'advogada', 'social', 'previdenciário', 'previdenciario', 'trabalhista', 'trt', 'tribunal', 'federal', 'inss', 'benefício', 'beneficio', 'aposentadoria', 'auxílio', 'auxilio',
    'declaro', 'declaração', 'declaracao', 'hipossuficiência', 'hipossuficiencia', 'pobreza', 'custas', 'despesas', 'assinante', 'assinatura', 'eletrônica', 'eletronica', 'certificado', 'documento', 'signatário', 'signatario', 'eventos', 'validade', 'jurídica', 'juridica', 'brasileiro', 'brasileira', 'solteiro', 'solteira', 'estudante', 'residente', 'domiciliado', 'domiciliada', 'assistente', 'genitora', 'termo', 'termos', 'sustento', 'família', 'familia', 'fins', 'próprio', 'proprio', 'condições', 'condicoes', 'rio', 'janeiro'
  ]);

  words.forEach(w => {
    const cleanWord = w.toLowerCase().replace(/[,.:;()]/g, '');

    // Ignora tokens técnicos e jurídicos legítimos para não penalizar falsamente:
    // 1. Hashes hexadecimais (SHA-256, MD5) ou UUIDs
    const isHexOrUuid = /^[0-9a-fA-F-]+$/.test(w) && w.length >= 8;
    // 2. Emails (ex: juliana26rodriguescosta@gmail.com)
    const isEmail = w.includes('@') || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(w);
    // 3. URLs ou domínios (ex: https://tramitasign.com.br)
    const isUrl = /^https?:\/\//i.test(w) || /\.(com|br|gov|jus|org|net|edu)/i.test(w);
    // 4. Termos de user-agent, sistema ou fingerprints
    const isTechHeader = /^(?:chrome|mozilla|applewebkit|safari|khtml|android|mobile|fingerprint|gmt|sha-\d+)/i.test(w);
    // 5. Numeração de leis, CPFs, RGs, CEPs ou artigos (ex: 148.102.687-99, 14.063/2020)
    const isLegalNumOrCode = /^(?:art|arts|lei|mp|oab|resp|fls|rg|cpf|cnpj|cep)[.:/]?/i.test(w) || /^[\d./-]+$/.test(w);
    // 6. Coordenadas geográficas ou horários
    const isCoordsOrTime = /^[+-]?\d+[\d.,/:-]+\d+$/.test(w);

    if (isHexOrUuid || isEmail || isUrl || isTechHeader || isLegalNumOrCode || isCoordsOrTime) {
      // Token técnico/jurídico legítimo
      return;
    }

    const hasLetters = /[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/.test(w);
    const hasDigits = /[0-9]/.test(w);
    const hasSymbols = /[-_~=•■|\\/§¤*]/.test(w);
    
    // Se a palavra mistura letras com números de forma ruidosa (ex: Munlcip10, u.u01)
    if (hasLetters && hasDigits && w.length > 2) {
      corruptWordsCount++;
    } 
    // Se a palavra tem símbolos internos e letras (ex: cE_IT_RO_CÃ_RIOC_A_DE)
    else if (hasLetters && hasSymbols && w.length > 3) {
      corruptWordsCount++;
    }
    // Se a palavra for toda estranha (ex: tJnidaOe) - letras misturadas com maiúsculas/minúsculas de forma bizarra
    else if (hasLetters && !hasDigits && !hasSymbols && w.length > 3) {
      const upperCount = (w.match(/[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g) || []).length;
      const lowerCount = (w.match(/[a-záéíóúâêîôûãõç]/g) || []).length;
      if (upperCount > 0 && lowerCount > 0) {
        const isStandardCapitalized = /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]*$/.test(w);
        const isAllCaps = /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]+$/.test(w);
        if (!isStandardCapitalized && !isAllCaps && upperCount > 1 && lowerCount > 1) {
          corruptWordsCount++;
        }
      }
    }

    if (commonWords.has(cleanWord)) {
      validPortugueseCommonCount++;
    }
  });

  const corruptWordRatio = words.length > 0 ? corruptWordsCount / words.length : 0;
  
  // Vamos calcular uma nota baseada nesses fatores
  let score = 100;

  // Penalização por excesso de símbolos (se symbolRatio for maior que 3%)
  if (symbolRatio > 0.03) {
    const penalty = Math.min(35, (symbolRatio - 0.03) * 150);
    score -= penalty;
  }

  // Penalização por sequências longas de linhas ou tabelas ruidosas
  if (hifensEqualsUnderscores > 0) {
    score -= Math.min(10, hifensEqualsUnderscores * 2);
  }

  // Penalização por baixa taxa de letras normais (se letterRatioOfNonSpace for menor que 70%)
  if (letterRatioOfNonSpace < 0.70) {
    const letterPenalty = Math.min(35, (0.70 - letterRatioOfNonSpace) * 80);
    score -= letterPenalty;
  }

  // Penalização por palavras corrompidas (se corruptWordRatio for maior que 2%)
  if (corruptWordRatio > 0.02) {
    const corruptPenalty = Math.min(50, (corruptWordRatio - 0.02) * 300);
    score -= corruptPenalty;
  }

  // Bônus se contiver muitas palavras em português ultra comuns
  if (words.length > 10) {
    const commonWordRatio = validPortugueseCommonCount / words.length;
    if (commonWordRatio > 0.12) {
      score += 5;
    } else if (commonWordRatio < 0.03 && corruptWordRatio > 0.05) {
      score -= 15;
    }
  }

  if (textLower.includes('digital nativo') || textLower.includes('texto digital nativo')) {
    score = Math.min(100, score + 10);
  } else if (textLower.includes('recuperado via ia jurídica') || textLower.includes('ia jurídica') || textLower.includes('ia juridica') || textLower.includes('refinado via ia')) {
    if (score >= 75) {
      score = Math.max(92, Math.min(99, score + 5));
    }
  }

  // Se o documento é sabidamente estruturado/jurídico e possui texto real com vocabulário válido
  if (isAlreadyRefinedOrDigital && evalText.length > 120 && corruptWordRatio < 0.03) {
    score = Math.max(96, score);
  }

  if (fallbackConfidence !== undefined && fallbackConfidence < score && fallbackConfidence > 0) {
    // Só atenua caso haja real índice de palavras corrompidas
    if (corruptWordRatio > 0.04) {
      score = (score * 2 + fallbackConfidence) / 3;
    }
  }

  const ilegivelCount = (textLower.match(/ileg[íi]vel/g) || []).length;
  if (ilegivelCount > 0) {
    score -= Math.min(25, ilegivelCount * 4);
  }

  return Math.min(100, Math.max(5, Math.round(score)));
}

export function extractNamesFromText(text: string): string[] {
  // Matches typical proper noun sequences
  const regex = /\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+(?:da|de|do|dos|das|e)\s+[A-ZÀ-Ý][a-zà-ÿ]+|\s+[A-ZÀ-Ý][a-zà-ÿ]+){1,4}\b/g;
  const matches = text.match(regex) || [];
  
  const map: { [key: string]: number } = {};
  matches.forEach(m => {
    const name = m.trim();
    if (name.length < 8 || name.length > 40) return;
    
    // Avoid common Brazilian stop phrases in legal texts that are capitalized
    if (/^(P[áa]gina|Documento|Originalmente|Escaneado|T[íi]tulo|Tipo|Área|Obs|Data|Rep[úu]blica|Governo|Estado|Federal|Registro|Geral|Certificado|Assinado|Assinatura|Identificador|TramitaSign|Biometria|Hist[óo]rico|Eventos|Validade|Jur[íi]dica|Anexo|Catar|Fatura|Claro|Seu|Plano|Subtotal|Total|Avisos|Autentica|Bases|Painel|Cidad[ãa]o|Membros|Filiação|Órgão|Emissão|Válida|Territ[óo]rio|Nacional|Lei|Início|Fim|Consultas|Tratamentos|Alimentação|Proteção|Espécie|Interessados|Procuradores|Informações|Anexos|Tamanho|Arquivo|Descri|Enviado|Autenticado|Despacho|Prezado|Senhor|Passos|Atenção|Aplicativo|Telefone|Declaro|Sei|Secretaria|Inss|Cnis|Lista|Elos|Relações|Renda|RQS|Carta|Concessão|Memória|Cálculo|Presidente|Canais|WhatsApp|Código|Fidelidade)/i.test(name)) {
      return;
    }
    map[name] = (map[name] || 0) + 1;
  });
  
  // Sort by frequency and limit to avoid huge payload
  return Object.keys(map)
    .sort((a, b) => map[b] - map[a])
    .slice(0, 30);
}

export function cleanRepeatedWordsInName(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  // 1. Detectar e remover repetição de frases/sobrenomes compostos consecutivos
  // Ex: "SARA JANE MARIANO BHERING MARIANO BHERING" -> "SARA JANE MARIANO BHERING"
  // Ex: "MARIANO BHERING MARIANO BHERING" -> "MARIANO BHERING"
  let prev = '';
  let iterations = 0;
  while (prev !== cleaned && iterations < 5) {
    prev = cleaned;
    iterations++;
    cleaned = cleaned.replace(/\b([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){1,4})\s+\1\b/gi, '$1');
    cleaned = cleaned.replace(/\b([A-Za-zÀ-ÿ]{3,})\s+\1\b/gi, '$1');
  }
  return cleaned.trim();
}

export function applyLocalOCRCorrections(text: string): string {
  let temp = text;
  const corrections: [RegExp, string][] = [
    [/\btJnidaOe\b/g, "Unidade"],
    [/\bMunlcip10\b/gi, "Município"],
    [/\bMunlclp10\b/gi, "Município"],
    [/\bMinlsterio\b/gi, "Ministério"],
    [/\bPrevidoncia\b/gi, "Previdência"],
    [/\bprevidoncia\b/gi, "previdência"],
    [/\bNlcl\b/g, "NIT"],
    [/\bNlC\b/g, "NIT"],
    [/\bAsslss\b/gi, "Assiste"],
    [/\bconcedldo\b/gi, "concedido"],
    [/\bbeneficlo\b/gi, "benefício"],
    [/\bBeneficlo\b/gi, "Benefício"],
    [/\bpetete\b/g, "pelo"],
    [/\bflf\b/g, "fls."],
    [/\bu\.u01\b/gi, ""],
    [/\bS[íi]tio dos Campos\b/gi, "Sítio dos Gansos"],
    [/_{4,}/g, "____"],
    [/-{4,}/g, "----"],
    [/\={4,}/g, "====="]
  ];

  corrections.forEach(([regex, replacement]) => {
    temp = temp.replace(regex, replacement);
  });
  
  // Limpeza de repetições consecutivas de nomes no corpo do texto
  temp = cleanRepeatedWordsInName(temp);
  return temp;
}
