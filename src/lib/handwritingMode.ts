// @ts-nocheck
import { isMistralSelected, temperatureConfigFor, getThinkingConfigForModel, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY } from './geminiModels';
import { containsDegenerateRepetition } from './textQuality';
import { withTimeout } from './async';
import { enhanceImageForGemini } from './image';
import { BASE_TRANSCRIPTION_TEXT, HARD_HANDWRITING_RULES, getHardHandwritingSystemPrompt, buildClientNameHint as buildClientNameHintFor, buildTranscriptionUserText as buildTranscriptionUserTextFor, buildJudgeSystemInstruction, buildJudgeUserText, isHardHandwritingTextSane, countIllegibleMarks } from '../../shared/ocrCore.js';

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
  return buildClientNameHintFor(ocrContextClientName);
}

export { BASE_TRANSCRIPTION_TEXT, HARD_HANDWRITING_RULES, getHardHandwritingSystemPrompt };

// Prompt de sistema ENXUTO do modo "Manuscrito difícil". O AI Studio leu os mesmos laudos com um
// pedido de uma linha; o prompt "Padrão Ouro" (dezenas de regras de tabelas, anti-loop, Diário
// Oficial...) compete com a atenção do modelo na hora de decifrar letra. Aqui ficam só a tarefa,
// o jeito de ler manuscrito e o formato de saída que o resto do app espera.

export function buildTranscriptionUserText(hard: boolean = hardHandwritingRuntime): string {
  return buildTranscriptionUserTextFor(hard, ocrContextClientName);
}

// Verificação de sanidade comum às respostas extras do modo "Manuscrito difícil" (2ª leitura e juiz):
// descarta resposta vazia, de tamanho muito diferente, com ideograma estranho ou em loop.

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
export { isHardHandwritingTextSane, countIllegibleMarks };

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
  const systemInstruction = buildJudgeSystemInstruction(secondText, ocrContextClientName, hoje);
  const userText = buildJudgeUserText(firstText, secondText);
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
