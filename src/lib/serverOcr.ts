// @ts-nocheck
import { supabase } from './supabaseClient';
import { getSafeGeminiModel } from './geminiModels';
import { isForcePaidKeyEnabled } from './apiKeys';
import { ocrContextClientName } from './handwritingMode';

// ── Motor de leitura no servidor (/api/ocr-page) ────────────────────────────────────────────
// As chaves Gemini ficam no servidor e o estado de cota/espera de cada uma é compartilhado entre
// abas e sócios. Ligado por padrão; localStorage.lexscan_engine='local' desliga (volta ao motor do navegador). Qualquer falha aqui devolve null e o motor local de sempre assume.
export function isServerEngineEnabled(): boolean {
  try {
    return localStorage.getItem('lexscan_engine') !== 'local';
  } catch (e) {
    return true;
  }
}

// A Vercel recusa corpo de requisição acima de ~4,5 MB. Reduz a imagem (JPEG) até caber em ~4 M de caracteres base64.
const MAX_BASE64_CHARS = 4_000_000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shrinkBlobToFit(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  let base64 = await blobToBase64(blob);
  let mimeType = blob.type || 'image/jpeg';
  if (base64.length <= MAX_BASE64_CHARS) return { base64, mimeType };
  const bitmap = await createImageBitmap(blob);
  let scale = Math.min(1, Math.sqrt(MAX_BASE64_CHARS / base64.length) * 0.9);
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(200, Math.round(bitmap.width * scale));
    canvas.height = Math.max(200, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    base64 = dataUrl.split(',')[1] || '';
    mimeType = 'image/jpeg';
    if (base64.length <= MAX_BASE64_CHARS) break;
    scale *= 0.8;
  }
  bitmap.close?.();
  return { base64, mimeType };
}

// Lê a página no servidor. Retorna { text, usedKey: null, model, quality } ou null se não deu (quem chamou cai no motor local).
export async function extractPageViaServer(
  blob: Blob,
  opts: { hard: boolean; bestFirst: boolean; onProgress?: (p: number | null, msg: string) => void }
) {
  const { hard, bestFirst, onProgress } = opts;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      console.warn('[Motor servidor] Sem sessão — usando o motor local.');
      return null;
    }
    const { base64, mimeType } = await shrinkBlobToFit(blob);
    if (onProgress) onProgress(null, hard ? 'Manuscrito difícil: lendo no servidor (2 leituras + conferência)...' : 'Lendo a página no servidor...');

    const controller = new AbortController();
    const poll = setInterval(() => { if (window.lexscan_abort) controller.abort(); }, 500);
    const hardTimeout = setTimeout(() => controller.abort(), 295000);
    let res: Response;
    try {
      res = await fetch('/api/ocr-page', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          hard,
          bestFirst,
          clientName: ocrContextClientName || '',
          preferredModel: getSafeGeminiModel(),
          includePaid: isForcePaidKeyEnabled(),
        }),
      });
    } finally {
      clearInterval(poll);
      clearTimeout(hardTimeout);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.text) {
      console.warn(`[Motor servidor] Falhou (HTTP ${res.status}): ${json?.error || 'sem detalhe'}`, json?.attempts || '');
      return null;
    }
    console.log(`[Motor servidor] ${json.model} em ${Math.round(json.ms / 1000)}s${json.hard ? ' (manuscrito difícil)' : ''}:`, (json.steps || []).join(' | ') || 'ok', json.attempts);
    if (onProgress) onProgress(95, `Leitura concluída no servidor (${json.model}).`);
    return { text: json.text, usedKey: null, model: json.model, quality: json.quality };
  } catch (e: any) {
    if (window.lexscan_abort) throw e;
    console.warn('[Motor servidor] Erro — usando o motor local:', e?.message || e);
    return null;
  }
}
