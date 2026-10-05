// Chamada de TEXTO ao Gemini no servidor (revisão de texto, auditoria de consistência, compilação).
// As chaves ficam só aqui; o navegador nunca mais as vê. Mesma cascata e mesmo estado de chaves do /api/ocr-page.
import { authenticate } from './_lib/auth.js';
import { KeyPool, loadServerKeys } from './_lib/pool.js';
import { OcrEngine } from './_lib/engine.js';
import { GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL, buildModelCascade, temperatureConfigFor, getThinkingConfigForModel } from '../shared/ocrCore.js';

export const config = {
  maxDuration: 120,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const started = Date.now();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const { text, systemInstruction, temperature, maxOutputTokens, thinking, json, preferredModel, timeoutMs, includePaid } = body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ ok: false, error: 'text ausente.' });
  if (text.length > 400000) return res.status(413).json({ ok: false, error: 'texto grande demais.' });

  const keys = loadServerKeys({ includePaid: !!includePaid });
  if (!keys.length) return res.status(500).json({ ok: false, error: 'Nenhuma chave Gemini configurada no servidor.' });

  const allowed = GEMINI_MODEL_OPTIONS.map((m) => m.value);
  const selected = allowed.includes(preferredModel) ? preferredModel : DEFAULT_GEMINI_MODEL;
  const models = buildModelCascade(selected, false);
  const level = ['low', 'medium', 'high'].includes(thinking) ? thinking : null;
  const perCall = Math.min(100000, Math.max(10000, Number(timeoutMs) || 60000));

  const pool = new KeyPool(auth.db, keys);
  const engine = new OcrEngine({ pool, deadline: started + 110000 });
  try {
    const r = await engine.generate({
      label: 'Texto',
      models,
      timeoutMs: perCall,
      accept: json ? (t) => { try { JSON.parse(t.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim()); return true; } catch (_) { return /\{[\s\S]*\}/.test(t); } } : undefined,
      build: (model) => ({
        contents: [{ text }],
        config: {
          ...(typeof systemInstruction === 'string' && systemInstruction ? { systemInstruction } : {}),
          ...temperatureConfigFor(model, typeof temperature === 'number' ? temperature : 0.1),
          ...(maxOutputTokens ? { maxOutputTokens: Math.min(65536, Number(maxOutputTokens)) } : {}),
          ...(level ? { thinkingConfig: getThinkingConfigForModel(model, level) } : {}),
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    await pool.flush();
    return res.status(200).json({ ok: true, text: r.text, model: r.model, ms: Date.now() - started });
  } catch (e) {
    await pool.flush();
    return res.status(502).json({ ok: false, error: String(e?.message || e).slice(0, 300), attempts: engine.attempts, ms: Date.now() - started });
  }
}
