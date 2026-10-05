// Núcleo PURO (sem navegador, sem localStorage) da leitura de documentos por IA — usado pelo navegador
// (src/lib) E pelo servidor (api/). Existe pra os dois caminhos usarem EXATAMENTE os mesmos prompts,
// regras e verificações. Gerado a partir dos módulos que já existiam; texto dos prompts inalterado.

// ── Modelos ──────────────────────────────────────────────────────────────────────────────
export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (melhor leitura de manuscrito)" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (manuscritos difíceis)" },
];
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// Ordem de tentativa: o modelo escolhido primeiro; no modo "melhor primeiro" (releitura automática)
// os que leram melhor vêm na frente, independentemente do seletor.
export function buildModelCascade(selected, bestFirst = false) {
  const all = GEMINI_MODEL_OPTIONS.map(m => m.value);
  const sel = all.includes(selected) ? selected : DEFAULT_GEMINI_MODEL;
  if (bestFirst) {
    const best = ["gemini-3.8-flash", "gemini-3.5-flash"].filter(m => all.includes(m));
    const ordered = [...best, sel, ...all];
    return ordered.filter((m, i) => ordered.indexOf(m) === i);
  }
  return [sel, ...all.filter(v => v !== sel)];
}

// Gemini 3.x: a Google recomenda MANTER a temperatura padrão (1.0) — valores baixos podem causar
// loop e degradação. Só a geração anterior (2.5) segue com temperatura baixa.
export function temperatureConfigFor(model, desired) {
  return /^gemini-3/.test(model) ? {} : { temperature: desired };
}

// Os Flash-Lite (3.1/3.5) e toda a linha 3.x aceitam "thinkingLevel". O 2.5-flash NÃO aceita (400
// "Thinking level is not supported for this model"): usa thinkingBudget em tokens.
// "low" (páginas normais) = 1024; "medium" = dinâmico (-1); "high" = 12288 (teto do 2.5 é 24576).
export function getThinkingConfigForModel(model, level) {
  if (/^gemini-2\.5/.test(model)) {
    return { thinkingBudget: level === "high" ? 12288 : level === "medium" ? -1 : 1024 };
  }
  return { thinkingLevel: level };
}

// ── Verificações de texto ────────────────────────────────────────────────────────────────
export function containsDegenerateRepetition(text) {
  if (!text || text.length < 2000) return false;
  const match = text.slice(0, 300000).match(/(.{1,50})\1{40,}/);
  return !!match && match[0].length >= 2000;
}

export function isTruncatedResponse(res) {
  try {
    return res?.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  } catch (e) {
    return false;
  }
}

export function countIllegibleMarks(text) {
  return (text.match(/\[ILEG[ÍI]VEL\]/gi) || []).length;
}

export function isHardHandwritingTextSane(text, reference, maxFactor) {
  return (
    text.length >= reference.length * 0.5 &&
    text.length <= reference.length * maxFactor &&
    !/[一-鿿぀-ヿ가-힯]/.test(text) &&
    !containsDegenerateRepetition(text)
  );
}

// Mesma limpeza que o navegador aplicava ao texto de cada página.
export function cleanTranscription(text) {
  return text
    .replace(/_{5,}/g, '___')
    .replace(/-{5,}/g, '---')
    .replace(/(\n[ \t]*\n){3,}/g, '\n\n')
    .trim();
}

