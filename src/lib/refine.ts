// @ts-nocheck
import { generateTextViaServer } from './serverOcr';
import { extractNamesFromText, cleanRepeatedWordsInName, applyLocalOCRCorrections } from './textQuality';

export async function refineTextWithGemini(mangledText) {
  const systemInstruction = `Você é um corretor e reconstrutor de textos ortográficos de altíssima precisão e inteligência do escritório Felix & Castro Advocacia.
Sua tarefa é analisar um texto transcrito por leitores automáticos (OCR) que veio com ruídos, símbolos corrompidos, letras trocadas por números ou pontuações bizarras, e RECONSTRUIR o texto de forma limpa, fluida e impecável em português correto e formal.

══════════════════════════════════════════════════
REGRAS CRÍTICAS DE REFINAMENTO:
══════════════════════════════════════════════════
1. CORREÇÃO DE PALAVRAS CORROMPIDAS:
   - Identifique e conserte palavras estragadas pelo leitor (ex: "tJnidaOe" -> "Unidade", "Munlcip10" -> "Município", "u.u01" -> "u.u", ou conserte o fluxo silábico).
   - Corrija erros de grafia comuns ou acentuações destruídas (ex: "CONTRARREFER~NCIA" -> "CONTRARREFERÊNCIA", "EtõirnYWPIRES-DE_O_LIV-EIRA" -> "LANETONE TAVARES PIRES DE OLIVEIRA", etc).

2. ELIMINAÇÃO DE RUÍDO:
   - Elimine símbolos espúrios, sequências de traços longos ou iguais (como "=====================-", "---------") que foram lidos de tabelas escaneadas, mas mantenha a separação limpa do texto.
   - Remova ruídos como "•", "■", "~", "|", "\\", "_", "=" no meio das palavras.

3. PRESERVAÇÃO DE DADOS CRÍTICOS (FUNDO DE VERDADE):
   - NUNCA invente, mude ou ignore dados reais como NOMES, DATAS, CPFs, CPFs com pontuação, números de processo, CRMs, RG, telefones ou CNPJ. Estes dados devem ser mantidos idênticos, apenas corrigindo se houver caracteres estranhos no meio do nome. Por exemplo: se o nome é "LANETONE TAVARES PIRES DE OLIVEIRA" e veio "L_A-N-E-T-O-N-E...", limpe os traços para que fique o nome limpo e correto.
   - É ESTRITAMENTE PROIBIDO abreviar ou resumir os nomes das pessoas. O nome completo de todos os indivíduos deve ser mantido de forma estendida, idêntica ao original.
   - Preserve o conteúdo original inteiro. NÃO RESUMA, NÃO COMENTE E NÃO EXPLIQUE. Sua resposta deve conter APENAS o texto reconstruído e nada mais.

4. MARCAS DE DÚVIDA DA LEITURA (INTOCÁVEIS): preserve EXATAMENTE toda marca do tipo [?], [?: opção A | opção B] e [ILEGÍVEL]. Nunca escolha uma opção, nunca complete um [ILEGÍVEL], nunca apague a marca.

5. MANTER MARCADORES DE PÁGINA:
   - Se o texto contiver marcadores estruturais de página como "[PÁGINA 1 - TEXTO DIGITAL NATIVO]" ou "[PÁGINA X - OCR BRUTO (Y%)]", mantenha-os idênticos, apenas atualizando o título para "[PÁGINA X - REFINADO VIA IA JURÍDICA]" para indicar que o texto foi otimizado e refinado com inteligência artificial.`;

  const refined = await generateTextViaServer({
    text: "Por favor, reconstrua e refine este texto ruidoso de OCR, corrigindo as palavras no vocabulário oficial em português, removendo símbolos estranhos de tabelas, mas preservando TODOS os nomes, CPFs, números e datas de forma verbatim e idêntica:\n\n" + mangledText,
    systemInstruction,
    temperature: 0.1,
    maxOutputTokens: 65536,
    thinking: 'low',
    timeoutMs: 90000,
  }).catch((err) => { console.warn('[Refinamento IA] Falha no servidor:', err); return ''; });
  if (refined) return refined.trim();
  throw new Error("Não foi possível refinar o texto com a IA agora.");
}

