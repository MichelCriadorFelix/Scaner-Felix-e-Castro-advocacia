// Ponte de servidor (Vercel Serverless Function) pra chamar a API de OCR da Mistral.
// A chave MISTRAL_API_KEY fica só aqui no servidor (nunca vai pro bundle do navegador),
// diferente das chaves Gemini que precisam ser lidas client-side.
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
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

  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: upstreamController.signal,
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

    if (!mistralRes.ok) {
      res.status(mistralRes.status).json({ error: data?.message || data?.error?.message || `Mistral OCR HTTP ${mistralRes.status}` });
      return;
    }

    const text = (data?.pages || [])
      .map((p) => p?.markdown || '')
      .join('\n\n')
      .trim();

    // Formato exato do campo de confiança ainda não 100% confirmado em produção — tenta os
    // caminhos plausíveis e cai pra null (o cliente usa a heurística de texto como reforço)
    // se nenhum bater, em vez de quebrar.
    const firstPage = (data?.pages || [])[0];
    const confidence =
      firstPage?.confidence_scores?.average_content_confidence_score ??
      firstPage?.confidence_scores?.average_confidence_score ??
      firstPage?.confidence?.average_content_confidence_score ??
      (typeof firstPage?.confidence === 'number' ? firstPage.confidence : null);

    res.status(200).json({ text, confidence });
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
