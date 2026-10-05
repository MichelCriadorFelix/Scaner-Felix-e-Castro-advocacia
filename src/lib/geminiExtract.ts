// @ts-nocheck
import { GoogleGenAI } from "@google/genai";
import { temperatureConfigFor, getThinkingConfigForModel, getSelectedGeminiModel, NVIDIA_NEMOTRON_MODEL, MISTRAL_OCR_MODEL, getModelFallbackCascade, getSafeGeminiModel } from './geminiModels';
import { containsDegenerateRepetition, getRealConfidence, isTruncatedResponse } from './textQuality';
import { getPadraoOuroPrompt } from './prompts';
import { enhanceImageForGemini } from './image';
import { isHardHandwritingEnabled, getHardHandwritingSystemPrompt, buildTranscriptionUserText, readSecondOpinion, verifyHardHandwriting } from './handwritingMode';
import { getSortedApiKeys, isKeyThrottled, getKeyCooldownRemainingMs, KEY_MINUTE_LIMIT, recordKeyMinuteCall, isKeyModelExhausted, isDailyQuotaError, markKeyModelExhausted } from './apiKeys';
import { backoffDelay, withTimeout } from './async';

// Pede pro Gemini CONTINUAR a transcrição da(s) MESMA(s) imagem(ns) a partir de onde parou, em vez de aceitar
// o texto cortado pela metade. imageParts é o array de partes de imagem já usado na chamada original
// (uma imagem para página única, várias para lote). Retorna só o trecho novo transcrito.
export async function continuePageTranscription(
  ai: any,
  model: string,
  imageParts: any[],
  systemPrompt: string,
  partialTextSoFar: string
): Promise<{ text: string; finishReason?: string }> {
  const continuationInstruction = `${systemPrompt}

══════════════════════════════════════════════════
MODO CONTINUAÇÃO (ATENÇÃO MÁXIMA):
══════════════════════════════════════════════════
A transcrição desta MESMA página foi CORTADA no meio por limite de tamanho de resposta. Abaixo está o final do
que você mesmo já transcreveu até agora (pode terminar no meio de uma palavra, frase ou linha de tabela).
Sua tarefa agora é APENAS continuar a transcrição EXATAMENTE de onde ela parou, olhando a imagem de novo.
REGRAS OBRIGATÓRIAS:
1. NÃO repita nada do texto já transcrito abaixo.
2. NÃO reinicie a transcrição do começo da página.
3. Responda SOMENTE com a continuação (o texto novo que vem depois do que já foi transcrito).
4. Se o texto já transcrito terminou no meio de uma palavra, complete a palavra e continue dali.

--- FINAL DO TEXTO JÁ TRANSCRITO (NÃO REPETIR ISTO) ---
${partialTextSoFar.slice(-2500)}
--- FIM DO TRECHO JÁ TRANSCRITO — CONTINUE A PARTIR DAQUI ---`;

  const res = await ai.models.generateContent({
    model,
    contents: [
      { text: "Continue a transcrição literal desta(s) imagem(ns) exatamente de onde parou, conforme as instruções do sistema. Não repita o que já foi transcrito." },
      ...imageParts
    ],
    config: {
      systemInstruction: continuationInstruction,
      ...temperatureConfigFor(model, 0.1),
      maxOutputTokens: 65536,
      thinkingConfig: getThinkingConfigForModel(model, "low")
    }
  });
  return { text: res?.text?.trim() || "", finishReason: res?.candidates?.[0]?.finishReason };
}

