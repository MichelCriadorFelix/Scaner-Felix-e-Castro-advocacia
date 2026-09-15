// Ponte de servidor (Vercel Serverless Function) pra chamar a API da NVIDIA NIM.
// Necessária porque integrate.api.nvidia.com não permite chamadas diretas do navegador
// (bloqueio de CORS) — diferente da API do Gemini, que permite. Isso roda no servidor da
// Vercel, então a restrição de CORS do navegador não se aplica aqui.
//
// IMPORTANTE: usa Request/Response (padrão Web Standard) — isso só funciona de verdade se a
// runtime for "edge". Testei ao vivo (curl com timing) e confirmei: SEM essa declaração, a
// Vercel trata a função como runtime Node clássica (que espera o formato antigo (req, res),
// chamando res.end()/res.send()), e como a função nunca chama isso (só retorna um Response),
// a resposta HTTP nunca é de fato enviada — a requisição fica pendurada até estourar o
// maxDuration (confirmado: GET, que deveria retornar 405 em milissegundos, travou os 60s
// inteiros e caiu em FUNCTION_INVOCATION_TIMEOUT). Com runtime "edge" declarada, o Response
// é entendido nativamente e a função termina no instante em que ele é devolvido.
export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const apiKey = process.env.VITE_NVIDIA_NIM_KEY || process.env.NVIDIA_NIM_KEY;
  if (!apiKey) {
    return json({ error: 'NVIDIA NIM não configurada no servidor (VITE_NVIDIA_NIM_KEY ausente).' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Corpo da requisição inválido (não é JSON).' }, 400);
  }

  const { base64, mimeType, systemPrompt, userText } = body || {};
  if (!base64 || !systemPrompt) {
    return json({ error: 'Requisição incompleta (faltando imagem ou prompt).' }, 400);
  }

  // Limite de tempo pra chamada da NVIDIA em si, com folga sob o maxDuration (60s) da função —
  // se a NVIDIA travar, falha limpo aqui em vez de deixar a própria plataforma matar a função.
  const upstreamController = new AbortController();
  const upstreamTimeout = setTimeout(() => upstreamController.abort(), 50000);

  try {
    const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: upstreamController.signal,
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText || 'Leia a imagem e realize a transcrição literal, verbatim, 100% integral sob a orientação do Transcritor de Elite configurado no sistema.' },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 65536,
        // Nemotron é um modelo "reasoning": por padrão ele "pensa" bastante internamente antes
        // de responder, e é isso que estava estourando o tempo limite da função (504). Transcrever
        // uma página é uma tarefa de PERCEPÇÃO, não de raciocínio profundo — reduzir o orçamento
        // de raciocínio (documentado na própria página do modelo) deixa a resposta bem mais rápida
        // sem perder qualidade na leitura em si.
        reasoning_budget: 2048,
        stream: false,
      }),
    });

    const data = await nvidiaRes.json().catch(() => null);

    if (!nvidiaRes.ok) {
      return json({ error: data?.error?.message || `NVIDIA NIM HTTP ${nvidiaRes.status}` }, nvidiaRes.status);
    }

    const text = data?.choices?.[0]?.message?.content || '';
    return json({ text }, 200);
  } catch (e) {
    const isTimeout = e?.name === 'AbortError';
    return json({ error: isTimeout ? 'A NVIDIA NIM demorou demais pra responder (50s).' : String(e?.message || e) }, isTimeout ? 504 : 502);
  } finally {
    clearTimeout(upstreamTimeout);
  }
}
