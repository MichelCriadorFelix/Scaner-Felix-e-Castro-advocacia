// @ts-nocheck

// ── Seleção de Modelo Gemini (escolhido pelo advogado na tela do Scanner) ────────────────
// As funções de OCR/refinamento ficam FORA do componente React (são módulo-level), então não
// têm acesso direto ao estado do React — por isso a escolha do advogado é lida/gravada
// diretamente do localStorage aqui, e cada chamada ao Gemini pega o modelo mais atual na hora.
// 22-23/09/2026: a linha 3.5/3.6/3.7/3.8 Flash entrou num apagão real e prolongado do
// próprio Google (503 "high demand" em 100% das chaves, confirmado pelo staff do Google
// nos fóruns como sobrecarga do lado do servidor, afetando free E pago igualmente, sem
// data de resolução). Removida da lista por ora — voltam a ser opção quando o Google
// resolver o incidente, mas até lá só desperdiçam tentativas na cascata.
//
// 2.5-flash (geração anterior, infraestrutura própria) virou o padrão: na prática não caiu
// nenhuma vez durante o apagão. Os Flash-Lite (3.1 e 3.5) entram como sucessores — mais
// baratos, multimodais, mas de uma geração otimizada pra custo/latência em vez de qualidade
// máxima, por isso ficam depois do 2.5 na cascata, não antes.
import { GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL, buildModelCascade, temperatureConfigFor, getThinkingConfigForModel } from '../../shared/ocrCore.js';
export { GEMINI_MODEL_OPTIONS, DEFAULT_GEMINI_MODEL, temperatureConfigFor, getThinkingConfigForModel };

// Modelo alternativo (provedor diferente, NVIDIA NIM) — fica FORA da cascata de reforço entre
// os Gemini porque usa uma API completamente diferente (formato OpenAI, chave própria). Só
// entra em uso quando o advogado escolhe ele explicitamente no seletor.
export const NVIDIA_NEMOTRON_MODEL = "nvidia-nemotron-3-nano-omni";
// OCR dedicada da Mistral (plano gratuito) — mesma lógica: fica fora da cascata Gemini,
// só entra quando escolhida explicitamente. Ao contrário do Gemini/NVIDIA (que fazem OCR +
// formatação numa chamada só), essa só extrai o texto bruto; o marcador de página é
// adicionado localmente (igual já acontece pros outros modelos) e o botão manual "Refinar
// com IA" continua disponível pra quem quiser aplicar as regras do Padrão Ouro depois.
export const MISTRAL_OCR_MODEL = "mistral-ocr-latest";
export const MODEL_OPTIONS = [
  ...GEMINI_MODEL_OPTIONS,
  { value: NVIDIA_NEMOTRON_MODEL, label: "NVIDIA Nemotron 3 Nano Omni" },
  { value: MISTRAL_OCR_MODEL, label: "Mistral OCR (gratuito)" },
];

export function getSelectedGeminiModel(): string {
  try {
    const stored = localStorage.getItem('lexscan_selected_model');
    if (stored && MODEL_OPTIONS.some(m => m.value === stored)) return stored;
  } catch (e) {}
  return DEFAULT_GEMINI_MODEL;
}

export function setSelectedGeminiModel(model: string) {
  try { localStorage.setItem('lexscan_selected_model', model); } catch (e) {}
}

// Monta a lista de modelos a tentar: o escolhido pelo advogado primeiro, seguido pelos outros
// 2 como reforço automático. As funções de OCR/refinamento JÁ SABEM alternar de modelo sozinhas
// quando um deles retorna sobrecarga/indisponibilidade (503/"high demand"/"unavailable") — esse
// mecanismo só não era usado porque antes só passávamos 1 modelo na lista. Isso é o que evita
// que uma instabilidade temporária do Google EM UM MODELO específico pare o app inteiro, já que
// os outros 2 modelos continuam disponíveis.
// Se o modelo escolhido no seletor for de outro provedor (NVIDIA/Mistral, sentinelas que não
// existem como modelo dentro da API do Gemini), usa o Gemini padrão em vez disso — protege
// qualquer chamada direta à API do Gemini de tentar usar "nvidia-..."/"mistral-..." como
// nome de modelo (o que gera 404 e desperdiça tentativas em cada chave do pool).
// A Mistral OCR rende bem só com imagem de alta resolução (~300 DPI). A imagem enviada ao
// Gemini (1600px, ~108 DPI) é pequena demais pra ela e é a principal causa de transcrição errada.
export function isMistralSelected(): boolean {
  return getSelectedGeminiModel() === MISTRAL_OCR_MODEL;
}
export const MISTRAL_IMAGE_MAX_DIMENSION = 2600;
export const MISTRAL_IMAGE_JPEG_QUALITY = 0.92;

export function getSafeGeminiModel(): string {
  const selected = getSelectedGeminiModel();
  return GEMINI_MODEL_OPTIONS.some(m => m.value === selected) ? selected : DEFAULT_GEMINI_MODEL;
}

export function getModelFallbackCascade(hard: boolean = false): string[] {
  return buildModelCascade(getSafeGeminiModel(), hard);
}

// Os Flash-Lite (3.1/3.5) aceitam "thinkingLevel" (semântico: "low"/"medium"), igual toda
// a linha 3.x. O 2.5-flash (geração anterior) NÃO aceita esse parâmetro — a API responde 400
// "Thinking level is not supported for this model" e a página inteira falha nesse modelo.
// O 2.5-flash usa o parâmetro antigo em tokens: 0 desliga o raciocínio (equivalente a "low"),
// -1 deixa o próprio modelo decidir dinamicamente quanto raciocinar (equivalente a "medium").
// Gemini 3.x: a Google recomenda MANTER a temperatura padrão (1.0) — valores baixos (como o 0.1 que
// o app mandava em tudo) podem causar loop e degradação. O AI Studio usa o padrão; o app não usava.
// Só a geração anterior (2.5) segue com temperatura baixa pra transcrição mais determinística.

