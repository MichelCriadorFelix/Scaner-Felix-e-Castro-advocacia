// @ts-nocheck

// ── Banco de API Keys & Auto-Failover ────────────────────────
export function getAvailableGeminiKeys() {
  const rawKeys = [];
  
  const addKey = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      const parts = val.split(',').map(k => k.trim()).filter(Boolean);
      rawKeys.push(...parts);
    }
  };

  // 1. Busca por substituição estática (Vite Define) e fallbacks seguros
  try {
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) addKey(process.env.GEMINI_API_KEY);
  } catch(e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) addKey(process.env.API_KEY);
  } catch(e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env.ALL_GEMINI_KEYS) addKey(process.env.ALL_GEMINI_KEYS);
  } catch(e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY_PAGA) addKey(process.env.API_KEY_PAGA);
  } catch(e) {}

  // 2. Busca nativa VITE (import.meta.env)
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_API_KEY) addKey(import.meta.env.VITE_API_KEY);
      // Variáveis VITE_* são expostas ao navegador pelo próprio Vite. Chaves de outros
      // provedores (Mistral/NVIDIA...) nunca entram no pool Gemini, mesmo que estejam aqui.
      const otherProvider = /MISTRAL|NVIDIA|OPENROUTER|OPENAI|ANTHROPIC|GROQ|SUPABASE|SERVICE_ROLE|SECRET/i;
      Object.keys(import.meta.env).forEach(k => {
        if (otherProvider.test(k)) return;
        if (k.includes('GEMINI')) addKey(import.meta.env[k]);
        if (k.includes('API_KEY')) addKey(import.meta.env[k]);
      });
    }
  } catch (e) {}

  // Remove duplicatas e limpa
  return [...new Set(rawKeys)].filter(k => k && typeof k === 'string' && k.length > 20);
}

// Reset automático diário das cotas gratuitas do Google (resetam à meia-noite)
// O Google zera a cota diária à meia-noite do horário do Pacífico (não UTC) — usar UTC zerava
// o status às 21h de Brasília, com as chaves ainda esgotadas de verdade até ~4-5h da manhã.
export function getQuotaDay(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// A cota diária do Google é POR MODELO dentro de cada projeto/chave: uma chave esgotada no
// 2.5-flash continua com cota cheia nos Flash-Lite. Por isso a exaustão é registrada por
// (chave, modelo) e só a chave inteira é marcada esgotada quando TODOS os modelos esgotarem.
export function isDailyQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (m.includes("429") || m.includes("quota") || m.includes("exhausted")) &&
    (m.includes("perday") || m.includes("per day") || m.includes("daily") || m.includes(" day"));
}

export function readModelQuota(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem('lexscan_key_model_quota') || '{}');
  } catch (e) {
    return {};
  }
}

export function isKeyModelExhausted(hash: string, model: string): boolean {
  return readModelQuota()[hash]?.[model] === getQuotaDay();
}

export function markKeyModelExhausted(hash: string, model: string): void {
  try {
    const all = readModelQuota();
    all[hash] = { ...(all[hash] || {}), [model]: getQuotaDay() };
    localStorage.setItem('lexscan_key_model_quota', JSON.stringify(all));
  } catch (e) {}
}

export function checkDailyReset() {
  try {
    const today = getQuotaDay();
    const lastDate = localStorage.getItem('lexscan_key_date');
    if (lastDate && lastDate !== today) {
      console.log(`[LexScan] Novo dia detectado (${today} vs ${lastDate}). Resetando status e contadores de cotas das chaves.`);
      localStorage.removeItem('lexscan_key_errors');
      localStorage.removeItem('lexscan_key_usage');
      localStorage.removeItem('lexscan_key_model_quota');
      localStorage.setItem('lexscan_key_date', today);
      return true;
    }
    if (!lastDate) {
      localStorage.setItem('lexscan_key_date', today);
    }
  } catch (e) {}
  return false;
}

