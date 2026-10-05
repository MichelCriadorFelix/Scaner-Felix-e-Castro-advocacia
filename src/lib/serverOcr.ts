// @ts-nocheck
import { supabase } from './supabaseClient';
import { getSafeGeminiModel } from './geminiModels';
import { isForcePaidKeyEnabled } from './apiKeys';
import { ocrContextClientName } from './handwritingMode';

// ── Leitura no servidor (/api/ocr-page e /api/gemini-text) ──────────────────────────────────
// As chaves Gemini ficam só no servidor; o estado de cota/espera de cada uma é compartilhado entre abas e sócios.

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

// Lê a página no servidor. Retorna { text, usedKey: null, model, quality }; lança erro (com o motivo) se não deu.
export async function extractPageViaServer(
  blob: Blob,
  opts: { hard: boolean; bestFirst: boolean; onProgress?: (p: number | null, msg: string) => void }
) {
  const { hard, bestFirst, onProgress } = opts;
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sem sessão: entre no app de novo para usar a leitura por IA.');
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
  } catch (e: any) {
    if (window.lexscan_abort) throw e;
    throw new Error('Não consegui falar com o servidor de leitura: ' + (e?.message || e));
  } finally {
    clearInterval(poll);
    clearTimeout(hardTimeout);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json.text) {
    console.warn(`[Leitura servidor] Falhou (HTTP ${res.status}):`, json?.error, json?.attempts);
    throw new Error(`Leitura no servidor falhou: ${json?.error || 'HTTP ' + res.status}`);
  }
  console.log(`[Leitura servidor] ${json.model} em ${Math.round(json.ms / 1000)}s${json.hard ? ' (manuscrito difícil)' : ''}:`, (json.steps || []).join(' | ') || 'ok', json.attempts);
  if (onProgress) onProgress(95, `Leitura concluída no servidor (${json.model}).`);
  return { text: json.text, usedKey: null, model: json.model, quality: json.quality };
}

// Chamada de TEXTO ao Gemini pelo servidor (revisão, auditoria, compilação). O servidor cuida de chaves e
// modelos; aqui só se pede e se espera. Lança erro se não conseguir (quem chama decide o que fazer).
export async function generateTextViaServer(opts: {
  text: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinking?: 'low' | 'medium' | 'high' | null;
  json?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sem sessão: entre no app de novo para usar a IA.');
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 115000);
  try {
    const res = await fetch('/api/gemini-text', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...opts, preferredModel: getSafeGeminiModel(), includePaid: isForcePaidKeyEnabled() }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.text) {
      throw new Error(json?.error || `Servidor respondeu HTTP ${res.status}`);
    }
    return String(json.text);
  } finally {
    clearTimeout(hardTimeout);
  }
}

// Estado das chaves como o SERVIDOR enxerga (compartilhado entre abas e sócios). Nunca traz a chave inteira,
// só os 4 últimos caracteres. Retorna [] se não deu pra consultar.
export async function fetchServerKeyStatus(): Promise<any[]> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return [];
    const res = await fetch('/api/ocr-page', { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => null);
    return res.ok && Array.isArray(json?.keys) ? json.keys : [];
  } catch (e) {
    return [];
  }
}
