// @ts-nocheck

// Prompt de sistema compartilhado entre o Gemini e qualquer outro provedor de IA de visão
// (ex: NVIDIA Nemotron) — garante que as mesmas regras de transcrição (PADRÃO OURO) valham
// independente de qual modelo o advogado escolher no seletor.
export { getPadraoOuroPrompt } from '../../shared/ocrCore.js';
