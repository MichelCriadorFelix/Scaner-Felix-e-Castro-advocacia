// Ponte de servidor (Vercel Serverless Function) pra chamar a API da NVIDIA NIM.
// Necessária porque integrate.api.nvidia.com não permite chamadas diretas do navegador
// (bloqueio de CORS) — diferente da API do Gemini, que permite. Isso roda no servidor da
// Vercel, então a restrição de CORS do navegador não se aplica aqui.
//
// HISTÓRICO (pra não repetir os mesmos erros):
// 1) Handler clássico (req, res) sem maxDuration: 504 aos 300s (teto da conta) — a NVIDIA
//    "pensando" sem limite de raciocínio (reasoning_budget) genuinamente demorava demais.
// 2) Handler moderno (Request) => Response, SEM declarar runtime: nesse tipo de projeto
//    (Vite, não Next.js), isso é tratado como runtime Node clássica, que espera (req, res)
//    de verdade — devolver um Response nunca chega a ser enviado, e a função fica pendurada
//    até estourar o tempo (confirmado ao vivo com curl: GET, que devia responder em
//    milissegundos, travou os 60s inteiros).
// 3) Mesmo handler moderno, COM runtime: 'edge': aí sim funciona (GET instantâneo,
//    confirmado ao vivo) — só que a runtime Edge da Vercel tem uma regra PRÓPRIA e mais
//    rígida: precisa mandar o PRIMEIRO byte de resposta em até 25s, senão é interrompida
//    ("did not return an initial response within 25s") — diferente do limite total
//    (maxDuration). Como a NVIDIA pode legitimamente demorar mais que 25s só pra começar a
//    responder, Edge não serve aqui sem reestruturar pra streaming.
// SOLUÇÃO FINAL: runtime Node clássica (sem declarar "edge") + handler (req, res) de
// verdade + maxDuration alto (sem o limite de 25s da Edge) + reasoning_budget baixo.
//
// TEMPO REAL MEDIDO NO PLAYGROUND OFICIAL DA NVIDIA (não é chute): pedir uma transcrição
// completa de uma imagem simples já levou 20,88s, gerando texto a ~41-54 tokens/segundo —
// uma velocidade FIXA do modelo, não fila nem sobrecarga. Uma página densa de verdade
// (INSS/CNIS com tabela) facilmente passa de 1.500-2.500 tokens de resposta, o que nessa
// velocidade dá uns 40-60s SÓ pra gerar o texto, de forma normal e esperada. Por isso o
// limite de 60s anterior cortava bem na hora que uma página real terminaria. Aumentado com
// folga generosa em cima desse número medido.
export const config = {
  maxDuration: 180,
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

  const { base64, mimeType, systemPrompt, userText } = req.body || {};
  if (!base64 || !systemPrompt) {
    res.status(400).json({ error: 'Requisição incompleta (faltando imagem ou prompt).' });
    return;
  }

  // Limite de tempo pra chamada da NVIDIA em si, com folga sob o maxDuration (180s) da função —
  // se a NVIDIA travar de verdade (não só demorar o esperado), falha limpo aqui em vez de
  // deixar a própria plataforma matar a função.
  const upstreamController = new AbortController();
  const upstreamTimeout = setTimeout(() => upstreamController.abort(), 170000);

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
        // de responder. Transcrever uma página é uma tarefa de PERCEPÇÃO, não de raciocínio
        // profundo — reduzir o orçamento de raciocínio deixa a resposta bem mais rápida sem
        // perder qualidade na leitura em si.
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
    const isTimeout = e?.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'A NVIDIA NIM demorou demais pra responder (170s) — isso é bem incomum, mesmo pra página densa.' : String(e?.message || e) });
  } finally {
    clearTimeout(upstreamTimeout);
  }
}