export function splitTextIntoCleanChunks(text: string, maxChunkSize: number = 12000): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    if (text.length - currentIndex <= maxChunkSize) {
      chunks.push(text.slice(currentIndex));
      break;
    }
    
    // Encontrar ponto ideal de corte por volta de maxChunkSize
    let splitIndex = currentIndex + maxChunkSize;
    
    // Janela de busca retroativa para evitar cortar palavras ou linhas no meio
    const searchWindow = text.slice(currentIndex, splitIndex);
    
    // Tenta cortar em quebra de página dupla ou cabeçalho de documento
    const dNL = searchWindow.lastIndexOf("\n\n");
    if (dNL !== -1 && dNL > maxChunkSize * 0.4) {
      splitIndex = currentIndex + dNL;
    } else {
      // Tenta cortar em quebra de linha simples
      const sNL = searchWindow.lastIndexOf("\n");
      if (sNL !== -1 && sNL > maxChunkSize * 0.4) {
        splitIndex = currentIndex + sNL;
      } else {
        // Corta em espaço
        const spc = searchWindow.lastIndexOf(" ");
        if (spc !== -1 && spc > maxChunkSize * 0.4) {
          splitIndex = currentIndex + spc;
        }
      }
    }
    
    chunks.push(text.slice(currentIndex, splitIndex));
    currentIndex = splitIndex;
    
    // Pula espaços em branco/quebras de linha iniciais do próximo chunk
    while (currentIndex < text.length && /\s/.test(text[currentIndex])) {
      currentIndex++;
    }
  }
  
  return chunks;
}

