// Leitura de UMA página de documento no servidor (motor novo).
// As chaves Gemini ficam só aqui; o estado de cota/espera de cada chave é compartilhado no Supabase.
// Segue o padrão das outras rotas do projeto: Node clássico (req, res), nunca "edge".
import { authenticate } from './_lib/auth.js';
import { KeyPool, loadServerKeys } from './_lib/pool.js';
import { readPage } from './_lib/engine.js';
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
    const models = GEMINI_MODEL_OPTIONS.map((m) => m.value);
    await pool.load(models);
    return res.status(200).json({ ok: true, keysConfigured: keys.length, paidKeys: keys.filter((k) => k.paid).length, models, keys: pool.snapshot(models) });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const { imageBase64, mimeType, hard, clientName, bestFirst, preferredModel, includePaid } = body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string') return res.status(400).json({ ok: false, error: 'imageBase64 ausente.' });

  const keys = loadServerKeys({ includePaid: !!includePaid });
  if (!keys.length) return res.status(500).json({ ok: false, error: 'Nenhuma chave Gemini configurada no servidor.' });

  const pool = new KeyPool(auth.db, keys);
  const allowed = GEMINI_MODEL_OPTIONS.map((m) => m.value);
  const selected = allowed.includes(preferredModel) ? preferredModel : DEFAULT_GEMINI_MODEL;

  try {
    const out = await readPage({
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
    return res.status(200).json({ ok: true, ...out, ms: Date.now() - started });
  } catch (e) {
    await pool.flush();
    return res.status(502).json({ ok: false, error: String(e?.message || e).slice(0, 300), attempts: e?.attempts || [], steps: e?.steps || [], ms: Date.now() - started });
  }
}