// Tenta completar uma transcrição truncada pedindo continuações sucessivas na MESMA chave/modelo (até 3 rodadas).
// Retorna o texto completo se conseguir fechar (finishReason deixa de ser MAX_TOKENS) ou null se não conseguir —
// nesse caso quem chamou deve tratar como falha e partir para o próximo modelo/chave, nunca aceitar o texto pela metade.
export async function completeTruncatedTranscription(
  ai: any,
  model: string,
  imageParts: any[],
  systemPrompt: string,
  initialText: string,
  initialFinishReason: string | undefined,
  keyHash: string
): Promise<string | null> {
  let combinedText = initialText;
  let finishReason = initialFinishReason;
  let attempt = 0;

  while (finishReason === 'MAX_TOKENS' && attempt < 3) {
    attempt++;
    console.warn(`[Gemini Flash] Cortado por limite de tokens na chave ..${keyHash}, pedindo continuação (tentativa ${attempt}/3)...`);
    try {
      const cont = await continuePageTranscription(ai, model, imageParts, systemPrompt, combinedText);
      if (!cont.text || containsDegenerateRepetition(cont.text)) {
        console.warn(`[Gemini Flash] Continuação veio vazia ou em loop de repetição na chave ..${keyHash}. Abortando continuação.`);
        return null;
      }
      combinedText = combinedText + cont.text;
      finishReason = cont.finishReason;
    } catch (contErr: any) {
      console.warn(`[Gemini Flash] Falha ao pedir continuação na chave ..${keyHash}:`, contErr?.message || contErr);
      return null;
    }
  }

  if (finishReason === 'MAX_TOKENS') {
    // Esgotou as 3 tentativas de continuação e ainda cortou — não entrega pela metade, sinaliza falha real.
    return null;
  }
  if (containsDegenerateRepetition(combinedText)) {
    return null;
  }
  return combinedText;
}

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

  // Página já sabidamente difícil (a Mistral falhou ou veio suspeita nela) — sobe o thinking
  // de "low" pra "medium" só pra ESTA chamada, dando ao Gemini mais raciocínio pra decifrar
  // letra manuscrita/formulário denso. Fora desse cenário, continua em "low" (rápido, barato).
  const boostThinking = outFlags?.mistralFailed === true;
  const pageThinkingLevel: "low" | "medium" | "high" = hardMode ? "high" : (boostThinking ? "medium" : "low");

  const finalSortedKeys = getSortedApiKeys(preferredApiKey);
  let lastError = null;

  if (finalSortedKeys.length === 0) {
    throw new Error("❌ Nenhuma Chave GEMINI ou API_KEY configurada.");
  }

  const base64 = await new Promise((r) => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
  
  const prompt = hardMode ? getHardHandwritingSystemPrompt() : getPadraoOuroPrompt();

  // "Melhor modelo primeiro" só vale pra releitura AUTOMÁTICA (forceHard sem o checkbox). Se o
  // advogado marcou o checkbox à mão, o modelo que ele escolheu no seletor manda — ele pode estar
  // testando justamente aquele modelo.
  const modelsToTry = getModelFallbackCascade(forceHard && !isHardHandwritingEnabled());

  // Modo "Manuscrito difícil": quem escolhe um modelo bom pra ler letra ruim (ex.: 3.8) não quer
  // cair pro 2.5 no primeiro 503. O 503 é intermitente (atinge parte das requisições), então
  // insiste no modelo escolhido algumas vezes, com espera crescente, antes de descer na cascata.
  // O contador é da página inteira (não por chave) pra um apagão total não multiplicar a espera.
  const PRIMARY_RETRY_MAX = 4;
  let primaryRetriesLeft = hardMode ? PRIMARY_RETRY_MAX : 0;
  const retryPrimaryModel = async (modelIndex: number, model: string, msg: string): Promise<boolean> => {
    const overloaded = msg.includes("503") || msg.includes("overloaded") || msg.includes("high demand") || msg.includes("unavailable");
    if (!overloaded || modelIndex !== 0 || primaryRetriesLeft <= 0 || window.lexscan_abort) return false;
    const used = PRIMARY_RETRY_MAX - primaryRetriesLeft;
    primaryRetriesLeft--;
    const wait = backoffDelay(used);
    console.warn(`[Gemini Flash] Manuscrito difícil: insistindo no ${model} (retentativa ${used + 1}/${PRIMARY_RETRY_MAX}, espera ~${Math.round(wait / 1000)}s) antes de cair pro próximo modelo...`);
    await new Promise(r => setTimeout(r, wait));
    return true;
  };

  for (let i = 0; i < finalSortedKeys.length; i++) {
    if (window.lexscan_abort) throw new Error("ABORT_BY_USER");
    const apiKey = finalSortedKeys[i];
    const keyHash = apiKey.slice(-6);

    if (isKeyThrottled(apiKey)) {
      const waitMs = getKeyCooldownRemainingMs(apiKey);
      if (waitMs > 0) {
        console.warn(`[Rate Limit] Chave ..${keyHash} no limite de ${KEY_MINUTE_LIMIT}/min — aguardando ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
    recordKeyMinuteCall(apiKey);

    console.log(`[Gemini Flash - Página] Chave ${i + 1}/${finalSortedKeys.length} (..${keyHash}) | Processando página...`);
    const ai = new GoogleGenAI({ apiKey });
    
    try {
      let textOutput = "";
      let modelSuccess = false;
      let successModel = "";
      let lastModelErr: any = null;

      for (let m = 0; m < modelsToTry.length; m++) {
        const currentModel = modelsToTry[m];
        if (window.lexscan_abort) break;
        if (isKeyModelExhausted(keyHash, currentModel)) {
          lastModelErr = new Error(`Cota diária do ${currentModel} esgotada na chave ..${keyHash} (exhausted, per day)`);
          continue;
        }

        try {
          console.log(`[Gemini Flash] Tentando modelo ${currentModel} na chave ..${keyHash}...`);
          let responseStream;
          try {
            responseStream = await ai.models.generateContentStream({
              model: currentModel,
              contents: [
                { text: buildTranscriptionUserText(hardMode) },
                { inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }
              ],
              config: {
                systemInstruction: prompt,
                ...temperatureConfigFor(currentModel, 0.1),
                maxOutputTokens: 65536,
                thinkingConfig: getThinkingConfigForModel(currentModel, pageThinkingLevel),
              }
            });
          } catch (initErr: any) {
            lastModelErr = initErr;
            const initMsg = String(initErr?.message || initErr || "").toLowerCase();
            if (await retryPrimaryModel(m, currentModel, initMsg)) { m--; continue; }
            if (initMsg.includes("503") || initMsg.includes("overloaded") || initMsg.includes("high demand") || initMsg.includes("unavailable") || initMsg.includes("not found") || initMsg.includes("404")) {
              console.warn(`[Gemini Flash] Modelo ${currentModel} retornou sobrecarga/indisponível (${initMsg.slice(0, 50)}). Alternando para próximo modelo na mesma chave...`);
              await new Promise(r => setTimeout(r, backoffDelay(m)));
              continue;
            }
            throw initErr;
          }

          let chunksReceived = 0;
          let streamFinishReason: string | undefined;
          textOutput = "";
          // Itera manualmente (em vez de "for await") pra poder colocar um timeout de
          // INATIVIDADE em cada fragmento — o Google às vezes aceita a conexão de streaming,
          // manda alguns fragmentos e trava no meio sem erro nenhum; sem isso o app ficava
          // esperando pra sempre (visto na prática: "puxou fragmentos e parou" por minutos).
          const streamIterator = responseStream[Symbol.asyncIterator]();
          while (true) {
            const { value: chunk, done } = await withTimeout(
              streamIterator.next(),
              30000,
              `Stream do modelo ${currentModel} travou (sem novo fragmento em 30s)`
            );
            if (done) break;
            if (window.lexscan_abort) break;
            textOutput += chunk.text || "";
            chunksReceived++;
            if (chunk?.candidates?.[0]?.finishReason) streamFinishReason = chunk.candidates[0].finishReason;
            if (onProgress) {
              const fakePercent = Math.min(95, 70 + (chunksReceived * 2));
              onProgress(fakePercent, `Gemini Flash Lendo... (${chunksReceived} fragmentos)`);
            }
          }
          textOutput = textOutput.trim();

          if (textOutput && containsDegenerateRepetition(textOutput)) {
            // Loop de repetição real (dezenas de milhares de caracteres repetidos): descarta e tenta outro modelo.
            console.warn(`[Gemini Flash] Modelo ${currentModel} retornou resposta em loop de repetição na chave ..${keyHash}. Descartando e tentando próximo modelo...`);
            textOutput = "";
            lastModelErr = new Error("Resposta com repetição degenerada.");
          } else if (textOutput && streamFinishReason === 'MAX_TOKENS') {
            // Cortou por limite de tokens: NUNCA entrega a página pela metade. Pede continuação na mesma
            // chave/modelo; só desiste (e passa pro próximo modelo/chave) se a continuação também falhar.
            const completed = await completeTruncatedTranscription(
              ai, currentModel, [{ inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }], prompt, textOutput, streamFinishReason, keyHash
            );
            if (completed) {
              textOutput = completed;
              modelSuccess = true; successModel = currentModel;
              break;
            } else {
              console.warn(`[Gemini Flash] Modelo ${currentModel} não conseguiu completar a página mesmo com continuação na chave ..${keyHash}. Tentando próximo modelo...`);
              textOutput = "";
              lastModelErr = new Error("Página não completada após continuação.");
            }
          } else if (textOutput) {
            modelSuccess = true; successModel = currentModel;
            break;
          }
        } catch (streamFail: any) {
          lastModelErr = streamFail;
          const streamFailMsg = String(streamFail?.message || streamFail || "").toLowerCase();

          if (isDailyQuotaError(streamFailMsg)) {
            markKeyModelExhausted(keyHash, currentModel);
            console.warn(`[Gemini Flash] Cota diária do ${currentModel} esgotada na chave ..${keyHash} — tentando o próximo modelo na mesma chave (a cota é por modelo).`);
            continue;
          }
          
          if (await retryPrimaryModel(m, currentModel, streamFailMsg)) { m--; continue; }

          if (streamFailMsg.includes("503") || streamFailMsg.includes("overloaded") || streamFailMsg.includes("high demand") || streamFailMsg.includes("unavailable") || streamFailMsg.includes("not found") || streamFailMsg.includes("404") || streamFailMsg.includes("travou")) {
            console.warn(`[Gemini Flash] Modelo ${currentModel} falhou por sobrecarga/503/travamento. Alternando para próximo modelo na mesma chave...`);
            await new Promise(r => setTimeout(r, backoffDelay(m)));
            continue;
          }

          if (streamFailMsg.includes("429") || streamFailMsg.includes("quota") || streamFailMsg.includes("rate limit") || streamFailMsg.includes("exhausted") || streamFailMsg.includes("403") || streamFailMsg.includes("denied")) {
            throw streamFail;
          }

          console.warn(`[Gemini Flash] Streaming falhou, tentando chamada direta com ${currentModel} na chave ..${keyHash}:`, streamFailMsg.slice(0, 60));
          
          try {
            const directRes = await withTimeout(
              ai.models.generateContent({
                model: currentModel,
                contents: [
                  { text: buildTranscriptionUserText(hardMode) },
                  { inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }
                ],
                config: {
                  systemInstruction: prompt,
                  ...temperatureConfigFor(currentModel, 0.1),
                  maxOutputTokens: 65536,
                  thinkingConfig: getThinkingConfigForModel(currentModel, pageThinkingLevel),
                }
              }),
              45000,
              `Chamada direta ${currentModel} travou (sem resposta em 45s)`
            );

            const directText = directRes?.text?.trim() || "";
            if (directText && containsDegenerateRepetition(directText)) {
              console.warn(`[Gemini Flash] Chamada direta ${currentModel} retornou resposta em loop de repetição. Tentando próximo modelo...`);
              lastModelErr = new Error("Resposta direta com repetição degenerada.");
            } else if (directText && isTruncatedResponse(directRes)) {
              const completedDirect = await completeTruncatedTranscription(
                ai, currentModel, [{ inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }], prompt, directText, 'MAX_TOKENS', keyHash
              );
              if (completedDirect) {
                textOutput = completedDirect;
                modelSuccess = true; successModel = currentModel;
                break;
              } else {
                console.warn(`[Gemini Flash] Chamada direta ${currentModel} não completou a página mesmo com continuação. Tentando próximo modelo...`);
                lastModelErr = new Error("Página não completada após continuação (chamada direta).");
              }
            } else if (directText) {
              textOutput = directText;
              modelSuccess = true; successModel = currentModel;
              break;
            }
          } catch (directErr: any) {
            lastModelErr = directErr;
            const dMsg = String(directErr?.message || directErr || "").toLowerCase();
            if (isDailyQuotaError(dMsg)) {
              markKeyModelExhausted(keyHash, currentModel);
              continue;
            }
            if (dMsg.includes("503") || dMsg.includes("overloaded") || dMsg.includes("high demand") || dMsg.includes("unavailable") || dMsg.includes("not found") || dMsg.includes("404") || dMsg.includes("travou")) {
              console.warn(`[Gemini Flash] Chamada direta ${currentModel} retornou 503/travou. Alternando modelo na mesma chave...`);
              await new Promise(r => setTimeout(r, backoffDelay(m)));
              continue;
            }
            throw directErr;
          }
        }
      }

      // Se o modelo deu sobrecarga temporária no Google, faz uma última tentativa resiliente direto (mesmo modelo)
      if (!modelSuccess && lastModelErr) {
        const errCheck = String(lastModelErr?.message || lastModelErr || "").toLowerCase();
        if (errCheck.includes("503") || errCheck.includes("overloaded") || errCheck.includes("unavailable") || errCheck.includes("high demand") || errCheck.includes("truncada") || errCheck.includes("degenerada")) {
          const resilientDelay = backoffDelay(1);
          console.log(`[Gemini Flash] Breve pausa para o Google recuperar sobrecarga (~${resilientDelay}ms) na chave ..${keyHash}...`);
          await new Promise(r => setTimeout(r, resilientDelay));
          try {
            const retryRes = await ai.models.generateContent({
              model: getSafeGeminiModel(),
              contents: [
                { text: buildTranscriptionUserText(hardMode) },
                { inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }
              ],
              config: {
                systemInstruction: prompt,
                ...temperatureConfigFor(getSafeGeminiModel(), 0.1),
                maxOutputTokens: 65536,
                thinkingConfig: getThinkingConfigForModel(getSafeGeminiModel(), pageThinkingLevel),
              }
            });
            const retryText = retryRes?.text?.trim() || "";
            if (retryText && containsDegenerateRepetition(retryText)) {
              lastModelErr = new Error("Resposta de repescagem com repetição degenerada.");
            } else if (retryText && isTruncatedResponse(retryRes)) {
              const completedRetry = await completeTruncatedTranscription(
                ai, getSafeGeminiModel(), [{ inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } }], prompt, retryText, 'MAX_TOKENS', keyHash
              );
              if (completedRetry) {
                textOutput = completedRetry;
                modelSuccess = true; successModel = getSafeGeminiModel();
              } else {
                lastModelErr = new Error("Página não completada após continuação (repescagem).");
              }
            } else if (retryText) {
              textOutput = retryText;
              modelSuccess = true; successModel = getSafeGeminiModel();
            }
          } catch (retryErr: any) {
            lastModelErr = retryErr;
          }
        }
      }

      if (modelSuccess && textOutput) {
        textOutput = textOutput
          .replace(/_{5,}/g, '___')
          .replace(/-{5,}/g, '---')
          .replace(/(\n[ \t]*\n){3,}/g, '\n\n')
          .trim();
        if (hardMode && !window.lexscan_abort) {
          const hardImagePart = { inlineData: { data: base64, mimeType: blob.type || "image/jpeg" }, mediaResolution: { level: "MEDIA_RESOLUTION_HIGH" } };
          const firstReadModel = successModel || getSafeGeminiModel();
          if (onProgress) onProgress(null, "Manuscrito difícil: 2ª leitura independente...");
          const secondReading = await readSecondOpinion(ai, firstReadModel, hardImagePart, prompt, textOutput, keyHash);
          if (onProgress) onProgress(null, "Manuscrito difícil: comparando as leituras e conferindo pelo contexto do documento...");
          const verified = await verifyHardHandwriting(ai, firstReadModel, hardImagePart, textOutput, secondReading, keyHash);
          if (verified) {
            textOutput = verified
              .replace(/_{5,}/g, '___')
              .replace(/-{5,}/g, '---')
              .replace(/(\n[ \t]*\n){3,}/g, '\n\n')
              .trim();
          }
        }
        if (window.updateKeyUsage) window.updateKeyUsage(keyHash);
        if (window.setKeyError) window.setKeyError(keyHash, 'ok');
        return { text: textOutput, usedKey: apiKey };
      } else {
        throw lastModelErr || new Error(`Modelos (${modelsToTry.join(', ')}) falharam na chave ..${keyHash}`);
      }
    } catch (modelErr: any) {
      lastError = modelErr;
      console.warn(`[Gemini Flash] Erro com chave ..${keyHash}:`, modelErr?.message || modelErr);
    }

    const errorStr = (lastError?.message || "").toLowerCase();
    let errorType = 'error';
    if (errorStr.includes("403") || errorStr.includes("denied") || errorStr.includes("forbidden")) errorType = 'blocked';
    else if (errorStr.includes("api key not valid") || errorStr.includes("api_key_invalid") || errorStr.includes("api key expired")) errorType = 'invalid';
    else if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted") || errorStr.includes("rate limit")) {
      // Só marca "esgotada até amanhã de verdade" quando o próprio erro do Google sinaliza
      // cota DIÁRIA (menciona "day"/"daily"). Um 429 genérico agora é sempre tratado como
      // limite POR MINUTO passageiro (rate_limited) — nunca mais trava a chave o dia inteiro
      // por um estouro momentâneo (o throttle proativo de 4/min já evita isso na prática).
      const allModelsExhausted = modelsToTry.every(mn => isKeyModelExhausted(keyHash, mn));
      errorType = isDailyQuotaError(errorStr)
        ? (allModelsExhausted ? 'quota_exceeded' : 'rate_limited')
        : 'rate_limited';
    }
    // "truncada"/"degenerada" vêm da nossa própria detecção de loop de repetição — é um problema de conteúdo
    // daquela página específica, não da chave. Classificar como server_error (em vez de 'error' genérico)
    // impede que a chave seja banida do pool pras próximas páginas por causa de algo que não é culpa dela.
    else if (errorStr.includes("503") || errorStr.includes("500") || errorStr.includes("timeout") || errorStr.includes("overloaded") || errorStr.includes("unavailable") || errorStr.includes("high demand") || errorStr.includes("truncada") || errorStr.includes("degenerada")) errorType = 'server_error';

    console.warn(`👉 [Auto-Failover] Chave ${i + 1} (..${keyHash}) falhou com tipo (${errorType}). Avançando imediatamente para a próxima chave...`);
    if (window.setKeyError) window.setKeyError(keyHash, errorType);
    await new Promise(r => setTimeout(r, 50));
  }

  throw new Error("❌ Esgotamento Total: " + (lastError?.message || "Servidores do Google indisponíveis ou todas as cotas excedidas."));
}
