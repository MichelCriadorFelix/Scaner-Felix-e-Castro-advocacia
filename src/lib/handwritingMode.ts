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
    await withTimeout(page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise, 60000, "Render em alta resolução travou");
    const blob = await enhanceImageForGemini(canvas, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, false);
    canvas.width = 0; canvas.height = 0;
    return blob;
  } catch (e: any) {
    console.warn("[Releitura automática] Falha ao renderizar a página em alta resolução:", e?.message || e);
    return null;
  }
}
