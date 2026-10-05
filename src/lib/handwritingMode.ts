// @ts-nocheck
import { isMistralSelected, temperatureConfigFor, getThinkingConfigForModel, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY } from './geminiModels';
import { containsDegenerateRepetition } from './textQuality';
import { withTimeout } from './async';
import { enhanceImageForGemini } from './image';

// Modo "Manuscrito difícil" (checkbox na tela, nasce DESMARCADO a cada carregamento — mais
// raciocínio e mais pixels custam mais tokens, então só se liga pros laudos de letra ruim).
// Sobe o raciocínio do Gemini ao máximo e manda a imagem em alta resolução.
export let hardHandwritingRuntime = false;
export function isHardHandwritingEnabled(): boolean {
  return hardHandwritingRuntime;
}
export function setHardHandwritingEnabled(enabled: boolean): void {
  hardHandwritingRuntime = enabled;
}
export function wantsHighResImage(): boolean {
  return isMistralSelected() || hardHandwritingRuntime;
}

// Nome da pasta do cliente do documento em processamento (definido nos pontos de entrada da
// extração). Serve de DICA pro modo "Manuscrito difícil" conferir nomes de letra ruim — sem ela,
// cada página é lida isolada e o modelo inventa um nome plausível (visto: "Floraci…Paiva" no
// lugar de "Maria de Fátima Dutra Pires").
export let ocrContextClientName = "";
export function setOcrContextClientName(name: string): void {
  ocrContextClientName = (name || "").trim();
}

export function buildClientNameHint(): string {
  if (!ocrContextClientName) return "";
  return `\n- Dica de contexto: a pasta deste documento se chama "${ocrContextClientName}". Use isso APENAS pra conferir se um nome manuscrito parecido é o dela (se as letras forem compatíveis, escreva o nome completo da dica). Se o nome escrito no papel for claramente outro, transcreva o que está no papel. NUNCA escreva um nome que não esteja no papel.`;
}

export const BASE_TRANSCRIPTION_TEXT = "Leia a imagem e realize a transcrição literal, verbatim, 100% integral sob a orientação do Transcritor de Elite configurado no sistema.";

export const HARD_HANDWRITING_RULES = `
MODO MANUSCRITO DIFÍCIL — regras extras (têm prioridade sobre a ideia de "parecer completo"):
- Leia palavra por palavra, comparando o formato das letras. Primeiro identifique que TIPO de documento é (laudo médico, cartão de ponto, recibo, certidão, contrato, mandado, ordem de serviço...) e use o que está IMPRESSO no papel (timbre, cabeçalho, formulário, carimbo) e o vocabulário habitual DESSE tipo de documento pra decifrar.
- Se você NÃO tiver razoável certeza de uma palavra, NÃO complete com algo só porque é plausível: escreva a melhor leitura seguida de [?] (ex.: "Discais[?]"). Se nada puder ser lido, use [ILEGÍVEL]. Marcar a dúvida é MAIS importante do que entregar o texto aparentemente completo.
- Números de registro profissional (CRM, OAB, CREA...), CPF, CNPJ, número de processo, valores em reais, horários, datas, doses e códigos: só escreva o que você consegue ler com clareza; dígito duvidoso vira [?]. NUNCA invente dígitos.
- Carimbo borrado ou desbotado: transcreva só as partes legíveis, o resto como [ILEGÍVEL].`;

// Prompt de sistema ENXUTO do modo "Manuscrito difícil". O AI Studio leu os mesmos laudos com um
// pedido de uma linha; o prompt "Padrão Ouro" (dezenas de regras de tabelas, anti-loop, Diário
// Oficial...) compete com a atenção do modelo na hora de decifrar letra. Aqui ficam só a tarefa,
// o jeito de ler manuscrito e o formato de saída que o resto do app espera.
export function getHardHandwritingSystemPrompt(): string {
  return `Você é um transcritor de documentos do escritório Félix & Castro Advocacia (previdenciário, trabalhista, cível, consumidor), especialista em LETRA MANUSCRITA DIFÍCIL (letra de médico, cartões de ponto, recibos, certidões antigas, anotações à mão em geral).

TAREFA: transcrever TODO o texto visível na imagem — impresso e manuscrito — na ordem em que aparece, de cima para baixo, sem resumir e sem omitir nada (timbre, cabeçalho, carimbos, assinaturas, datas, rodapé).

COMO LER MANUSCRITO:
- Leia palavra por palavra e use o contexto: primeiro identifique o TIPO de documento e o que está impresso (timbre, cabeçalho, formulário); use o vocabulário e as abreviações habituais desse tipo de documento.
- Use a coerência do conteúdo pra decidir entre leituras parecidas: valores, datas, códigos e nomes devem combinar entre si (ex.: um código de doença combina com os diagnósticos escritos; num cartão de ponto, a saída vem depois da entrada e os totais fecham).
- Nomes de pessoas: transcreva completos, nunca abreviados nem inventados.

FORMATO DE SAÍDA:
- Comece com os metadados: TÍTULO: [título principal], TIPO: [classificação do documento], ÁREA: [Previdenciário / Trabalhista / Consumidor / Cível / Múltiplas], OBS: [observação, se houver].
- Depois a linha divisória: ══════════════════════════════════════════════════
- Depois a transcrição literal e integral.
- Assinatura visível: [Assinatura Manuscrita: Nome]. Tabelas: reconstrua em tabela Markdown. Nunca repita traços, sublinhados ou espaços pra desenhar linhas ou formulários.`;
}