export async function refineChunkWithGemini(
  chunkText: string,
  clientName: string,
  chunkIndex: number,
  totalChunks: number,
  sortedKeys: string[],
  addLogCallback?: (msg: string) => void
): Promise<string> {
  const systemInstruction = `Você é um refinador de textos jurídicos do escritório Félix & Castro Advocacia, especialista em revisão gramatical profunda e correção minuciosa de ruídos de OCR.
Sua missão única é revisar o trecho de texto fornecido pelo usuário e entregar uma versão impecável, livre de erros ortográficos, concordâncias truncadas ou caracteres espúrios gerados pelo escaneamento.

══════════════════════════════════════════════════
DIRETRIZES CRÍTICAS PARA REVISÃO DO TRECHO:
══════════════════════════════════════════════════
1. PADRONIZAÇÃO E CONSISTÊNCIA DE NOMES:
   - Cliente principal (Nome Oficial da pasta): "${clientName}". Se encontrar qualquer variação truncada ou com erro de OCR (ex: "Jalro", "Jairo Gomes Crux", ou abreviações inconsistentes do cliente), mude para: "${clientName}".
   - Advogados do escritório: "Michel Santos Felix", "Luana de Oliveira Castro Pacheco", "Flávia Zacarias Gonçalves". Corrija qualquer grafia errônea (ex: "Michel pereira felix" -> "Michel Santos Felix").
   - Genitora/Representante: "Sulamita Gomes da Cruz Silva". Corrija qualquer erro de digitação/OCR neste nome.

2. CORREÇÃO DE PALAVRAS CORROMPIDAS (RUÍDO DE OCR):
   - Corrija as palavras com precisão e profundidade de forma contextual (ex: "tJnidaOe" -> "Unidade", "Munlcip10" -> "Município", "Previdoncia" -> "Previdência", "beneficlo" -> "benefício", "Nlcl" -> "NIT").
   - Elimine símbolos ruidosos espúrios que sobraram nos textos originais, mas preserve absolutamente toda a formatação markdown legítima (tabelas, negritos, cabeçalhos, listas).

3. PRESERVAÇÃO INTEGRAL E SEGURANÇA JURÍDICA:
   - NUNCA resuma, abrevie ou delete qualquer parte do texto. Não ignore dados reais.
   - É ESTRITAMENTE PROIBIDO PULAR OU DELETAR DOCUMENTOS. Se o trecho contiver "DOCUMENTO 6", "DOCUMENTO 7", etc., você DEVE transcrever o conteúdo deles INTEGRALMENTE, sem remover absolutamente nenhuma linha ou parágrafo.
   - Se o trecho contiver tabelas, listas de números, extratos bancários, logs do INSS, históricos de remuneração ou qualquer dado repetitivo (comum em processos previdenciários), VOCÊ DEVE PRESERVAR 100% DESTE CONTEÚDO EXATAMENTE COMO ESTÁ. NUNCA sumarize, encurte ou pule tabelas/números.
   - É ESTRITAMENTE PROIBIDO resumir ou abreviar os nomes das pessoas (clientes, testemunhas, partes, juízes, etc). O nome completo DEVE ser mantido exatamente como aparece no documento original, sendo estendido e jamais abreviado.
   - Todos os números de documentos (CPF, RG, NIT, CNPJ), números de processos, datas, valores monetários, telefones e endereços devem ser mantidos IDÊNTICOS aos originais.
   - Mantenha intactos os marcadores estruturais do compilado, como divisórias (ex: "------------------"), títulos de documentos (ex: "DOCUMENTO X: ...") e tags de página (ex: "[PÁGINA X - TEXTO DIGITAL NATIVO]").

4. MARCAS DE DÚVIDA DA LEITURA (INTOCÁVEIS): preserve EXATAMENTE, caractere por caractere, toda marca do tipo [?], [?: opção A | opção B] e [ILEGÍVEL]. NUNCA escolha uma das opções por conta própria, NUNCA complete um [ILEGÍVEL] e NUNCA apague a marca: ela sinaliza que um humano precisa conferir o papel.

5. RETORNO LIMPO:
   - Retorne APENAS o texto revisado final correspondente ao trecho fornecido, sem qualquer comentário explicativo, introdução ou conclusão.`;

  const refinedChunk = await generateTextViaServer({
    text: `Por favor, revise o seguinte trecho de texto jurídico de forma minuciosa, corrigindo erros de OCR, ortografia profunda e unificando nomes. NÃO CORTE O FIM DO TEXTO, PRESERVE ATÉ A ÚLTIMA PALAVRA:

${chunkText}`,
    systemInstruction,
    temperature: 0.1,
    maxOutputTokens: 65536,
    thinking: 'low',
    timeoutMs: 90000,
  }).catch((err) => { console.warn(`[Refinamento Trecho IA] Falha no servidor (trecho ${chunkIndex + 1}):`, err); return ''; });
  if (refinedChunk) return refinedChunk.trim();

  throw new Error(`Não foi possível refinar o trecho ${chunkIndex + 1} de ${totalChunks} com a IA agora.`);
}

