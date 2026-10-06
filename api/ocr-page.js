// Leitura de UMA página de documento no servidor (motor novo).
// As chaves Gemini ficam só aqui; o estado de cota/espera de cada chave é compartilhado no Supabase.
// Segue o padrão das outras rotas do projeto: Node clássico (req, res), nunca "edge".
import { authenticate } from './_lib/auth.js';
import { KeyPool, loadServerKeys } from './_lib/pool.js';
import { readPage, probeKeys } from './_lib/engine.js';
import { GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL } from '../shared/ocrCore.js';

export const config = {
  maxDuration: 290,
};

const SAFE_DEADLINE_MS = 280000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const started = Date.now();

  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  // Diagnóstico autenticado: quais chaves o servidor enxerga e o estado de cada uma por modelo.
  if (req.method === 'GET') {
    const keys = loadServerKeys({ includePaid: true });
    const pool = new KeyPool(auth.db, keys);
    let models = GEMINI_MODEL_OPTIONS.map((m) => m.value);
    // ?models=a,b testa só esses (ex.: um modelo novo que ainda não está na lista do app)
    const asked = String(req.query?.models || '').split(',').map((m) => m.trim()).filter((m) => /^gemini-[\w.-]+$/.test(m));
    if (asked.length) models = asked;
    // ?probe=1: testa cada chave em cada modelo com uma chamada mínima (usa um pedido de cota por par).
    if (String(req.query?.probe || '') === '1') {
      const matrix = await probeKeys(pool, models);
      await pool.flush();
      return res.status(200).json({ ok: true, probe: matrix, ms: Date.now() - started });
    }
    await pool.load(models);
    return res.status(200).json({ ok: true, keysConfigured: keys.length, paidKeys: keys.filter((k) => k.paid).length, models, keys: pool.snapshot(models) });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const { imageBase64, mimeType, hard, clientName, bestFirst, preferredModel, includePaid, stream } = body || {};
  // Ajustes opcionais do modo difícil (vocabulário, orçamento de raciocínio, ampliações da página). Limitados e validados.
  const rawOpts = (body && typeof body.opts === 'object' && body.opts) || {};
  const opts = {
    vocab: rawOpts.vocab === false ? false : true,
    thinkingBudget: Number(rawOpts.thinkingBudget) > 0 ? Math.min(24576, Number(rawOpts.thinkingBudget)) : undefined,
    zoom: Array.isArray(rawOpts.zoom) ? rawOpts.zoom.filter((z) => typeof z === 'string' && z.length < 1500000).slice(0, 4) : [],
  };
  if (!imageBase64 || typeof imageBase64 !== 'string') return res.status(400).json({ ok: false, error: 'imageBase64 ausente.' });

  const keys = loadServerKeys({ includePaid: !!includePaid });
  if (!keys.length) return res.status(500).json({ ok: false, error: 'Nenhuma chave Gemini configurada no servidor.' });

  const pool = new KeyPool(auth.db, keys);
  const allowed = GEMINI_MODEL_OPTIONS.map((m) => m.value);
  const selected = allowed.includes(preferredModel) ? preferredModel : DEFAULT_GEMINI_MODEL;

  // Modo streaming (linhas JSON): o navegador vê o andamento em tempo real (qual modelo/chave, 2ª leitura, conferência)
  // em vez de esperar minutos sem nenhuma resposta.
  const send = (o) => { try { if (stream) res.write(JSON.stringify(o) + '\n'); } catch (_) { /* conexão fechada */ } };
  if (stream) {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    send({ type: 'step', msg: `Servidor recebeu a página (${Date.now() - started} ms). Iniciando leitura...` });
  }

  try {
    const out = await readPage({
      log: (msg) => send({ type: 'step', msg, t: Date.now() - started }),
      opts,
      pool,
      imageBase64,
      mimeType,
      hard: !!hard,
      clientName: typeof clientName === 'string' ? clientName.slice(0, 200) : '',
      bestFirst: !!bestFirst,
      preferredModel: selected,
      deadline: started + SAFE_DEADLINE_MS,
    });
    await pool.flush();
    if (stream) { send({ type: 'result', ok: true, ...out, ms: Date.now() - started }); return res.end(); }
    return res.status(200).json({ ok: true, ...out, ms: Date.now() - started });
  } catch (e) {
    await pool.flush();
    const failure = { ok: false, error: String(e?.message || e).slice(0, 300), attempts: e?.attempts || [], steps: e?.steps || [], retryAfterMs: e?.retryAfterMs || 20000, ms: Date.now() - started };
    if (stream) { send({ type: 'error', ...failure }); return res.end(); }
    return res.status(502).json(failure);
  }
}