export function buildTranscriptionUserText(hard: boolean = hardHandwritingRuntime): string {
  if (!hard) return BASE_TRANSCRIPTION_TEXT;
  return BASE_TRANSCRIPTION_TEXT + "\n" + HARD_HANDWRITING_RULES + buildClientNameHint();
}

// Verificação de sanidade comum às respostas extras do modo "Manuscrito difícil" (2ª leitura e juiz):
// descarta resposta vazia, de tamanho muito diferente, com ideograma estranho ou em loop.
export function isHardHandwritingTextSane(text: string, reference: string, maxFactor: number): boolean {
  return (
    text.length >= reference.length * 0.5 &&
    text.length <= reference.length * maxFactor &&
    !/[一-鿿぀-ヿ가-힯]/.test(text) &&
    !containsDegenerateRepetition(text)
  );
}

// 2ª LEITURA INDEPENDENTE do modo "Manuscrito difícil": lê a mesma imagem de novo com o MESMO
// modelo da 1ª leitura (o advogado escolheu esse modelo; nenhuma etapa pode chamar outro por
// conta própria), com amostragem diferente — onde as duas leituras discordam está justamente a
// dúvida real, sinal que uma leitura só nunca dá. Falha ou resposta suspeita devolve null
// (segue só com a 1ª leitura).
export async function readSecondOpinion(ai: any, firstModel: string, imagePart: any, systemPrompt: string, firstText: string, keyHash: string): Promise<string | null> {
  const attempts: { model: string; temperature: number }[] = [{ model: firstModel, temperature: 0.8 }];
  for (const { model, temperature } of attempts) {
    if (window.lexscan_abort) return null;
    try {
      const res: any = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ text: buildTranscriptionUserText(true) }, imagePart],
          config: {
            systemInstruction: systemPrompt,
            ...temperatureConfigFor(model, temperature),
            maxOutputTokens: 65536,
            thinkingConfig: getThinkingConfigForModel(model, "high"),
          },
        }),
        75000,
        `2ª leitura (${model}) travou (sem resposta em 75s)`
      );
      const text: string = (res?.text || "").trim();
      if (text && isHardHandwritingTextSane(text, firstText, 1.8)) {
        console.log(`[Manuscrito difícil] 2ª leitura feita com ${model} (temp ${temperature}).`);
        return text;
      }
      console.warn(`[Manuscrito difícil] 2ª leitura com ${model} descartada (resposta vazia/suspeita).`);
    } catch (e: any) {
      console.warn(`[Manuscrito difícil] 2ª leitura com ${model} falhou:`, e?.message || e);
    }
  }
  return null;
}

// Releitura AUTOMÁTICA: a primeira leitura de uma página que vem com vários [ILEGÍVEL] é o sinal
// mais barato de "isto é manuscrito difícil". Em vez de depender do advogado marcar o checkbox,
// o app relê só aquela página no modo difícil e fica com a versão que tiver menos trechos
// ilegíveis. (Não pega erro CONFIANTE — nome plausível errado —, que continua pedindo o checkbox.)
export const AUTO_HARD_ILLEGIBLE_THRESHOLD = 3;
export function countIllegibleMarks(text: string): number {
  return (text.match(/\[ILEG[ÍI]VEL\]/gi) || []).length;
}

