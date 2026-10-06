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

// Quanto tempo uma chave fica sem ser chamada num modelo que ela NÃO aceita: 404 ("não disponível pra novos usuários")
// raramente muda (3 dias); 403 (projeto negado) pode ser corrigido na conta (1 dia). Depois disso é testada de novo.
export function unavailableHoursFor(msg) {
  const m = String(msg || '').toLowerCase();
  return (m.includes('403') || m.includes('denied') || m.includes('permission') || m.includes('forbidden')) ? 24 : 72;
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
  // Mensagem só pra tela (andamento em tempo real); não entra na lista de passos do resultado.
  say(s) { this.logFn(s); }
  remaining() { return this.deadline - Date.now(); }

  // Uma chamada generateContent com uma chave específica.
  async callOnce(key, model, { contents, config }, timeoutMs) {
    const ai = new GoogleGenAI({ apiKey: key.key });
    this.pool.markUse(key.hash, model);
    const budget = Math.max(5000, Math.min(timeoutMs, this.remaining() - 3000));
    return withTimeout(ai.models.generateContent({ model, contents, config }), budget, `Chamada ao ${model} travou (sem resposta em ${Math.round(budget / 1000)}s)`);
  }

  // Descobre, ANTES de ler de verdade, quais chaves aceitam este modelo: uma chamada mínima (texto, ~5 tokens) por
  // chave ainda não verificada, em paralelo. O resultado fica guardado (Supabase) por dias, então isso acontece uma
  // vez por chave+modelo — depois a leitura nunca mais gasta tentativa numa chave que não aceita o modelo.
  async discover(model) {
    const stale = this.pool.staleKeys(model);
    if (!stale.length || this.remaining() < 60000) return;
    this.note(`Verificando quais chaves aceitam ${model} (${stale.length})...`);
    const probes = stale.map(async (key) => {
      try {
        await this.callOnce(key, model, {
          contents: [{ text: 'Responda apenas: ok' }],
          config: { maxOutputTokens: 64, ...core.temperatureConfigFor(model, 0.1), thinkingConfig: core.getThinkingConfigForModel(model, 'low') },
        }, 20000);
        this.pool.markCapable(key.hash, model);
      } catch (e) {
        const c = classifyError(e);
        if (c.kind === 'invalid') this.pool.markInvalid(key.hash, c.msg.slice(0, 80));
        else if (c.kind === 'unavailable') this.pool.markUnavailable(key.hash, model, unavailableHoursFor(c.msg), c.msg);
        else if (c.kind === 'daily') { this.pool.markCapable(key.hash, model); this.pool.markDailyExhausted(key.hash, model); }
        else if (c.kind === 'minute') { this.pool.markCapable(key.hash, model); this.pool.markRateLimited(key.hash, model); }
        else if (c.kind === 'overload') this.pool.markCapable(key.hash, model); // 503: o modelo existe pra essa chave
        // 'bad'/'other': sem conclusão — a leitura real decide.
      }
    });
    // Não trava a leitura esperando a sondagem mais lenta: depois de 5s segue com o que já se sabe.
    await Promise.race([Promise.all(probes), sleep(5000)]);
  }

  // Lê com o MODELO ESCOLHIDO e só desiste dele depois de esgotar as chaves.
  // Em cada modelo: rodadas ("passes") que percorrem TODAS as chaves que aceitam o modelo (as menos usadas primeiro).
  // Sobrecarga (503) numa chave não condena o modelo: o Google atende umas chaves e recusa outras no mesmo instante,
  // então a próxima chave é tentada. Se a rodada inteira falhar por sobrecarga, espera um pouco e faz outra rodada.
  // Só depois de gastar as rodadas ou o orçamento de tempo do modelo é que cai pro próximo da lista.
  //  - passes: quantas rodadas por modelo. budgetMs: tempo máximo no 1º modelo (os demais têm teto próprio).
  //  - fast: modelos 'melhores mas instáveis' (ex.: 3.8 na releitura de manuscrito): UMA tentativa rápida (25s, até 3 chaves);
  //    se falhar, o modelo entra em pausa de 10 min pra todas as leituras e o app segue pro modelo escolhido sem perder tempo.
  async generate({ models, build, timeoutMs, accept, imageParts, systemPrompt, label, passes = 3, budgetMs = 100000, fast = [] }) {
    await this.pool.load(models);
    let lastErr = null;

    for (let mi = 0; mi < models.length; mi++) {
      const model = models[mi];
      const isFast = fast.includes(model);
      if (isFast && this.pool.modelCooling(model)) {
        this.say(`${label}: ${model} instável agora (em pausa) — indo direto ao próximo modelo.`);
        continue;
      }
      await this.discover(model);
      const phaseEnd = isFast
        ? Math.min(this.deadline - 15000, Date.now() + 25000)
        : Math.min(this.deadline - 15000, Date.now() + (mi === 0 ? budgetMs : Math.min(budgetMs, 90000)));
      const maxPasses = isFast ? 1 : passes;
      const keysPerRound = isFast ? 3 : 5;
      let badModel = false;

      for (let pass = 0; pass < maxPasses && !badModel; pass++) {
        if (Date.now() > phaseEnd) break;
        // Outras leituras em paralelo (outras instâncias) também marcam chaves: relê o estado a cada rodada.
        if (pass > 0) await this.pool.refresh(model);
        let cands = this.pool.candidates(model);
        if (!cands.length) {
          // Chaves só ESPERANDO (limite por minuto/sobrecarga): espera a primeira voltar em vez de desistir do modelo.
          const wait = this.pool.nextWaitMs(model);
          if (wait !== null && Date.now() + wait + 500 < phaseEnd) {
            const w = Math.min(wait + 300, 20000);
            this.say(`${label}: todas as chaves de ${model} em espera — aguardando ${Math.round(w / 1000)}s...`);
            await sleep(w);
            await this.pool.refresh(model);
            cands = this.pool.candidates(model);
          }
          if (!cands.length) {
            if (pass === 0) this.note(`${label}: ${model} sem chave disponível (cota/espera/indisponível) — pulando.`);
            break;
          }
        }
        let sawOverload = false;
        let overloadedKeys = 0;
        let triedThisRound = 0;

        for (const key of cands) {
          if (Date.now() > phaseEnd) break;
          // No máximo 5 chaves por rodada: martelar todas em sequência só esgota o limite de todas.
          if (triedThisRound >= keysPerRound) break;
          triedThisRound++;
          if (this.remaining() < 15000) throw new Error('deadline: tempo da função esgotado');
          const t0 = Date.now();
          this.say(`${label}: ${model} · chave ${cands.indexOf(key) + 1}/${cands.length}${pass > 0 ? ` · rodada ${pass + 1}/${passes}` : ''}...`);
          try {
            const req = build(model);
            const callTimeout = Math.max(15000, Math.min(timeoutMs, phaseEnd - Date.now() + 10000));
            const res = await this.callOnce(key, model, req, callTimeout);
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
            if (isFast) this.pool.clearModelCooling(model);
            this.attempts.push({ label, model, key: key.hash.slice(0, 6), ok: true, ms: Date.now() - t0 });
            return { text, model, key };
          } catch (e) {
            lastErr = e;
            const c = e?.soft ? { kind: 'overload', msg: e.message } : classifyError(e);
            this.attempts.push({ label, model, key: key.hash.slice(0, 6), ok: false, kind: c.kind, err: c.msg.slice(0, 120), ms: Date.now() - t0 });
            if (c.kind === 'invalid') this.pool.markInvalid(key.hash, c.msg.slice(0, 80));
            else if (c.kind === 'daily') this.pool.markDailyExhausted(key.hash, model);
            else if (c.kind === 'minute') this.pool.markRateLimited(key.hash, model);
            else if (c.kind === 'unavailable') this.pool.markUnavailable(key.hash, model, unavailableHoursFor(c.msg), c.msg);
            else if (c.kind === 'bad') { badModel = true; this.note(`${label}: ${model} recusou o pedido (400: ${c.msg.slice(0, 100)}) — próximo modelo.`); break; }
            else { this.pool.markOverloaded(key.hash, model); sawOverload = true; overloadedKeys++; }
            // Mostra pros outros processos em paralelo e dá um respiro antes da próxima chave.
            if (c.kind === 'minute' || c.kind === 'overload' || c.kind === 'other') {
              this.pool.flushSoon();
              await sleep(400 + Math.round(Math.random() * 400));
            }
          }
        }

        if (badModel || !sawOverload) break; // nada que valha repetir (cota, chave inválida...)
        if (pass < maxPasses - 1) {
          const wait = backoffDelay(pass, 3000, 15000);
          if (Date.now() + wait > phaseEnd) break;
          this.note(`${label}: ${model} sobrecarregado em ${overloadedKeys} chave(s) — nova rodada em ~${Math.round(wait / 1000)}s (${pass + 2}/${passes}).`);
          await sleep(wait);
        }
      }
      if (isFast) { this.pool.coolModel(model); this.note(`${label}: ${model} não respondeu agora — em pausa por 10 min para todas as leituras.`); }
      else if (models.length > mi + 1) this.note(`${label}: ${model} não respondeu com nenhuma chave — próximo modelo.`);
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

// A própria IA escreve no cabeçalho (TIPO/OBS) quando a página tem letra à mão — sinal barato pra escalar sozinho.
const HANDWRITING_RE = /manuscrit|caligrafia|letra\s+(de\s+m[ée]dico|cursiva|manual)|escrit[oa]\s+[àa]\s+m[ãa]o/i;
export function looksHandwritten(text) {
  // "assinatura manuscrita" é comum em documento DIGITADO (só a assinatura é à mão): não conta.
  const head = String(text || '').split('═')[0].slice(0, 800).replace(/assinaturas?\s+(e\s+carimbos?\s+)?manuscrit\w*/gi, '');
  return HANDWRITING_RE.test(head);
}

// Lê UMA página. Retorna { text, model, hard, quality, steps, attempts }.
export async function readPage({ pool, imageBase64, mimeType, hard, clientName, bestFirst, preferredModel, deadline, log, skipEscalation = false, opts = {} }) {
  const engine = new OcrEngine({ pool, deadline, log });
  const imagePart = { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } };
  const systemPrompt = hard ? core.getHardHandwritingSystemPrompt() : core.getPadraoOuroPrompt();
  const hojeBr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const zoomParts = (Array.isArray(opts.zoom) ? opts.zoom : []).slice(0, 4).map((b) => ({ inlineData: { data: b, mimeType: 'image/jpeg' }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } }));
  const userText = core.buildTranscriptionUserText(!!hard, clientName, hojeBr, { vocab: opts.vocab, zoomCount: hard ? zoomParts.length : 0 });
  const imgs = hard ? [imagePart, ...zoomParts] : [imagePart];
  const thinkBudget = opts.thinkingBudget;
  const models = core.buildModelCascade(preferredModel, !!(hard && bestFirst));
  const level = hard ? 'high' : 'low';

  let first;
  try {
  first = await engine.generate({
    label: 'Leitura',
    models,
    timeoutMs: hard ? 90000 : 80000,
    passes: hard ? 4 : 3,
    budgetMs: hard ? 120000 : 90000,
    fast: hard && bestFirst ? ['gemini-3.8-flash', 'gemini-3.5-flash'].filter((m) => m !== preferredModel) : [],
    imageParts: imgs,
    systemPrompt,
    build: (model) => ({
      contents: [{ text: userText }, ...imgs],
      config: {
        systemInstruction: systemPrompt,
        ...core.temperatureConfigFor(model, 0.1),
        maxOutputTokens: 65536,
        thinkingConfig: core.getThinkingConfigForModel(model, level, thinkBudget),
      },
    }),
  });
  } catch (e) {
    e.attempts = engine.attempts;
    e.steps = engine.steps;
    // Quanto o navegador deve esperar antes de tentar de novo (chaves só em espera): evita cair no OCR local à toa.
    const w = pool.nextWaitMs(models[0]);
    e.retryAfterMs = Math.min(60000, Math.max(15000, (w ?? 0) + 2000));
    throw e;
  }

  let text = core.cleanTranscription(first.text);
  let finalModel = first.model;

  // Página normal que a própria IA descreve como MANUSCRITA: leitura simples erra (medido: inventou "Pretensão à
  // Aposentadoria", trocou sobrenome e ano). Escala sozinha pro modo difícil (2 leituras + conferência, melhor modelo
  // primeiro). Se o modo difícil falhar, mantém a leitura simples — nunca piora o que já tinha.
  if (!hard && !skipEscalation && looksHandwritten(text) && engine.remaining() > 90000) {
    engine.note('Página manuscrita detectada — relendo em modo difícil (2 leituras + conferência).');
    try {
      const deep = await readPage({ pool, imageBase64, mimeType, hard: true, clientName, bestFirst: true, preferredModel, deadline, log, skipEscalation: true, opts });
      if (deep?.text) {
        return {
          ...deep,
          escalated: true,
          steps: [...engine.steps, ...deep.steps],
          attempts: [...engine.attempts, ...deep.attempts],
        };
      }
    } catch (e) {
      engine.note('Releitura em modo difícil falhou — mantendo a leitura simples: ' + String(e?.message || e).slice(0, 100));
    }
  }

  if (hard) {
    // 2ª leitura independente, no MESMO modelo da 1ª (temperatura alta, pra errar diferente).
    let second = null;
    if (engine.remaining() > 75000) {
      try {
        engine.say('2ª leitura independente (mesmo modelo)...');
        const r = await engine.generate({
          label: '2ª leitura',
          models: [first.model],
          timeoutMs: 75000,
          imageParts: imgs,
          systemPrompt,
          passes: 2,
          budgetMs: 45000,
          accept: (t) => core.isHardHandwritingTextSane(t, text, 1.8),
          build: (model) => ({
            contents: [{ text: userText }, ...imgs],
            config: {
              systemInstruction: systemPrompt,
              ...core.temperatureConfigFor(model, 0.8),
              maxOutputTokens: 65536,
              thinkingConfig: core.getThinkingConfigForModel(model, 'high', thinkBudget),
            },
          }),
        });
        second = r.text;
        engine.note('2ª leitura feita.');
      } catch (e) {
        engine.note('2ª leitura falhou (segue só com a 1ª): ' + String(e?.message || e).slice(0, 100));
      }
    } else engine.note('Sem tempo pra 2ª leitura nesta chamada.');

    if (engine.remaining() > 75000) {
      try {
        engine.say('Conferindo as duas leituras com a imagem...');
        const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const judgeSystem = core.buildJudgeSystemInstruction(second, clientName, hoje, { vocab: opts.vocab });
        const judgeUser = core.buildJudgeUserText(text, second);
        const r = await engine.generate({
          label: 'Conferência',
          models: [first.model],
          timeoutMs: 90000,
          imageParts: imgs,
          systemPrompt: judgeSystem,
          passes: 2,
          budgetMs: 45000,
          accept: (t) => core.isHardHandwritingTextSane(t, text, 2.2),
          build: (model) => ({
            contents: [{ text: judgeUser }, ...imgs],
            config: {
              systemInstruction: judgeSystem,
              ...core.temperatureConfigFor(model, 0.1),
              maxOutputTokens: 65536,
              thinkingConfig: core.getThinkingConfigForModel(model, 'high', thinkBudget),
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
      else if (c.kind === 'unavailable') pool.markUnavailable(key.hash, model, unavailableHoursFor(c.msg), c.msg);
      else pool.markOverloaded(key.hash, model);
      result = { s: c.kind, ms: Date.now() - t0, err: c.msg.replace(/\s+/g, ' ').slice(0, 140) };
    }
    (out[i + 1] ||= { n: i + 1, id: key.hash.slice(0, 6), fim: '..' + key.key.slice(-4), paid: key.paid, models: {} }).models[model] = result;
  })));
  return Object.values(out).sort((a, b) => a.n - b.n);
}