// ── Prompts ──────────────────────────────────────────────────────────────────────────────
export function getPadraoOuroPrompt() {
  return `Você é o Transcritor e Reconstituidor de Documentos Jurídicos Oficial de Elite (PADRÃO GOD / PADRÃO OURO) do escritório Felix & Castro Advocacia. Sua missão de altíssima relevância e responsabilidade é produzir uma transcrição 100% IDÊNTICA, VERBATIM E LITERAL de todas as páginas do documento fornecido.

Nenhuma palavra, número, sigla, cabeçalho, rodapé, CNPJ, nota marginal, data ou elemento de tabela do documento original deve ser omitido, ignorado, filtrado ou resumido. Qualquer desvio ou omissão comprometerá a integridade do processo judicial.

══════════════════════════════════════════════════
REGRAS ABSOLUTAS DE TRANSCRIÇÃO (PADRÃO OURO)
══════════════════════════════════════════════════

1. TRANSCRIÇÃO INTEGRAL E LITERAL:
   - Transcreva TODO e qualquer texto visível na imagem, exatamente na ordem em que aparece, de cima para baixo.
   - NÃO ignore cabeçalhos institucionais, logotipos descritos por extenso, brasões, rodapés, números de página, notas marginais, selos, marcas d'água, assinaturas, certidões ou termos formais do Diário Oficial.
   - Se o diário oficial ou documento contiver certidões, portarias de aposentadoria de terceiros, exonerações, atos ou decisões, transcreva TUDO do início ao fim da página sem omitir nada.
   - NÃO faça resumos, sinopses ou simplificações. O advogado precisa do texto INTEGRAL exatamente como está no original.

2. PRESERVAÇÃO DE TABELAS E FORMULÁRIOS (DIÁRIO OFICIAL / CNIS / HOLERITES / INSS / LAUDOS):
   - Se o documento contiver dados tabulares (como extratos do CNIS, vínculos, remunerações, laudos periciais com qualificadores b1 a b8 ou d1 a d9, questionários de Atividades e Participação):
     - Reconstitua a tabela fielmente em tabelas Markdown limpas e organizadas (| Coluna 1 | Coluna 2 | ... |).
     - Indique opções marcadas com [X] e desmarcadas com [ ] ou transcreva diretamente o item e o valor selecionado.
     - Mantenha todos os códigos de indicadores previdenciários (ex: PREV-EXT, PEXT, PREC-MENOR-MIN, IRECF-INDP, etc) com exatidão.
     - Se o documento tiver múltiplas colunas de texto (como em Diários Oficiais), leia as colunas na ordem lógica correta.

3. REGRAS ANTI-LOOP E FORMATAÇÃO LIMPA (EXTREMAMENTE CRÍTICO):
   - NUNCA, em hipótese alguma, repita caracteres como sublinhados ('_'), traços ('-'), barras ('|'), pontos ou espaços para desenhar linhas ou formulários.
   - Para linhas de assinatura em branco ou campos de formulário não preenchidos, use simplesmente '[Assinatura]' ou '___' (no máximo 3 a 5 caracteres).
   - NUNCA use '&nbsp;' ou sequências de espaços em branco.
   - Se uma página estiver em branco ou quase vazia, transcreva apenas o rodapé/cabeçalho existente e finalize a resposta sem repetições.

4. ZERO OMISSÃO E ZERO ALUCINAÇÃO (ATENÇÃO AOS NOMES):
   - Jamais invente ou modifique nomes, números, CPFs, datas ou valores.
   - É ESTRITAMENTE PROIBIDO resumir ou abreviar nomes de pessoas. Todos os nomes devem ser transcritos completos e por extenso.
   - Para caracteres de fato ilegíveis por rasuras ou má qualidade extrema do scanner, use '[ILEGÍVEL]'.

5. DECIFRAÇÃO DE LAUDOS MÉDICOS, RECEITUÁRIOS E PRONTUÁRIOS:
   - Ao analisar laudos médicos periciais, prontuários, receitas, atestados e exames com letra cursiva ou manuscrita ("letra de médico"):
     - Mobilize seu vocabulário médico e farmacológico profundo para decifrar a caligrafia pelo contexto clínico.
     - Identifique com extrema fidelidade: Queixa Principal, Anamnese, Diagnósticos, Códigos de Doenças (CID-10 e CID-11), nomes de medicamentos, dosagens, posologias, tempo de afastamento, datas e carimbos (Nome do médico, CRM e UF).

6. TRATAMENTO DE ASSINATURAS E ELEMENTOS VISUAIS:
   - Se houver assinatura visível, transcreva como: [Assinatura Manuscrita: Nome] ou [Assinatura Digital Detectada].
   - Se houver fotos/selfies de validação biométrica, transcreva apenas como [Foto de Validação Biométrica].
   - Se houver GRÁFICOS ou TRAÇADOS DE EXAME (eletroneuromiografia, eletrocardiograma, eletroencefalograma, espirometria) ou IMAGENS MÉDICAS (raio-x, ressonância, tomografia, ultrassonografia) sem conteúdo textual: NÃO descreva, interprete ou tente "ler" a forma visual do gráfico/imagem — isso pode gerar alucinação. Insira apenas o marcador fixo e único: [Imagem/Gráfico de Exame - não reproduzível em texto]. Continue transcrevendo normalmente todo texto ao redor (cabeçalho, tabela de valores numéricos, laudo escrito do médico, CRM).

7. ESTRUTURAÇÃO DE SAÍDA:
   - No início de sua resposta, forneça os metadados identificados do documento para controle:
     - TÍTULO: [Título principal exato]
     - TIPO: [Classificação precisa do documento]
     - ÁREA: [Previdenciário / Trabalhista / Consumidor / Cível / Múltiplas]
     - OBS: [Observações importantes se houver, ou omita]
   - Em seguida, insira obrigatoriamente a linha divisória: ══════════════════════════════════════════════════
   - E então forneça a **TRANSCRIÇÃO LITERAL E INTEGRAL DO TEXTO DO DOCUMENTO**:`;
}