export async function refineCompiledTextWithGemini(
  compiledText: string, 
  clientName: string, 
  addLogCallback?: (msg: string) => void,
  onProgressCallback?: (progress: number, statusText?: string) => void
): Promise<string> {
  if (addLogCallback) {
    addLogCallback(`[${new Date().toLocaleTimeString()}] 🔍 Iniciando auditoria e cruzamento inteligente de dados cadastrais...`);
  }

  // 1. Extração de candidatos a nomes próprios
  const extractedNames = extractNamesFromText(compiledText);
  if (addLogCallback) {
    addLogCallback(`[${new Date().toLocaleTimeString()}] 📝 Encontrados ${extractedNames.length} termos e nomes próprios na pasta para análise de consistência.`);
  }

  let nameMapping: { [key: string]: string } = {};

  if (extractedNames.length > 0) {
    if (addLogCallback) {
      addLogCallback(`[${new Date().toLocaleTimeString()}] 🧠 Consultando a IA para cruzamento ultra-rápido de inconsistências cadastrais...`);
    }

    const systemInstruction = `Você é um auditor de banco de dados cadastrais especializado em unificação e padronização de registros do escritório Félix & Castro Advocacia.
Sua missão é analisar uma lista de nomes extraídos via OCR de um processo e identificar quais deles são variações incorretas, parciais ou truncadas de pessoas reais relevantes do caso.

As pessoas relevantes da causa e seus nomes corretos oficiais são:
1. Cliente Principal: "${clientName}" (se aplicável, use como o padrão ouro para o cliente)
2. Advogados: "Michel Santos Felix", "Luana de Oliveira Castro Pacheco", "Flávia Zacarias Gonçalves"
3. Genitora/Representante (se houver na lista, ex: "Sulamita Gomes da Cruz Silva")

Identifique as inconsistências de grafia, abreviações ou erros de leitura de OCR (como "Jalro" em vez de "Jairo", ou nomes parciais como "Jairo Gomes da Cruz Silva" que deveriam ser completados para "${clientName}") e mapeie de forma inteligente.
Preste muita atenção ao exemplo dado pelo usuário:
- Se o cliente correto for "${clientName}", e na lista houver "Michel pereira felix" ou variações de grafia incorretas de Michel, mapeie para "Michel Santos Felix".
- Se houver nomes parciais do cliente principal, mapeie para "${clientName}".

Retorne APENAS um objeto JSON no formato abaixo, sem qualquer formatação markdown ou comentário explicativo, contendo as substituições que devem ser feitas no texto para unificá-lo:
{
  "nome_encontrado_ruidoso_ou_parcial": "NOME_CORRETO_PADRONIZADO"
}
Se não houver nenhuma inconsistência na lista, retorne apenas um objeto vazio {}.`;

    const promptText = `Nomes extraídos da pasta:\n${JSON.stringify(extractedNames, null, 2)}`;
    try {
      const mappingText = await generateTextViaServer({
        text: promptText,
        systemInstruction,
        temperature: 0.1,
        json: true,
        timeoutMs: 60000,
      });
      try {
        nameMapping = JSON.parse(mappingText.trim());
      } catch (jsonErr) {
        const jsonMatch = mappingText.match(/\{[\s\S]*\}/);
        if (jsonMatch) nameMapping = JSON.parse(jsonMatch[0].trim());
      }
    } catch (err) {
      console.warn('[Compilador IA] Correção de nomes pelo servidor falhou:', err);
    }
  }

  // 2. Aplicar mapeamento de nomes localmente antes de fatiar
  let refinedText = compiledText;
  const appliedCorrections: string[] = [];

  for (const [wrongNameRaw, correctNameRaw] of Object.entries(nameMapping)) {
    const wrongName = cleanRepeatedWordsInName(wrongNameRaw.trim());
    const correctName = cleanRepeatedWordsInName(correctNameRaw.trim());

    if (
      typeof wrongName === 'string' && 
      typeof correctName === 'string' && 
      wrongName !== "" && 
      correctName !== "" &&
      wrongName.toLowerCase() !== correctName.toLowerCase()
    ) {
      const escaped = wrongName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
      
      if (regex.test(refinedText)) {
        refinedText = refinedText.replace(regex, correctName);
        appliedCorrections.push(`• "${wrongName}" ➔ "${correctName}"`);
      }
    }
  }

  // Deduplica e higieniza qualquer sobrenome ou bloco duplicado após as substituições
  refinedText = cleanRepeatedWordsInName(refinedText);

  if (addLogCallback) {
    if (appliedCorrections.length > 0) {
      addLogCallback(`[${new Date().toLocaleTimeString()}] ⚖️ Inconsistências cadastrais harmonizadas localmente no lote principal:`);
      appliedCorrections.forEach(c => addLogCallback(`   ${c}`));
    } else {
      addLogCallback(`[${new Date().toLocaleTimeString()}] ✨ Nenhuma inconsistência grave de grafia de nomes detectada no cruzamento inicial.`);
    }
  }

  // 3. Aplicar correções locais comuns (ortografia estática e símbolos)
  refinedText = applyLocalOCRCorrections(refinedText);

  // 4. PULO DE IA: Os documentos individuais JÁ FORAM extraídos com IA (OCR via Gemini). 
  // Executar a IA novamente em todo o texto massivo fará a IA truncar e dropar páginas (causando perda de provas).
  // Retornamos aqui o texto compilado que já teve o nome arrumado e ortografia comum fixada localmente.
  
  if (addLogCallback) {
    addLogCallback(`[${new Date().toLocaleTimeString()}] 🤝 Compilando trechos e finalizando arquivo consolidado com 100% de integridade das provas...`);
  }

  return refinedText;
}

