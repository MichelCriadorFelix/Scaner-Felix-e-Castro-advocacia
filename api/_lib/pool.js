// Rodízio de chaves Gemini no SERVIDOR, com estado compartilhado no Supabase (tabela lexscan_key_state).
// Antes cada aba/navegador tinha a própria memória de "qual chave estourou"; agora todo mundo (todas as
// abas, todos os sócios) enxerga o mesmo estado: chave sem cota do dia, em espera, ou modelo indisponível.
import { createHash } from 'node:crypto';

const EXCLUDE_NAME = /MISTRAL|NVIDIA|OPENROUTER|OPENAI|ANTHROPIC|GROQ|SUPABASE|SERVICE_ROLE|SECRET|POSTGRES|JWT/i;
const PAID_ENV_NAME = 'API_KEY_PAGA';

// Pedidos por minuto que tentamos não passar por chave+modelo (limite grátis real fica na conta Google;
// isto só espalha a carga). Passar disso não proíbe: vira o último recurso da fila.
const SOFT_RPM = { 'gemini-2.5-flash': 8 };
const DEFAULT_SOFT_RPM = 8;

export function hashKey(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function pacificDay(date = new Date()) {
  // YYYY-MM-DD no fuso do Pacífico: a cota diária da Google zera à meia-noite de lá.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Lê todas as chaves Gemini do ambiente (mesma regra do navegador: nome com GEMINI ou API_KEY, vírgula separa).
export function loadServerKeys({ includePaid = false } = {}) {
  const free = [];
  const paid = [];
  const seen = new Set();
  for (const [name, raw] of Object.entries(process.env)) {
    if (!raw || !(/GEMINI/i.test(name) || /API_KEY/i.test(name))) continue;
    if (EXCLUDE_NAME.test(name)) continue;
    const isPaidVar = name === PAID_ENV_NAME;
    for (const part of String(raw).split(',')) {
      const key = part.trim();
      if (key.length < 20 || /\s/.test(key) || seen.has(key)) continue;
      seen.add(key);
      (isPaidVar ? paid : free).push({ key, hash: hashKey(key), paid: isPaidVar });
    }
  }
  // Trava de segurança: o Google vê com maus olhos muitas chaves/projetos somando cota. Teto de chaves
  // gratuitas em uso (GEMINI_MAX_KEYS na Vercel; padrão 20 = sem corte até a lista ser enxugada). A chave paga não conta nesse limite.
  const cap = Math.max(1, Number(process.env.GEMINI_MAX_KEYS) || 20);
  const limitedFree = free.slice(0, cap);
  return includePaid ? [...paid, ...limitedFree] : limitedFree;
}

export class KeyPool {
  constructor(db, keys) {
    this.db = db;
    this.keys = keys;
    this.state = new Map(); // `${hash}|${model}` -> linha
    this.dirty = new Map();
    this.loaded = new Set(); // modelos já carregados
    this.today = pacificDay();
  }

  async load(models) {
    const toLoad = models.filter((m) => !this.loaded.has(m));
    if (!toLoad.length || !this.db || !this.keys.length) return;
    try {
      const { data, error } = await this.db
        .from('lexscan_key_state')
        .select('*')
        .in('model', toLoad)
        .in('key_hash', this.keys.map((k) => k.hash));
      if (!error && data) for (const row of data) this.state.set(`${row.key_hash}|${row.model}`, row);
    } catch (_) { /* sem estado compartilhado: segue com rodízio aleatório */ }
    toLoad.forEach((m) => this.loaded.add(m));
  }

  row(hash, model) {
    const k = `${hash}|${model}`;
    let r = this.state.get(k);
    if (!r) {
      r = { key_hash: hash, model, minute_window_start: null, minute_count: 0, exhausted_until: null, daily_exhausted_date: null, unavailable_until: null, last_ok_at: null, last_error: null };
      this.state.set(k, r);
    }
    return r;
  }

  touch(hash, model) {
    this.dirty.set(`${hash}|${model}`, this.row(hash, model));
  }

  minuteCount(r, now) {
    if (!r.minute_window_start || now - new Date(r.minute_window_start).getTime() >= 60000) return 0;
    return r.minute_count || 0;
  }

  // Chaves utilizáveis AGORA pra esse modelo, melhor primeiro (menos usadas no último minuto; desempate aleatório).
  // Segunda lista: as que só estão acima do limite suave de pedidos/minuto (último recurso).
  candidates(model) {
    const now = Date.now();
    const soft = SOFT_RPM[model] ?? DEFAULT_SOFT_RPM;
    const ok = [];
    const over = [];
    for (const k of this.keys) {
      const r = this.row(k.hash, model);
      if (r.daily_exhausted_date && r.daily_exhausted_date >= this.today) continue;
      if (r.exhausted_until && new Date(r.exhausted_until).getTime() > now) continue;
      if (r.unavailable_until && new Date(r.unavailable_until).getTime() > now) continue;
      const count = this.minuteCount(r, now);
      (count >= soft ? over : ok).push({ ...k, count, tie: Math.random() });
    }
    const byLoad = (a, b) => a.count - b.count || a.tie - b.tie;
    return [...ok.sort(byLoad), ...over.sort(byLoad)];
  }

  // Modelo todo fora do ar pra todas as chaves (ex.: 2.5 não liberado pro projeto)?
  modelUsable(model) {
    return this.candidates(model).length > 0;
  }

  markUse(hash, model) {
    const r = this.row(hash, model);
    const now = Date.now();
    if (!r.minute_window_start || now - new Date(r.minute_window_start).getTime() >= 60000) {
      r.minute_window_start = new Date(now).toISOString();
      r.minute_count = 0;
    }
    r.minute_count = (r.minute_count || 0) + 1;
    this.touch(hash, model);
  }

  markSuccess(hash, model) {
    const r = this.row(hash, model);
    r.last_error = null;
    r.last_ok_at = new Date().toISOString();
    this.touch(hash, model);
  }

  // O modelo EXISTE pra esse projeto (respondeu, ou só estava sobrecarregado/limitado): conta como "aceita o modelo".
  markCapable(hash, model) {
    const r = this.row(hash, model);
    r.last_ok_at = new Date().toISOString();
    this.touch(hash, model);
  }

  // Chaves cujo acesso a este modelo ainda NÃO foi verificado (nunca testadas, ou o bloqueio antigo já venceu).
  // Quem já está bloqueada/esgotada/em espera agora não precisa de teste: já sabemos que não serve neste momento.
  staleKeys(model) {
    const now = Date.now();
    return this.keys.filter((k) => {
      const r = this.row(k.hash, model);
      if (r.unavailable_until && new Date(r.unavailable_until).getTime() > now) return false;
      if (r.daily_exhausted_date && r.daily_exhausted_date >= this.today) return false;
      if (r.exhausted_until && new Date(r.exhausted_until).getTime() > now) return false;
      if (r.unavailable_until) return true; // bloqueio venceu: confirma de novo
      return !r.last_ok_at;
    });
  }

  markRateLimited(hash, model, seconds = 65) {
    const r = this.row(hash, model);
    r.exhausted_until = new Date(Date.now() + seconds * 1000).toISOString();
    r.last_error = '429 limite por minuto';
    this.touch(hash, model);
  }

  markDailyExhausted(hash, model) {
    const r = this.row(hash, model);
    r.daily_exhausted_date = this.today;
    r.last_error = '429 cota diária esgotada';
    this.touch(hash, model);
  }

  markUnavailable(hash, model, hours, why) {
    const r = this.row(hash, model);
    r.unavailable_until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    r.last_error = String(why || 'indisponível').slice(0, 200);
    this.touch(hash, model);
  }

  markInvalid(hash, why) {
    // chave inválida vale pra todos os modelos
    for (const model of this.loaded) this.markUnavailable(hash, model, 12, 'chave inválida: ' + why);
  }

  markOverloaded(hash, model) {
    // 503/alta demanda não é culpa da chave: só anota, sem bloquear.
    const r = this.row(hash, model);
    r.last_error = '503 alta demanda';
    if (!r.last_ok_at) r.last_ok_at = new Date().toISOString(); // 503 = o modelo existe pra essa chave
    this.touch(hash, model);
  }

  // Grava o estado alterado ANTES de responder (função serverless congela depois de responder).
  async flush() {
    if (!this.db || !this.dirty.size) return;
    const rows = [...this.dirty.values()].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    this.dirty.clear();
    try {
      await this.db.from('lexscan_key_state').upsert(rows, { onConflict: 'key_hash,model' });
    } catch (_) { /* estado é otimização, não pode derrubar a leitura */ }
  }

  // Resumo seguro (só os 4 últimos caracteres via hash) pra diagnóstico.
  snapshot(models) {
    const now = Date.now();
    return this.keys.map((k, i) => ({
      n: i + 1,
      id: k.hash.slice(0, 6),
      fim: '..' + k.key.slice(-4), // 4 últimos caracteres: o mesmo trecho que o AI Studio mostra, pra casar chave x projeto
      paid: k.paid,
      models: Object.fromEntries(models.map((m) => {
        const r = this.row(k.hash, m);
        const daily = !!(r.daily_exhausted_date && r.daily_exhausted_date >= this.today);
        const wait = r.exhausted_until && new Date(r.exhausted_until).getTime() > now;
        const unavailable = r.unavailable_until && new Date(r.unavailable_until).getTime() > now;
        return [m, daily ? 'sem cota hoje' : unavailable ? 'indisponível' : wait ? 'em espera' : 'ok'];
      })),
      lastError: Object.values(Object.fromEntries([...this.state.entries()].filter(([key]) => key.startsWith(k.hash)))).map((r) => r.last_error).filter(Boolean)[0] || null,
    }));
  }
}