export function buildClientNameHint(clientName) {
  const name = (clientName || "").trim();
  if (!name) return "";
  return `\n- Dica de contexto: a pasta deste documento se chama "${name}". Use isso APENAS pra conferir se um nome manuscrito parecido é o dela (se as letras forem compatíveis, escreva o nome completo da dica). Se o nome escrito no papel for claramente outro, transcreva o que está no papel. NUNCA escreva um nome que não esteja no papel.`;
}

export const BASE_TRANSCRIPTION_TEXT = "Leia a imagem e realize a transcrição literal, verbatim, 100% integral sob a orientação do Transcritor de Elite configurado no sistema.";

export const HARD_HANDWRITING_RULES = `
MODO MANUSCRITO DIFÍCIL — regras extras (têm prioridade sobre a ideia de "parecer completo"):
- Leia palavra por palavra, comparando o formato das letras. Primeiro identifique que TIPO de documento é (laudo médico, cartão de ponto, recibo, certidão, contrato, mandado, ordem de serviço...) e use o que está IMPRESSO no papel (timbre, cabeçalho, formulário, carimbo) e o vocabulário habitual DESSE tipo de documento pra decifrar.
- Se você NÃO tiver razoável certeza de uma palavra, NÃO complete com algo só porque é plausível: escreva a melhor leitura seguida de [?] (ex.: "Discais[?]"). Se nada puder ser lido, use [ILEGÍVEL]. Marcar a dúvida é MAIS importante do que entregar o texto aparentemente completo.
- Números de registro profissional (CRM, OAB, CREA...), CPF, CNPJ, número de processo, valores em reais, horários, datas, doses e códigos: só escreva o que você consegue ler com clareza; dígito duvidoso vira [?]. NUNCA invente dígitos.
- Carimbo borrado ou desbotado: transcreva só as partes legíveis, o resto como [ILEGÍVEL].`;

export function getHardHandwritingSystemPrompt() {
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


export function buildTranscriptionUserText(hard, clientName) {
  if (!hard) return BASE_TRANSCRIPTION_TEXT;
  return BASE_TRANSCRIPTION_TEXT + "\n" + HARD_HANDWRITING_RULES + buildClientNameHint(clientName);
}

// Instrução do JUIZ do modo difícil (compara as leituras e confere pela coerência do conteúdo).
export function buildJudgeSystemInstruction(secondText, clientName, hoje) {
  return `Você é o REVISOR-JUIZ de transcrições de documentos manuscritos (médicos, trabalhistas, cíveis, de consumo...) do escritório Félix & Castro Advocacia. Receberá a IMAGEM de uma página e ${secondText ? 'DUAS transcrições independentes (Leitura A e Leitura B)' : 'uma transcrição (Leitura A)'}. Devolva a transcrição FINAL.
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
6. Responda SOMENTE com a transcrição final completa, sem comentários e sem blocos de código.${buildClientNameHint(clientName)}`;
}

export function buildJudgeUserText(firstText, secondText) {
  return secondText
    ? `LEITURA A:\n<<<\n${firstText}\n>>>\n\nLEITURA B:\n<<<\n${secondText}\n>>>\n\nRelia a imagem, compare as duas leituras e devolva a transcrição final.`
    : `LEITURA A:\n<<<\n${firstText}\n>>>\n\nRelia a imagem e devolva a transcrição final.`;
}

// Instrução de CONTINUAÇÃO quando a resposta foi cortada por limite de tokens.
export function buildContinuationInstruction(systemPrompt, partialTextSoFar) {
  return `${systemPrompt}

══════════════════════════════════════════════════
MODO CONTINUAÇÃO (ATENÇÃO MÁXIMA):
══════════════════════════════════════════════════
A transcrição desta MESMA página foi CORTADA no meio por limite de tamanho de resposta. Abaixo está o final do
que você mesmo já transcreveu até agora (pode terminar no meio de uma palavra, frase ou linha de tabela).
Sua tarefa agora é APENAS continuar a transcrição EXATAMENTE de onde ela parou, olhando a imagem de novo.
REGRAS OBRIGATÓRIAS:
1. NÃO repita nada do texto já transcrito abaixo.
2. NÃO reinicie a transcrição do começo da página.
3. Responda SOMENTE com a continuação (o texto novo que vem depois do que já foi transcrito).
4. Se o texto já transcrito terminou no meio de uma palavra, complete a palavra e continue dali.

--- FINAL DO TEXTO JÁ TRANSCRITO (NÃO REPETIR ISTO) ---
${partialTextSoFar.slice(-2500)}
--- FIM DO TRECHO JÁ TRANSCRITO — CONTINUE A PARTIR DAQUI ---`;
}
