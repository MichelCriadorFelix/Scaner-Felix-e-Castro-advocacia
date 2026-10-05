// Motor de leitura de página no SERVIDOR. Mesmos prompts/regras do navegador (shared/ocrCore.js), mas com o
// rodízio de chaves compartilhado (KeyPool) e a cascata de modelos num lugar só.
import { GoogleGenAI } from '@google/genai';
import * as core from '../../shared/ocrCore.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffDelay(attempt, baseMs = 1500, maxMs = 12000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.round(exp * 0.7 + Math.random() * exp * 0.3);
}

function withTimeout(promise, ms, label) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(label || `timeout ${ms}ms`)), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// Classifica o erro pra decidir o que fazer com a chave/modelo.
export function classifyError(e) {
  const msg = String(e?.message || e || '');
  const m = msg.toLowerCase();
  const status = Number(e?.status || e?.code || (m.match(/\b(4\d\d|5\d\d)\b/) || [])[1] || 0);
  if (m.includes('api key not valid') || m.includes('api_key_invalid') || m.includes('api key expired') || m.includes('api key not found')) return { kind: 'invalid', msg };
  if (status === 429 || m.includes('429') || m.includes('quota') || m.includes('exhausted') || m.includes('rate limit')) {
    const daily = (m.includes('perday') || m.includes('per day') || m.includes('daily') || m.includes(' day'));
    return { kind: daily ? 'daily' : 'minute', msg };
  }
  if (status === 404 || m.includes('not found') || m.includes('no longer available') || m.includes('not available to new users') || m.includes('new users')) return { kind: 'unavailable', msg };
  if (status === 403 || m.includes('permission') || m.includes('denied') || m.includes('forbidden')) return { kind: 'unavailable', msg };
  if (status === 503 || status === 500 || status === 502 || status === 504 || m.includes('overloaded') || m.includes('unavailable') || m.includes('high demand') ||
      m.includes('timeout') || m.includes('timed out') || m.includes('travou') || m.includes('fetch failed') || m.includes('econnreset') || m.includes('socket') || m.includes('deadline')) return { kind: 'overload', msg };
  if (status === 400 || m.includes('400') || m.includes('invalid argument')) return { kind: 'bad', msg };
  return { kind: 'other', msg };
}

export class OcrEngine {
  constructor({ pool, deadline, log }) {
    this.pool = pool;
    this.deadline = deadline; // epoch ms
    this.steps = [];
    this.attempts = [];
    this.logFn = log || (() => {});
  }

  note(s) { this.steps.push(s); this.logFn(s); }
  remaining() { return this.deadline - Date.now(); }

  // Uma chamada generateContent com uma chave específica.
  async callOnce(key, model, { contents, config }, timeoutMs) {
    const ai = new GoogleGenAI({ apiKey: key.key });
    this.pool.markUse(key.hash, model);
    const budget = Math.max(5000, Math.min(timeoutMs, this.remaining() - 3000));
    return withTimeout(ai.models.generateContent({ model, contents, config }), budget, `Chamada ao ${model} travou (sem resposta em ${Math.round(budget / 1000)}s)`);
  }