// Renderiza a página do PDF a 3x e prepara a imagem sem filtro, pra releitura em modo difícil.
export async function renderPdfPageForHardRead(page: any): Promise<Blob | null> {
  try {
    const viewport = page.getViewport({ scale: 3.0 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 60000, "Render em alta resolução travou");
    const blob = await enhanceImageForGemini(canvas, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, false);
    canvas.width = 0; canvas.height = 0;
    return blob;
  } catch (e: any) {
    console.warn("[Releitura automática] Falha ao renderizar a página em alta resolução:", e?.message || e);
    return null;
  }
}

// JUIZ do modo "Manuscrito difícil": recebe a imagem + a(s) leitura(s) e devolve a transcrição
// final. Compara as leituras, confere cada dúvida contra a imagem e contra a COERÊNCIA DO CONTEÚDO
// (é aqui que entra o "entender", não só enxergar: ex. num laudo de coluna e punho, um CID "H54"
// é quase certamente um "M54" mal escrito; num cartão de ponto, uma saída antes da entrada é erro). Onde não decidir, mostra as DUAS opções em vez de
// escolher uma ou inventar. Qualquer falha ou resposta suspeita mantém a 1ª leitura.
export async function verifyHardHandwriting(ai: any, model: string, imagePart: any, firstText: string, secondText: string | null, keyHash: string): Promise<string | null> {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const systemInstruction = `Você é o REVISOR-JUIZ de transcrições de documentos manuscritos (médicos, trabalhistas, cíveis, de consumo...) do escritório Félix & Castro Advocacia. Receberá a IMAGEM de uma página e ${secondText ? 'DUAS transcrições independentes (Leitura A e Leitura B)' : 'uma transcrição (Leitura A)'}. Devolva a transcrição FINAL.
COMO TRABALHAR:
1. Mantenha o formato da Leitura A (metadados TÍTULO/TIPO/ÁREA/OBS, linha divisória, estrutura). Não resuma, não reordene, não remova o que já está certo.
2. ${secondText ? 'Compare as duas leituras palavra por palavra. Onde concordam e a imagem confirma, mantenha. Onde DISCORDAM, olhe a imagem de novo, forma por forma de letra, e decida.' : 'Confira palavra por palavra contra a imagem, desconfiando do que parece completado só por ser plausível.'}
3. COERÊNCIA DO CONTEÚDO — primeiro identifique o TIPO de documento (laudo, cartão de ponto, recibo, certidão, contrato, mandado...) e raciocine como um leitor experiente dele, não só letra por letra:
   - Confusões típicas de letra manuscrita: H/M, 1/7, 4/9, 5/S, 0/6, a/o, u/n, rr/n. Se um código, sigla, valor ou termo não combina com o resto do mesmo documento (ex.: um CID de visão num laudo de coluna e punho; hora de saída anterior à de entrada; soma que não fecha), considere a leitura compatível com o contexto e SINALIZE a troca (regra 4).
   - O que está IMPRESSO (timbre, cabeçalho, formulário, nome de clínica, empresa, cartório ou profissional) vale como pista pra decifrar o resto.
   - Datas: hoje é ${hoje}; uma data no futuro ou incompatível com as outras datas do documento merece dúvida.
   - Siglas e abreviações devem ser lidas no sentido próprio do tipo de documento (ex.: ATB, STC, MMSS num laudo médico; HE, DSR, FGTS num documento trabalhista).
4. Onde, mesmo assim, houver mais de uma leitura plausível, NÃO escolha em silêncio e NÃO invente: escreva as duas assim: [?: opção1 | opção2]. Dígito/letra sem nenhuma leitura possível: [ILEGÍVEL].
5. NUNCA invente nomes, números de registro (CRM, OAB...), CPF/CNPJ, valores, horários, datas ou doses que não estejam no papel.
6. Responda SOMENTE com a transcrição final completa, sem comentários e sem blocos de código.${buildClientNameHint()}`;
  const userText = secondText
    ? `LEITURA A:\n<<<\n${firstText}\n>>>\n\nLEITURA B:\n<<<\n${secondText}\n>>>\n\nRelia a imagem, compare as duas leituras e devolva a transcrição final.`
    : `LEITURA A:\n<<<\n${firstText}\n>>>\n\nRelia a imagem e devolva a transcrição final.`;
  try {
    const res: any = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [{ text: userText }, imagePart],
        config: {
          systemInstruction,
          ...temperatureConfigFor(model, 0.1),
          maxOutputTokens: 65536,
          thinkingConfig: getThinkingConfigForModel(model, "high"),
        },
      }),
      90000,
      `Conferência do manuscrito travou (sem resposta em 90s)`
    );
    let verified: string = (res?.text || "").trim();
    verified = verified.replace(/^```[a-z]*\n/i, "").replace(/\n```$/, "").trim();
    if (!isHardHandwritingTextSane(verified, firstText, 2.2)) {
      console.warn(`[Manuscrito difícil] Conferência descartada (resposta suspeita: ${verified.length} chars vs ${firstText.length}). Mantendo a 1ª leitura.`);
      return null;
    }
    const before = new Set(firstText.toLowerCase().split(/\s+/));
    const changed = verified.toLowerCase().split(/\s+/).filter(w => !before.has(w)).length;
    const doubts = (verified.match(/\[\?/g) || []).length;
    console.log(`[Manuscrito difícil] Conferência aplicada na chave ..${keyHash}: ~${changed} palavras diferentes da 1ª leitura, ${doubts} dúvida(s) sinalizada(s).`);
    return verified;
  } catch (e: any) {
    console.warn("[Manuscrito difícil] Conferência falhou — mantendo a 1ª leitura:", e?.message || e);
    return null;
  }
}