// Helper para ler status e uso de chaves diretamente do localStorage (compartilhado com React)
export function getKeyMetadata(apiKey) {
  checkDailyReset();
  const hash = apiKey.slice(-6);
  let usage = 0;
  let errorStatus = 'ok';

  try {
    const savedUsage = localStorage.getItem('lexscan_key_usage');
    if (savedUsage) {
      const parsed = JSON.parse(savedUsage);
      usage = parsed[hash] || 0;
    }
  } catch (e) {}

  try {
    const savedErrors = localStorage.getItem('lexscan_key_errors');
    if (savedErrors) {
      const parsed = JSON.parse(savedErrors);
      errorStatus = parsed[hash] || 'ok';
    }
  } catch (e) {}

  return { hash, usage, errorStatus };
}

// ── Throttling proativo por chave (só pras chaves GRATUITAS) ────────────────
// Google trava uma chave gratuita o dia inteiro se ela estourar o limite real de ~5
// chamadas/minuto (o erro 429 de "por minuto" e o de "cota diária" eram tratados como
// a mesma coisa — corrigido abaixo). Solução: nunca deixar uma chave gratuita passar de
// 4 chamadas na janela de 60s corrente; cada chave tem sua PRÓPRIA janela independente
// (uma nunca consome o "orçamento" de chamadas de outra).
export const KEY_MINUTE_LIMIT = 4;
export const MINUTE_MS = 60000;

export function getKeyMinuteWindow(hash: string): { windowStart: number; count: number } {
  try {
    const raw = localStorage.getItem('lexscan_key_minute_window');
    const all = raw ? JSON.parse(raw) : {};
    return all[hash] || { windowStart: 0, count: 0 };
  } catch (e) {
    return { windowStart: 0, count: 0 };
  }
}

// A chave paga tem limite de 1000 req/min (faturamento ativo) — não faz sentido nem é
// desejado aplicar o throttle de 4/min pensado pras chaves gratuitas nela.
export function isKeyThrottled(apiKey: string): boolean {
  if (apiKey === getPriorityApiKey()) return false;
  const hash = apiKey.slice(-6);
  const w = getKeyMinuteWindow(hash);
  if (Date.now() - w.windowStart >= MINUTE_MS) return false;
  return w.count >= KEY_MINUTE_LIMIT;
}

export function getKeyCooldownRemainingMs(apiKey: string): number {
  const hash = apiKey.slice(-6);
  const w = getKeyMinuteWindow(hash);
  const remaining = (w.windowStart + MINUTE_MS) - Date.now();
  return remaining > 0 ? remaining : 0;
}

// Estado em memória (não em localStorage) do toggle "Forçar chave paga": reseta sozinho
// pra "desmarcado" toda vez que a página é aberta ou atualizada, porque uma variável de
// módulo é reinicializada do zero a cada carregamento — exatamente o comportamento pedido
// (a chave paga NUNCA deve ser usada "sem querer" logo depois de um F5).
export let forcePaidKeyRuntime = false;
export function isForcePaidKeyEnabled(): boolean {
  return forcePaidKeyRuntime;
}
export function setForcePaidKeyEnabled(enabled: boolean): void {
  forcePaidKeyRuntime = enabled;
}

// Registra uma tentativa de chamada nessa chave (conta pro limite por minuto independente
// de sucesso ou erro — é isso que o limite real do Google conta).
export function recordKeyMinuteCall(apiKey: string): void {
  try {
    const hash = apiKey.slice(-6);
    const now = Date.now();
    const raw = localStorage.getItem('lexscan_key_minute_window');
    const all = raw ? JSON.parse(raw) : {};
    const w = all[hash] || { windowStart: 0, count: 0 };
    all[hash] = (now - w.windowStart >= MINUTE_MS)
      ? { windowStart: now, count: 1 }
      : { windowStart: w.windowStart, count: w.count + 1 };
    localStorage.setItem('lexscan_key_minute_window', JSON.stringify(all));
  } catch (e) {}
}

