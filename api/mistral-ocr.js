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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKeys = getMistralApiKeys();
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

  // Começa por uma chave aleatória (espalha carga entre as contas quando há mais de uma) e,
  // se ela bater limite de taxa/cota, cai pra próxima automaticamente na MESMA requisição —
  // o cliente nem percebe qual chave respondeu.
  const startIdx = apiKeys.length > 1 ? Math.floor(Math.random() * apiKeys.length) : 0;
  let lastError = null;

  try {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[(startIdx + i) % apiKeys.length];

      try {
        const { ok, status, data } = await callMistralOcr(apiKey, base64, mimeType, upstreamController.signal);

        if (!ok) {
          const msg = (data?.message || data?.error?.message || `Mistral OCR HTTP ${status}`).toLowerCase();
          const isRateLimitOrQuota = status === 429 || status === 401 || status === 403 || msg.includes('rate limit') || msg.includes('quota');
          if (isRateLimitOrQuota && i < apiKeys.length - 1) {
            console.warn(`[Mistral OCR] Chave ..${apiKey.slice(-6)} falhou (${status}), tentando próxima chave...`);
            lastError = { status, message: data?.message || data?.error?.message || `Mistral OCR HTTP ${status}` };
            continue;
          }
          res.status(status).json({ error: data?.message || data?.error?.message || `Mistral OCR HTTP ${status}` });
          return;
        }

        const text = (data?.pages || [])
          .map((p) => p?.markdown || '')
          .join('\n\n')
          .trim();

        // Formato exato do campo de confiança ainda não 100% confirmado em produção — tenta
        // os caminhos plausíveis e cai pra null (o cliente usa a heurística de texto como
        // reforço) se nenhum bater, em vez de quebrar.
        const firstPage = (data?.pages || [])[0];
        const confidence =
          firstPage?.confidence_scores?.average_content_confidence_score ??
          firstPage?.confidence_scores?.average_confidence_score ??
          firstPage?.confidence?.average_content_confidence_score ??
          (typeof firstPage?.confidence === 'number' ? firstPage.confidence : null);

        res.status(200).json({ text, confidence });
        return;
      } catch (innerErr) {
        // Erro de rede/parse numa chave específica: tenta a próxima antes de desistir.
        lastError = innerErr;
        if (i < apiKeys.length - 1) {
          console.warn(`[Mistral OCR] Erro com chave ..${apiKey.slice(-6)}, tentando próxima:`, innerErr?.message || innerErr);
          continue;
        }
        throw innerErr;
      }
    }

    // Todas as chaves falharam por rate limit/cota.
    res.status(lastError?.status || 502).json({ error: lastError?.message || 'Todas as chaves da Mistral falharam.' });
  } catch (e) {
    const isTimeout = e?.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'timeout: a Mistral OCR demorou demais pra responder (20s) — isso é incomum pra uma página só.'
        : String(e?.message || e),
    });
  } finally {
    clearTimeout(upstreamTimeout);
  }
}
