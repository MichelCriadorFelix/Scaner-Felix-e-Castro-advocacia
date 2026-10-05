// @ts-nocheck

// ── Sistema de Cache Inteligente por Hash SHA-256 ────────────────────────────
export async function calculateDocumentHash(file: File | Blob): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    const name = (file as any)?.name || 'document';
    return `fallback_${name}_${file.size}_${file.type}`;
  }
}

export interface CachedDocumentOCR {
  hash: string;
  text: string;
  confidence: number;
  chars_count: number;
  words_count: number;
  timestamp: number;
  fileName?: string;
}

export const OCR_CACHE_PREFIX = "lexscan_hash_cache_";
export const OCR_CACHE_INDEX_KEY = "lexscan_hash_cache_index";

export function getCachedOCR(hash: string): CachedDocumentOCR | null {
  if (!hash) return null;
  try {
    const raw = localStorage.getItem(`${OCR_CACHE_PREFIX}${hash}`);
    if (!raw) return null;
    const parsed: CachedDocumentOCR = JSON.parse(raw);
    if (!parsed || !parsed.text || parsed.text.trim().length === 0) return null;
    
    // Segurança: Não aceita cache com erro crítico ou processo pausado
    if (
      parsed.confidence < 75 ||
      /ERRO\s+CR[ÍI]TICO|P[ÁA]GINA\s+PULADA|PROCESSO PAUSADO PELO USUÁRIO/i.test(parsed.text)
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function setCachedOCR(hash: string, text: string, confidence: number, fileName?: string): void {
  if (!hash || !text || text.trim().length === 0) return;
  // Segurança: Nunca salvar no cache resultados incompletos ou com erro
  if (
    confidence < 75 ||
    /ERRO\s+CR[ÍI]TICO|P[ÁA]GINA\s+PULADA|PROCESSO PAUSADO PELO USUÁRIO/i.test(text)
  ) {
    return;
  }

  try {
    const entry: CachedDocumentOCR = {
      hash,
      text,
      confidence,
      chars_count: text.length,
      words_count: text.split(/\s+/).filter(Boolean).length,
      timestamp: Date.now(),
      fileName
    };
    localStorage.setItem(`${OCR_CACHE_PREFIX}${hash}`, JSON.stringify(entry));

    // Mantém índice LRU (limita a até 300 documentos no cache local)
    let index: string[] = [];
    try {
      index = JSON.parse(localStorage.getItem(OCR_CACHE_INDEX_KEY) || "[]");
    } catch(e) {}
    index = index.filter((h: string) => h !== hash);
    index.unshift(hash);
    if (index.length > 300) {
      const removed = index.slice(300);
      removed.forEach((h: string) => localStorage.removeItem(`${OCR_CACHE_PREFIX}${h}`));
      index = index.slice(0, 300);
    }
    localStorage.setItem(OCR_CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn("[OCR Cache] Não foi possível gravar no cache local:", e);
  }
}