// Chave paga prioritária (projeto com faturamento ativo no Google Cloud): sempre tentada
// primeiro, com as demais chaves gratuitas como reforço apenas se ela falhar.
export function getPriorityApiKey(): string | null {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY_PAGA) {
      return process.env.API_KEY_PAGA;
    }
  } catch (e) {}
  return null;
}

// Obtém as chaves ordenadas com suporte a fixação de chave ativa (preferredApiKey) e load-balancing
export function getSortedApiKeys(preferredApiKey: string | null = null): string[] {
  const allKeys = getAvailableGeminiKeys();
  if (allKeys.length === 0) return [];

  const priorityKey = getPriorityApiKey();
  const forcePriority = isForcePaidKeyEnabled();

  // A chave paga só entra em jogo quando o advogado marca "Forçar chave paga" explicitamente
  // (a caixinha nasce sempre desmarcada ao abrir/atualizar o app). Enquanto desmarcada, ela
  // fica de fora até da rotação normal — nunca é usada "sem querer" nem como preferência padrão.
  const poolKeys = (priorityKey && !forcePriority) ? allKeys.filter(k => k !== priorityKey) : allKeys;
  if (poolKeys.length === 0) return [];

  // Mapeia todas as chaves com metadados do localStorage
  const keysMetadata = poolKeys.map((key) => {
    const meta = getKeyMetadata(key);
    return { key, ...meta };
  });

  if (forcePriority && priorityKey && keysMetadata.some(k => k.key === priorityKey)) {
    // Ignora até status de erro travado (ex: cota marcada como esgotada num teste de ANTES
    // do faturamento ser ativado) — serve pra confirmar na prática que a chave paga funciona.
    const forced = keysMetadata.find(k => k.key === priorityKey)!;
    const others = keysMetadata.filter(k => k.key !== priorityKey);
    others.sort((a, b) => (a.usage || 0) - (b.usage || 0));
    return [forced.key, ...others.map(o => o.key)];
  }

  // Throttling proativo: tira de cogitação (por ora) qualquer chave gratuita que já bateu
  // 4 chamadas na janela de 60s corrente — só volta a ser candidata quando a janela expirar.
  // Só cai pra lista completa (incluindo travadas) se TODAS estiverem no limite, como último recurso.
  const notThrottled = keysMetadata.filter(m => !isKeyThrottled(m.key));
  const throttleFilteredMetadata = notThrottled.length > 0 ? notThrottled : keysMetadata;

  // Filtra chaves que NÃO estão com erro de cota ou bloqueio ('rate_limited' é passageiro,
  // some sozinho quando a chave funcionar de novo — nunca deve banir a chave o dia todo)
  const activeKeys = throttleFilteredMetadata.filter(m =>
    !m.errorStatus || m.errorStatus === 'ok' || m.errorStatus === 'active' || m.errorStatus === 'server_error' || m.errorStatus === 'rate_limited'
  );

  const candidateKeysInfo = activeKeys.length > 0 ? activeKeys : throttleFilteredMetadata;

  // Se effectivePreferred for fornecida e estiver válida, ela continua fixa no topo! (nunca
  // cai de volta pra chave paga aqui — enquanto não forçada, ela nem está no pool acima)
  if (preferredApiKey && candidateKeysInfo.some(k => k.key === preferredApiKey)) {
    const preferredKeyInfo = candidateKeysInfo.find(k => k.key === preferredApiKey)!;
    const others = candidateKeysInfo.filter(k => k.key !== preferredApiKey);
    others.sort((a, b) => (a.usage || 0) - (b.usage || 0));
    return [preferredKeyInfo.key, ...others.map(o => o.key)];
  } else {
    candidateKeysInfo.sort((a, b) => (a.usage || 0) - (b.usage || 0));
    return candidateKeysInfo.map(info => info.key);
  }
}
