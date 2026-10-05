// @ts-nocheck

// ── Extrai texto de PDF e Imagem (Sistema Híbrido) ──────────────────────────
// skipMistral: quem chama pode forçar pular a Mistral direto (ex: já sabe que essa MESMA
// página falhou nela numa tentativa de releitura anterior, mesmo com a imagem re-renderizada
// em escala diferente — o que muda os bytes e escaparia da checagem por fingerprint abaixo).
// outFlags: canal de saída simples pra sinalizar de volta se a Mistral falhou nesta chamada,
// sem precisar mudar o formato do valor de retorno.

// Corrida entre uma Promise real e um timeout — usado pra nunca deixar o app esperar pra
// sempre por algo que travou (ex: stream do Gemini que manda alguns fragmentos e trava no
// meio, sem erro nenhum — o SDK não avisa, só fica parado).
export function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// Backoff exponencial com jitter pra retentativas de 503/sobrecarga — em vez de esperar
// sempre o mesmo tempo fixo (o que faz várias instâncias baterem no Google no mesmo ritmo),
// cresce a cada tentativa e varia aleatoriamente, dando mais tempo real pro servidor
// recuperar quando a sobrecarga persiste.
export function backoffDelay(attempt: number, baseMs: number = 1200, maxMs: number = 10000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.round(exp * 0.7 + Math.random() * exp * 0.3);
}