  // Tenta os modelos em ordem; em cada modelo, as chaves disponíveis. Devolve { text, model, keyHash }.
  //  - sameModelOnly: não cai pra outros modelos (usado na 2ª leitura/juiz, que precisam do MESMO modelo da 1ª).
  //  - primaryRetries: quantas vezes INSISTIR no primeiro modelo (com espera crescente) antes de descer, quando dá 503.
  async generate({ models, build, timeoutMs, accept, primaryRetries = 0, imageParts, systemPrompt, label, maxKeysPerModel = 3 }) {
    await this.pool.load(models);
    let lastErr = null;
    let retriesLeft = primaryRetries;

    for (let mi = 0; mi < models.length; mi++) {
      const model = models[mi];
      let overloadHits = 0;
      let badModel = false;
      let triedKeys = new Set();

      // laço do modelo: repete quando insistimos no primário
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.remaining() < 15000) throw new Error('deadline: tempo da função esgotado');
        const cands = this.pool.candidates(model).filter((k) => !triedKeys.has(k.hash));
        if (!cands.length) {
          if (!triedKeys.size) this.note(`${label}: ${model} sem chave disponível (cota/espera/indisponível) — pulando.`);
          break;
        }
        let restart = false;
        for (const key of cands) {
          if (triedKeys.size >= maxKeysPerModel) break;
          triedKeys.add(key.hash);
          const t0 = Date.now();
          try {
            const req = build(model);
            const res = await this.callOnce(key, model, req, timeoutMs);
            let text = (res?.text || '').trim();
            const finish = res?.candidates?.[0]?.finishReason;
            if (!text) throw Object.assign(new Error('resposta vazia'), { soft: true });
            if (core.containsDegenerateRepetition(text)) throw Object.assign(new Error('resposta com repetição degenerada'), { soft: true });
            if (finish === 'MAX_TOKENS' && !imageParts) throw Object.assign(new Error('resposta cortada por limite de tokens'), { soft: true });
            if (finish === 'MAX_TOKENS') {
              text = await this.complete(key, model, imageParts, systemPrompt, text);
              if (!text) throw Object.assign(new Error('página não completada após continuação'), { soft: true });
            }
            if (accept && !accept(text)) throw Object.assign(new Error('resposta descartada pela checagem de sanidade'), { soft: true });
            this.pool.markSuccess(key.hash, model);
            this.attempts.push({ label, model, key: key.hash.slice(0, 6), ok: true, ms: Date.now() - t0 });
            return { text, model, key };
          } catch (e) {
            lastErr = e;
            const c = e?.soft ? { kind: 'overload', msg: e.message } : classifyError(e);
            this.attempts.push({ label, model, key: key.hash.slice(0, 6), ok: false, kind: c.kind, err: c.msg.slice(0, 120), ms: Date.now() - t0 });
            if (c.kind === 'invalid') this.pool.markInvalid(key.hash, c.msg.slice(0, 80));
            else if (c.kind === 'daily') this.pool.markDailyExhausted(key.hash, model);
            else if (c.kind === 'minute') this.pool.markRateLimited(key.hash, model);
            else if (c.kind === 'unavailable') this.pool.markUnavailable(key.hash, model, 6, c.msg);
            else if (c.kind === 'bad') { badModel = true; this.note(`${label}: ${model} recusou o pedido (400: ${c.msg.slice(0, 100)}) — próximo modelo.`); break; }
            else if (c.kind === 'overload' || c.kind === 'other') { this.pool.markOverloaded(key.hash, model); overloadHits++; }
            if (overloadHits >= 2) break;
          }
        }
        // Chaves/tentativas acabaram neste modelo. Insiste no primário se ainda há retentativas e foi sobrecarga.
        if (mi === 0 && retriesLeft > 0 && overloadHits > 0 && !badModel) {
          const wait = backoffDelay(primaryRetries - retriesLeft);
          retriesLeft--;
          this.note(`${label}: ${model} sobrecarregado — insistindo (espera ~${Math.round(wait / 1000)}s, restam ${retriesLeft}).`);
          if (this.remaining() < wait + 20000) break;
          await sleep(wait);
          triedKeys = new Set();
          overloadHits = 0;
          restart = true;
        }
        if (!restart) break;
      }
      if (models.length > mi + 1) this.note(`${label}: ${model} não respondeu — próximo modelo.`);
    }
    throw lastErr || new Error('nenhum modelo/chave disponível');
  }

  // Continuação quando a resposta foi cortada por limite de tokens (até 3 rodadas, mesma chave/modelo).
  async complete(key, model, imageParts, systemPrompt, initial) {
    let combined = initial;
    for (let i = 0; i < 3; i++) {
      this.note(`Resposta cortada por limite de tokens — pedindo continuação (${i + 1}/3).`);
      const res = await this.callOnce(key, model, {
        contents: [
          { text: 'Continue a transcrição literal desta(s) imagem(ns) exatamente de onde parou, conforme as instruções do sistema. Não repita o que já foi transcrito.' },
          ...imageParts,
        ],
        config: {
          systemInstruction: core.buildContinuationInstruction(systemPrompt, combined),
          ...core.temperatureConfigFor(model, 0.1),
          maxOutputTokens: 65536,
          thinkingConfig: core.getThinkingConfigForModel(model, 'low'),
        },
      }, 90000);
      const more = (res?.text || '').trim();
      if (!more || core.containsDegenerateRepetition(more)) return null;
      combined += more;
      if (res?.candidates?.[0]?.finishReason !== 'MAX_TOKENS') return core.containsDegenerateRepetition(combined) ? null : combined;
    }
    return null;
  }
}