// Substituição cirúrgica do texto de uma página específica
export function replacePageTextInDoc(fullText: string, pageNum: number, newPageText: string, isDigital: boolean = false): string {
  // Regex altamente precisa para encontrar somente marcadores de cabeçalho de página que comecem no início do texto ou de uma linha.
  // O colchete de abertura "[" é OBRIGATÓRIO (não opcional): sem isso, rodapés comuns em documentos do INSS/TSE
  // como "Página 1 de 51" (texto normal do corpo, sem colchete) eram confundidos com um cabeçalho de página real,
  // cortando a substituição no lugar errado e deixando o conteúdo antigo (com erro) grudado após o texto novo.
  const regexHeader = new RegExp(
    "(?:^|\\r?\\n)(?:\\[(?:ERRO\\s+CR[ÍI]TICO\\s+NA\\s+|TEXTO\\s+DIGITAL\\s+NATIVO\\s+NA\\s+|RECUPERADO\\s+VIA\\s+IA\\s+JUR[ÍI]DICA\\s+NA\\s+)?|\\*\\*)(?:P[ÁA]GINA|PAGINA)\\s+" + pageNum + "\\b[^\\n\\*]*?(?:\\]|\\*\\*)?(?:\\r?\\n|$)",
    "i"
  );

  const match = regexHeader.exec(fullText);
  if (!match) {
    console.warn(`[Recuperar páginas] Cabeçalho original não encontrado para a pág ${pageNum}. Fazendo append.`);
    const prefix = isDigital
      ? `[PÁGINA ${pageNum} - TEXTO DIGITAL NATIVO]\n`
      : `[PÁGINA ${pageNum} - RECUPERADO VIA IA JURÍDICA]\n`;
    return fullText + `\n\n` + prefix + newPageText;
  }

  const startIndex = match.index;
  // Encontra o início da PRÓXIMA página real (começando no início da linha) para fixar o limite do corte, preservando completamente as demais páginas.
  // Mesma exigência do colchete obrigatório, pelo mesmo motivo.
  const nextHeaderRegex = /(?:\r?\n)(?:\[(?:ERRO\s+CR[ÍI]TICO\s+NA\s+|TEXTO\s+DIGITAL\s+NATIVO\s+NA\s+|RECUPERADO\s+VIA\s+IA\s+JURÍDICA\s+NA\s+)?|\*\*)(?:P[ÁA]GINA|PAGINA)\s+\d+\b/gi;
  nextHeaderRegex.lastIndex = startIndex + match[0].length;
  
  const nextMatch = nextHeaderRegex.exec(fullText);
  let endIndex = fullText.length;
  if (nextMatch) {
    endIndex = nextMatch.index;
  }
  
  const before = fullText.substring(0, startIndex);
  const after = fullText.substring(endIndex);
  
  const prefix = isDigital 
    ? `[PÁGINA ${pageNum} - TEXTO DIGITAL NATIVO]\n` 
    : `[PÁGINA ${pageNum} - RECUPERADO VIA IA JURÍDICA]\n`;
  const replacement = prefix + newPageText + "\n\n";
  return (before.trim() ? before.trim() + "\n\n" : "") + replacement + (after.trim() ? after.trim() : "");
}
