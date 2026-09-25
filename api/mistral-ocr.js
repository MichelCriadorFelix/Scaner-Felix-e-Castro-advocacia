// Ponte de servidor (Vercel Serverless Function) pra chamar a API de OCR da Mistral.
// As chaves em MISTRAL_API_KEY ficam só aqui no servidor (nunca vão pro bundle do
// navegador), diferente das chaves Gemini que precisam ser lidas client-side.
//
// Mesmo padrão já validado com a NVIDIA (ver api/nvidia-transcribe.js): runtime Node
// clássica (req, res) — nunca "runtime: 'edge'" nem retornar um objeto Response — porque
// esse tipo de projeto (Vite, não Next.js) trata api/*.js como Node clássica por padrão.
//
// Diferente da NVIDIA (modelo de raciocínio, genuinamente lento), OCR dedicada responde em
// poucos segundos — timeout curto de propósito, pra nunca deixar uma página travada aqui
// segurar o fallback pro Gemini por muito tempo.
export const config = {
  maxDuration: 25,
};

// MISTRAL_API_KEY aceita uma ou várias chaves separadas por vírgula (mesmo formato já usado
// nas variáveis do Gemini) — cada sócio/conta pode ter a própria chave, somando cota.
function getMistralApiKeys() {
  const raw = process.env.MISTRAL_API_KEY || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

async function callMistralOcr(apiKey, base64, mimeType, signal) {
  const mistralRes = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: `data:${mimeType || 'image/jpeg'};base64,${base64}`,
      },
      // Pede a confiança real do próprio modelo por página — melhor sinal pra decidir
      // automaticamente se vale a pena cair pro Gemini do que só analisar o texto depois.
      confidence_scores_granularity: 'page',
    }),
  });

  const data = await mistralRes.json().catch(() => null);
  return { ok: mistralRes.ok, status: mistralRes.status, data };
}

export default async function handler(req, res) {
  const apiKeys = getMistralApiKeys();

  // Diagnóstico rápido (abrir /api/mistral-ocr no navegador): mostra quantas chaves o
  // servidor realmente leu da variável MISTRAL_API_KEY, só com os 4 últimos caracteres.
  if (req.method === 'GET') {
    res.status(200).json({ keysConfigured: apiKeys.length, keys: apiKeys.map((k) => '..' + k.slice(-4)) });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  if (apiKeys.length === 0) {
    res.status(500).json({ error: 'Mistral OCR não configurada no servidor (MISTRAL_API_KEY ausente).' });
    return;
  }

  const { base64, mimeType } = req.body || {};
  if (!base64) {
    res.status(400).json({ error: 'Requisição incompleta (faltando imagem).' });
    return;
  }

  // OCR dedicada é rápida — timeout curto, com folga sob o maxDuration (25s) da função.
  const upstreamController = new AbortController();
  const upstreamTimeout = setTimeout(() => upstreamController.abort(), 20000);

  // Começa por uma chave aleatória (espalha carga entre as contas) e, se ela falhar, cai pra
  // próxima na MESMA requisição. Se TODAS derem 429 (o plano gratuito da Mistral limita a
  // ~1 requisição/segundo por conta), espera ~1,2s e faz mais uma rodada antes de desistir.
  const startIdx = apiKeys.length > 1 ? Math.floor(Math.random() * apiKeys.length) : 0;
  const attempts = [];
  let lastError = null;

  try {
    for (let round = 0; round < 2; round++) {
      if (round > 0) await new Promise((r) => setTimeout(r, 1200));
      let allRateLimited = true;

      for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[(startIdx + i) % apiKeys.length];

        try {
          const { ok, status, data } = await callMistralOcr(apiKey, base64, mimeType, upstreamController.signal);

          if (!ok) {
            const message = data?.message || data?.error?.message || `Mistral OCR HTTP ${status}`;
            attempts.push({ key: '..' + apiKey.slice(-4), status, message: String(message).slice(0, 120) });
            lastError = { status, message };
            if (status !== 429) allRateLimited = false;
            // Problema da própria requisição (400/413/422): outra chave daria o mesmo erro.
            if (status === 400 || status === 413 || status === 422) {
              res.status(status).json({ error: message, keysConfigured: apiKeys.length, attempts });
              return;
            }
            console.warn(`[Mistral OCR] Chave ..${apiKey.slice(-4)} falhou (${status}), tentando próxima...`);
            continue;
          }

          const text = (data?.pages || [])
            .map((p) => p?.markdown || '')
            .join('\n\n')
            .trim();

          // Formato exato do campo de confiança ainda não 100% confirmado em produção — tenta
          // os caminhos plausíveis e cai pra null se nenhum bater, em vez de quebrar.
          const firstPage = (data?.pages || [])[0];
          const confidence =
            firstPage?.confidence_scores?.average_content_confidence_score ??
            firstPage?.confidence_scores?.average_confidence_score ??
            firstPage?.confidence?.average_content_confidence_score ??
            (typeof firstPage?.confidence === 'number' ? firstPage.confidence : null);

          res.status(200).json({ text, confidence });
          return;
        } catch (innerErr) {
          if (innerErr?.name === 'AbortError') throw innerErr;
          allRateLimited = false;
          attempts.push({ key: '..' + apiKey.slice(-4), status: 0, message: String(innerErr?.message || innerErr).slice(0, 120) });
          lastError = { status: 502, message: String(innerErr?.message || innerErr) };
        }
      }

      if (!allRateLimited) break;
    }

    res.status(lastError?.status || 502).json({
      error: lastError?.message || 'Todas as chaves da Mistral falharam.',
      keysConfigured: apiKeys.length,
      attempts,
    });
  } catch (e) {
    const isTimeout = e?.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'timeout: a Mistral OCR demorou demais pra responder (20s) — isso é incomum pra uma página só.'
        : String(e?.message || e),
      keysConfigured: apiKeys.length,
      attempts,
    });
  } finally {
    clearTimeout(upstreamTimeout);
  }
}