// Lê UMA página. Retorna { text, model, hard, quality, steps, attempts }.
export async function readPage({ pool, imageBase64, mimeType, hard, clientName, bestFirst, preferredModel, deadline, log }) {
  const engine = new OcrEngine({ pool, deadline, log });
  const imagePart = { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } };
  const systemPrompt = hard ? core.getHardHandwritingSystemPrompt() : core.getPadraoOuroPrompt();
  const userText = core.buildTranscriptionUserText(!!hard, clientName);
  const models = core.buildModelCascade(preferredModel, !!(hard && bestFirst));
  const level = hard ? 'high' : 'low';

  let first;
  try {
  first = await engine.generate({
    label: 'Leitura',
    models,
    timeoutMs: hard ? 90000 : 80000,
    primaryRetries: hard ? 3 : 0,
    imageParts: [imagePart],
    systemPrompt,
    build: (model) => ({
      contents: [{ text: userText }, imagePart],
      config: {
        systemInstruction: systemPrompt,
        ...core.temperatureConfigFor(model, 0.1),
        maxOutputTokens: 65536,
        thinkingConfig: core.getThinkingConfigForModel(model, level),
      },
    }),
  });
  } catch (e) {
    e.attempts = engine.attempts;
    e.steps = engine.steps;
    throw e;
  }

  let text = core.cleanTranscription(first.text);
  let finalModel = first.model;

  if (hard) {
    // 2ª leitura independente, no MESMO modelo da 1ª (temperatura alta, pra errar diferente).
    let second = null;
    if (engine.remaining() > 110000) {
      try {
        const r = await engine.generate({
          label: '2ª leitura',
          models: [first.model],
          timeoutMs: 75000,
          imageParts: [imagePart],
          systemPrompt,
          maxKeysPerModel: 2,
          accept: (t) => core.isHardHandwritingTextSane(t, text, 1.8),
          build: (model) => ({
            contents: [{ text: userText }, imagePart],
            config: {
              systemInstruction: systemPrompt,
              ...core.temperatureConfigFor(model, 0.8),
              maxOutputTokens: 65536,
              thinkingConfig: core.getThinkingConfigForModel(model, 'high'),
            },
          }),
        });
        second = r.text;
        engine.note('2ª leitura feita.');
      } catch (e) {
        engine.note('2ª leitura falhou (segue só com a 1ª): ' + String(e?.message || e).slice(0, 100));
      }
    } else engine.note('Sem tempo pra 2ª leitura nesta chamada.');

    if (engine.remaining() > 100000) {
      try {
        const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const judgeSystem = core.buildJudgeSystemInstruction(second, clientName, hoje);
        const judgeUser = core.buildJudgeUserText(text, second);
        const r = await engine.generate({
          label: 'Conferência',
          models: [first.model],
          timeoutMs: 90000,
          imageParts: [imagePart],
          systemPrompt: judgeSystem,
          maxKeysPerModel: 2,
          accept: (t) => core.isHardHandwritingTextSane(t, text, 2.2),
          build: (model) => ({
            contents: [{ text: judgeUser }, imagePart],
            config: {
              systemInstruction: judgeSystem,
              ...core.temperatureConfigFor(model, 0.1),
              maxOutputTokens: 65536,
              thinkingConfig: core.getThinkingConfigForModel(model, 'high'),
            },
          }),
        });
        const verified = r.text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();
        text = core.cleanTranscription(verified);
        engine.note('Conferência aplicada.');
      } catch (e) {
        engine.note('Conferência falhou (mantém a leitura anterior): ' + String(e?.message || e).slice(0, 100));
      }
    } else engine.note('Sem tempo pra conferência nesta chamada.');
  }

  return {
    text,
    model: finalModel,
    hard: !!hard,
    quality: { illegible: core.countIllegibleMarks(text), doubts: (text.match(/\[\?/g) || []).length },
    steps: engine.steps,
    attempts: engine.attempts,
  };
}

// Testador: faz uma chamada MÍNIMA (texto, ~5 tokens) por chave × modelo e devolve o resultado de cada uma.
// Também grava no estado compartilhado o que descobrir (modelo indisponível, cota do dia, chave inválida).
export async function probeKeys(pool, models, timeoutMs = 25000) {
  await pool.load(models);
  const engine = new OcrEngine({ pool, deadline: Date.now() + 120000 });
  const out = {};
  await Promise.all(pool.keys.flatMap((key, i) => models.map(async (model) => {
    const t0 = Date.now();
    let result;
    try {
      await engine.callOnce(key, model, {
        contents: [{ text: 'Responda apenas: ok' }],
        config: { maxOutputTokens: 64, ...core.temperatureConfigFor(model, 0.1), thinkingConfig: core.getThinkingConfigForModel(model, 'low') },
      }, timeoutMs);
      pool.markSuccess(key.hash, model);
      result = { s: 'ok', ms: Date.now() - t0 };
    } catch (e) {
      const c = classifyError(e);
      if (c.kind === 'invalid') pool.markInvalid(key.hash, c.msg.slice(0, 80));
      else if (c.kind === 'daily') pool.markDailyExhausted(key.hash, model);
      else if (c.kind === 'minute') pool.markRateLimited(key.hash, model);
      else if (c.kind === 'unavailable') pool.markUnavailable(key.hash, model, 6, c.msg);
      else pool.markOverloaded(key.hash, model);
      result = { s: c.kind, ms: Date.now() - t0, err: c.msg.replace(/\s+/g, ' ').slice(0, 140) };
    }
    (out[i + 1] ||= { n: i + 1, id: key.hash.slice(0, 6), fim: '..' + key.key.slice(-4), paid: key.paid, models: {} }).models[model] = result;
  })));
  return Object.values(out).sort((a, b) => a.n - b.n);
}
