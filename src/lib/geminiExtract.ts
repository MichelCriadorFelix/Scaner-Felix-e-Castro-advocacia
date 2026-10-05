// @ts-nocheck
import { extractPageViaServer } from './serverOcr';
import { getPadraoOuroPrompt } from './prompts';
import { getSelectedGeminiModel, NVIDIA_NEMOTRON_MODEL, MISTRAL_OCR_MODEL } from './geminiModels';
import { containsDegenerateRepetition, getRealConfidence } from './textQuality';
import { enhanceImageForGemini } from './image';
import { isHardHandwritingEnabled } from './handwritingMode';
import { backoffDelay, withTimeout } from './async';

// Transcreve uma página via NVIDIA NIM (Nemotron 3 Nano Omni) — provedor alternativo, gratuito,
// usado quando o advogado escolhe essa opção no seletor de modelo. API compatível com OpenAI
// (chat completions), diferente do SDK do Google — por isso é uma implementação própria, sem
// reutilizar a rotação de múltiplas chaves do Gemini (usa 1 única chave, de uma conta separada).
export async function extractPageWithNvidiaNemotron(blob: Blob, onProgress?: (p: number, msg: string) => void): Promise<{ text: string; usedKey: string }> {
  const base64 = await new Promise<string>((r) => {
    const reader = new FileReader();
    reader.onload = () => r((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });

  const prompt = getPadraoOuroPrompt();
  const mimeType = blob.type || "image/jpeg";
  const MAX_ATTEMPTS = 3;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
    try {
      if (onProgress) onProgress(30, `NVIDIA Nemotron: lendo página (tentativa ${attempt}/${MAX_ATTEMPTS})...`);
      // Chama nossa própria ponte de servidor (/api/nvidia-transcribe), não a NVIDIA direto —
      // a API da NVIDIA bloqueia chamadas vindas do navegador (CORS), diferente da do Gemini.
      // Medido no Playground oficial da NVIDIA: uma transcrição real gera texto a ~41-54
      // tokens/segundo (velocidade fixa do modelo) — uma página densa pode legitimamente
      // levar 40-60s+ só pra gerar a resposta. Limite de 175s (um pouco maior que os 170s
      // do servidor) dá folga suficiente pra isso ser normal, sem travar pra sempre se
      // algo realmente travar de vez.
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 175000);
      let res: Response;
      try {
        res = await fetch("/api/nvidia-transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64,
            mimeType,
            systemPrompt: prompt,
            userText: "Leia a imagem e realize a transcrição literal, verbatim, 100% integral sob a orientação do Transcritor de Elite configurado no sistema.",
          }),
          signal: timeoutController.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const err: any = new Error(data?.error || `NVIDIA NIM HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      const text = (data?.text || "").trim();

      if (!text) {
        throw new Error("NVIDIA NIM retornou resposta vazia.");
      }
      if (containsDegenerateRepetition(text)) {
        lastErr = new Error("Resposta com repetição degenerada (NVIDIA).");
        continue;
      }

      if (onProgress) onProgress(95, "NVIDIA Nemotron: transcrição concluída.");
      return { text, usedKey: "nvidia-nim" };
    } catch (e: any) {
      lastErr = e;
      const status = e?.status;
      const msg = String(e?.message || e || "").toLowerCase();
      const isTimeout = e?.name === "AbortError" || msg.includes("abort");
      // 429 (limite de requisições), 503/overloaded, ou estourou o tempo (60s): espera um
      // pouco e tenta de novo — nunca fica travado pra sempre esperando resposta.
      if (isTimeout || status === 429 || status === 503 || status === 504 || msg.includes("429") || msg.includes("503") || msg.includes("504") || msg.includes("overloaded") || msg.includes("rate limit") || msg.includes("timeout")) {
        console.warn(`[NVIDIA Nemotron] Tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${isTimeout ? "tempo esgotado (60s)" : msg.slice(0, 80)}). Aguardando antes de tentar de novo...`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      // Erro definitivo (ex: chave inválida) — não adianta insistir.
      throw e;
    }
  }

  throw lastErr || new Error("NVIDIA NIM: falha após múltiplas tentativas.");
}

// Mistral OCR (plano gratuito): OCR dedicada via proxy serverless (api/mistral-ocr.js) — só
// extrai o texto bruto da página, sem aplicar as regras do Padrão Ouro (isso fica pro botão
// manual "Refinar com IA", se o advogado quiser, já que aqui não tem chamada de raciocínio).
export async function extractPageWithMistralOCR(blob: Blob, onProgress?: (p: number, msg: string) => void): Promise<{ text: string; usedKey: string; confidence?: number | null }> {
  const toBase64 = (b: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(b);
  });
  let base64: string = await toBase64(blob);

  // A Vercel recusa (HTTP 413, antes mesmo de chegar na função — por isso nenhuma chave da
  // Mistral chega a ser tentada) qualquer requisição acima de ~4,5MB. Imagem em alta
  // resolução de página escaneada densa pode passar disso: reduz aos poucos até caber.
  const MAX_BASE64_CHARS = 4_000_000;
  for (const [dim, quality] of [[2200, 0.88], [1900, 0.85], [1600, 0.8]] as [number, number][]) {
    if (base64.length <= MAX_BASE64_CHARS) break;
    const smaller = await enhanceImageForGemini(blob, dim, quality);
    base64 = await toBase64(smaller);
  }

  // OCR dedicada responde em poucos segundos — 2 tentativas de 25s cada (nunca 3x60s como
  // um modelo de raciocínio) pra não segurar o fallback pro Gemini por minutos à toa.
  const MAX_ATTEMPTS = 2;
  let lastErr: any = null;
  let usedSmallImage = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
    // Só avisa na tela quando é de fato uma retentativa (attempt > 1) — na maioria das
    // páginas a 1ª tentativa já resolve, e sobrescrever a mensagem "Pág X/Y: ..." (que TEM
    // o número da página) por uma genérica sem número é o que fazia parecer travado.
    if (onProgress && attempt > 1) {
      onProgress(null, `Mistral OCR: repetindo leitura da página (tentativa ${attempt}/${MAX_ATTEMPTS})...`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('/api/mistral-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ base64, mimeType: blob.type || 'image/jpeg' }),
      });
      clearTimeout(timeout);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.attempts) console.warn(`[Mistral OCR] Servidor tem ${data.keysConfigured} chave(s) configurada(s). Tentativas:`, data.attempts);
        throw new Error(data?.error || `Mistral OCR HTTP ${res.status}`);
      }

      const text = data?.text || '';

      // Mesma proteção que o caminho do Gemini já tem: descarta e tenta de novo se a
      // resposta travou num loop de repetição (ex: logotipo/marca d'água mal lida virando
      // um bloco de lixo repetido centenas de vezes).
      if (text && containsDegenerateRepetition(text)) {
        console.warn(`[Mistral OCR] Tentativa ${attempt}/${MAX_ATTEMPTS}: resposta em loop de repetição. Descartando e tentando de novo...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      consecutiveMistralFailures = 0;
      if (onProgress) onProgress(null, "Mistral OCR: transcrição concluída.");
      return { text, usedKey: "mistral-ocr", confidence: typeof data?.confidence === 'number' ? data.confidence : null };
    } catch (e: any) {
      clearTimeout(timeout);
      lastErr = e;
      const isTimeout = e?.name === 'AbortError';
      const msg = String(e?.message || e || '').toLowerCase();
      // Cota/chave da Mistral esgotada ou recusada (todas as chaves do servidor já foram
      // tentadas lá): repetir só gasta tempo. Entra em pausa e as próximas páginas vão direto
      // pro Gemini, em vez de cada uma esperar ~50s pra descobrir a mesma coisa.
      const isAuthProblem = msg.includes('401') || msg.includes('403') || msg.includes('unauthorized');
      // 429 em chave NOVA, nas duas contas, logo na 1ª página (visto na prática depois que a
      // imagem passou a ir em ~300 DPI) aponta pro tamanho da imagem, não pra cota: antes de
      // desistir, reenvia UMA vez no tamanho antigo (1600px), que já funcionava.
      if (!isAuthProblem && !usedSmallImage && (msg.includes('429') || msg.includes('rate limit'))) {
        usedSmallImage = true;
        console.warn('[Mistral OCR] 429 com a imagem grande — reenviando a página em tamanho menor (1600px) antes de desistir...');
        base64 = await toBase64(await enhanceImageForGemini(blob, 1600, 0.82));
        continue;
      }
      if (msg.includes('429') || msg.includes('401') || msg.includes('403') || msg.includes('rate limit') || msg.includes('quota') || msg.includes('unauthorized') || msg.includes('capacity')) {
        startMistralCooldown(msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') ? 10 * 60 * 1000 : 2 * 60 * 1000, 'cota/chave recusada');
        throw e;
      }
      if (isTimeout || msg.includes('503') || msg.includes('timeout')) {
        console.warn(`[Mistral OCR] Tentativa ${attempt}/${MAX_ATTEMPTS} falhou. Aguardando antes de tentar de novo...`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw e;
    }
  }

  throw lastErr || new Error("Mistral OCR: falha após múltiplas tentativas.");
}

// Pausa global da Mistral: quando a cota acaba ou a chave é recusada (ou ela falha várias
// páginas seguidas), todas as páginas seguintes pulam direto pro Gemini por alguns minutos.
export let mistralCooldownUntil = 0;
export let consecutiveMistralFailures = 0;
export function startMistralCooldown(ms: number, reason: string): void {
  mistralCooldownUntil = Date.now() + ms;
  console.warn(`[Mistral OCR] Em pausa por ${Math.round(ms / 60000)} min (${reason}) — páginas vão direto pro Gemini.`);
}
export function isMistralInCooldown(): boolean {
  return Date.now() < mistralCooldownUntil;
}

// Decide se o texto que a Mistral OCR devolveu pra ESTA página é confiável o bastante, ou
// se é melhor cair pro Gemini gratuito como reforço automático (ex: formulário manuscrito
// denso que confundiu a OCR dedicada). Dois sinais concretos, achados em teste real:
// 1. Nota de confiança geral (a mesma heurística já usada em outras partes do app) baixa.
// 2. Caractere chinês/japonês/coreano no meio do texto — não tem NENHUMA razão de aparecer
//    num documento jurídico brasileiro; observado como alucinação real da Mistral numa
//    página de letra manuscrita difícil.
// 3. Confiança REAL devolvida pela própria Mistral (confidence_scores_granularity: 'page'),
//    quando disponível — mais precisa que a heurística de texto, usada em vez dela.
//
// containsDegenerateRepetition (usada pelo Gemini) é propositalmente exigente (40+ repetições
// / 2000+ caracteres) pra não confundir tabela legítima com loop de verdade — mas o tipo de
// ruído que a Mistral gera ao confundir um logotipo/marca d'água no cabeçalho é bem menor
// (ex: "HUMANITARIAN" repetido ~28x, ~300-500 caracteres), passando despercebido por aquele
// limite. Checagem mais sensível, só usada aqui.
export function containsShortRepetitionNoise(text: string): boolean {
  if (!text || text.length < 100) return false;
  return /(.{2,40})\1{9,}/.test(text.slice(0, 50000));
}

export function isMistralResultTrustworthy(text: string, realConfidence?: number | null): boolean {
  if (!text || text.trim().length < 20) return false;
  if (/[一-鿿぀-ヿ가-힯]/.test(text)) return false;
  if (containsShortRepetitionNoise(text)) return false;
  if (typeof realConfidence === 'number' && !Number.isNaN(realConfidence)) {
    // Normaliza: a API pode devolver 0-1 (fração) ou 0-100, dependendo da versão.
    const normalized = realConfidence <= 1 ? realConfidence * 100 : realConfidence;
    return normalized >= 70;
  }
  return getRealConfidence(text) >= 70;
}

// Memória curta de páginas que já falharam na Mistral: outras partes do app têm loops de
// retentativa próprios (ex: reprocessar a página inteira do PDF do zero) que podem re-chamar
// extractPageWithGemini várias vezes seguidas pra MESMA página — sem isso, cada uma dessas
// re-chamadas reinicia a Mistral do zero, gerando dezenas de chamadas desnecessárias numa
// página que já sabemos que ela não dá conta. Uma vez marcada como falha, pula direto pro
// Gemini por alguns minutos, não importa quantas vezes insistirem de fora.
export const recentMistralFailures = new Map<string, number>();
export const MISTRAL_FAILURE_MEMORY_MS = 5 * 60 * 1000;

export async function getBlobFingerprint(blob: Blob): Promise<string> {
  try {
    const sampleSize = Math.min(4096, blob.size);
    const buf = await blob.slice(0, sampleSize).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) hash = (hash * 31 + bytes[i]) | 0;
    return `${blob.size}-${hash}`;
  } catch (e) {
    return `${blob.size}-0`;
  }
}

export function isRecentMistralFailure(fingerprint: string): boolean {
  const ts = recentMistralFailures.get(fingerprint);
  if (!ts) return false;
  if (Date.now() - ts > MISTRAL_FAILURE_MEMORY_MS) {
    recentMistralFailures.delete(fingerprint);
    return false;
  }
  return true;
}

export function markMistralFailure(fingerprint: string): void {
  recentMistralFailures.set(fingerprint, Date.now());
}

export async function extractPageWithGemini(blob, onProgress, goldStandard = true, preferredApiKey: string | null = null, skipMistral: boolean = false, outFlags?: { mistralFailed?: boolean }, forceHard: boolean = false) {
  // forceHard liga o modo "Manuscrito difícil" SÓ pra esta página (releitura automática de página
  // com muitos [ILEGÍVEL]), sem depender do checkbox global — que o advogado pode nem ter marcado.
  const hardMode = forceHard || isHardHandwritingEnabled();
  if (getSelectedGeminiModel() === NVIDIA_NEMOTRON_MODEL) {
    return await extractPageWithNvidiaNemotron(blob, onProgress);
  }
  if (getSelectedGeminiModel() === MISTRAL_OCR_MODEL && !skipMistral) {
    const fingerprint = await getBlobFingerprint(blob);
    if (isMistralInCooldown()) {
      if (onProgress) onProgress(null, "Mistral em pausa (cota/falhas) — usando Gemini direto...");
      if (outFlags) outFlags.mistralFailed = true;
    } else if (isRecentMistralFailure(fingerprint)) {
      console.warn("[Híbrido Mistral+Gemini] Esta página já falhou na Mistral há pouco — pulando direto pro Gemini (evita repetir dezenas de vezes se algo de fora insistir em reprocessar a mesma página).");
      if (onProgress) onProgress(null, "Página já sabidamente difícil pra Mistral — usando Gemini direto...");
      if (outFlags) outFlags.mistralFailed = true;
    } else {
      try {
        const mistralResult = await extractPageWithMistralOCR(blob, onProgress);
        if (isMistralResultTrustworthy(mistralResult.text, mistralResult.confidence)) {
          return mistralResult;
        }
        markMistralFailure(fingerprint);
        if (outFlags) outFlags.mistralFailed = true;
        console.warn("[Híbrido Mistral+Gemini] Página com qualidade suspeita na Mistral OCR (letra manuscrita/formulário denso, provavelmente) — usando Gemini gratuito como reforço só nesta página.");
        if (onProgress) onProgress(null, "Página difícil pra Mistral — usando Gemini gratuito como reforço...");
      } catch (e) {
        markMistralFailure(fingerprint);
        if (++consecutiveMistralFailures >= 3) startMistralCooldown(5 * 60 * 1000, '3 falhas seguidas');
        if (outFlags) outFlags.mistralFailed = true;
        console.warn("[Híbrido Mistral+Gemini] Mistral OCR falhou nesta página — usando Gemini gratuito como reforço:", e);
        if (onProgress) onProgress(null, "Mistral OCR falhou — usando Gemini gratuito como reforço...");
      }
    }
    // Não retornou acima: cai pro fluxo normal do Gemini logo abaixo, só pra ESTA página.
    // A próxima página volta a tentar a Mistral normalmente (a decisão é por página, não global).
  }

  // A leitura é feita no servidor (chaves Gemini, rodízio e cascata ficam lá; o navegador não tem mais chave nenhuma).
  return await extractPageViaServer(blob, { hard: hardMode, bestFirst: forceHard && !isHardHandwritingEnabled(), onProgress });
}
