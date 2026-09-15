// Ponte de servidor (Vercel Serverless Function) pra chamar a API da NVIDIA NIM.
// Necessária porque integrate.api.nvidia.com não permite chamadas diretas do navegador
// (bloqueio de CORS) — diferente da API do Gemini, que permite. Isso roda no servidor da
// Vercel, então a restrição de CORS do navegador não se aplica aqui.
//
// O Nemotron 3 Nano Omni é um modelo "reasoning" — pode demorar bem mais que um modelo
// rápido tipo Gemini Flash pra responder. O limite PADRÃO de função da Vercel (bem curto,
// ~10-15s) estava matando a função antes da NVIDIA terminar de responder (erro 504). Isso
// aqui pede um limite maior — o plano Pro permite até 300s.
export const config = {
  maxDuration: 90,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKey = process.env.VITE_NVIDIA_NIM_KEY || process.env.NVIDIA_NIM_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'NVIDIA NIM não configurada no servidor (VITE_NVIDIA_NIM_KEY ausente).' });
    return;
  }

  try {
    const { base64, mimeType, systemPrompt, userText } = req.body || {};
    if (!base64 || !systemPrompt) {
      res.status(400).json({ error: 'Requisição incompleta (faltando imagem ou prompt).' });
      return;
    }

    const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
      res.status(nvidiaRes.status).json({ error: data?.error?.message || `NVIDIA NIM HTTP ${nvidiaRes.status}` });
      return;
    }

    const text = data?.choices?.[0]?.message?.content || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}
