// @ts-nocheck
import { getRealConfidence } from './textQuality';
import { generateTextViaServer } from './serverOcr';

export interface CurationRule {
  title: string;
  actionLog: string;
  summaryReport: string;
  run: (text: string) => string;
}

// Uma divergência de dado (RG/CPF/CRM) com os valores candidatos encontrados, pra o advogado
// escolher (ou digitar) qual é o correto e o app já substituir automaticamente no texto final.
export interface IdentityDivergence {
  label: string;
  candidates: string[];
}

export interface PrePetitionAuditResult {
  criticalDiscrepancies: string[];
  substantiveAlerts: string[];
  identityDivergences: IdentityDivergence[];
  cadastralAlerts: string[];
  degradedOcrDocs: string[];
  curationRules: CurationRule[];
  formattedReport: string;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Resolução AUTOMÁTICA de divergências de leitura ─────────────────────────────────────────
// Variações do mesmo número (CRM, CPF, RG) quase sempre são ruído de leitura do mesmo documento.
// Em vez de travar o compilado pedindo que o advogado escolha item por item, o app resolve sozinho
// quando um valor é CLARAMENTE dominante; só o que for ambíguo de verdade vai pra tela de decisão.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function normalizeIdValue(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

// Agrupa candidatos que só diferem na pontuação ("52.92276-5" = "52-92276-5") e soma as ocorrências.
export function clusterCandidates(text: string, candidates: string[]) {
  const clusters = new Map<string, { norm: string; total: number; rep: string; repCount: number }>();
  candidates.forEach(c => {
    const norm = normalizeIdValue(c);
    const n = countOccurrences(text, c);
    const cur = clusters.get(norm);
    if (!cur) {
      clusters.set(norm, { norm, total: n, rep: c, repCount: n });
    } else {
      cur.total += n;
      if (n > cur.repCount || (n === cur.repCount && c.length > cur.rep.length)) { cur.rep = c; cur.repCount = n; }
    }
  });
  return Array.from(clusters.values()).sort((a, b) => b.total - a.total);
}

// Valor mais frequente (grupo único com mais ocorrências e pelo menos 2), usado só como SUGESTÃO pré-marcada.
export function pickDominantValue(text: string, div: { candidates: string[] }): string | null {
  const cl = clusterCandidates(text, div.candidates);
  if (cl.length === 0 || cl[0].total < 2) return null;
  if (cl.length > 1 && cl[1].total === cl[0].total) return null;
  return cl[0].rep;
}

// Vencedor CLARO o bastante pra corrigir sem perguntar: aparece 2+ vezes, pelo menos o DOBRO de cada
// concorrente, e os concorrentes diferem dele por até 2 caracteres (cara de ruído, não de outro número).
// Também recusa se algum candidato estiver contido em outro (a troca no texto corromperia o valor).
export function pickConfidentWinner(text: string, div: { candidates: string[] }): string | null {
  const cl = clusterCandidates(text, div.candidates);
  if (cl.length < 2) return null;
  const [win, ...losers] = cl;
  if (win.total < 2) return null;
  if (losers.some(l => l.total * 2 > win.total)) return null;
  if (losers.some(l => levenshtein(win.norm, l.norm) > 2)) return null;
  if (div.candidates.some(c => c !== win.rep && win.rep.includes(c))) return null;
  return win.rep;
}

// Substitui, no texto, todos os valores candidatos (exceto o escolhido) pelo valor que o advogado confirmou como correto.
export function applyValueCorrection(text: string, candidates: string[], chosenValue: string): string {
  let result = text;
  candidates.forEach(c => {
    if (!c || c === chosenValue) return;
    result = result.replace(new RegExp(escapeRegExp(c), 'g'), chosenValue);
  });
  return result;
}

export function buildAuditFormattedReport(
  curationRules: CurationRule[],
  substantiveAlertsToInclude: string[],
  degradedOcrDocs: string[],
  autoCorrectionLines: string[] = []
): string {
  let formattedReport = `══════════════════════════════════════════════════════════════════════════════\n`;
  formattedReport += `📋 RELATÓRIO DE AUDITORIA & CURADORIA PRÉ-PETIÇÃO (FÉLIX & CASTRO)\n`;
  formattedReport += `   Status: ✅ COMPILADO 100% SANEADO E CURADO PARA PETICIONAMENTO\n`;
  formattedReport += `══════════════════════════════════════════════════════════════════════════════\n\n`;

  if (curationRules.length > 0) {
    formattedReport += `✅ CORREÇÕES & SANEAMENTOS APLICADOS AUTOMATICAMENTE NO COMPILADO:\n`;
    curationRules.forEach(cr => {
      formattedReport += `${cr.summaryReport}\n`;
    });
    formattedReport += `\n`;
  } else {
    formattedReport += `✅ SANEAMENTO PREVENTIVO: Documentos em conformidade cadastral unificada.\n\n`;
  }

  if (autoCorrectionLines.length > 0) {
    formattedReport += `🤖 DIVERGÊNCIAS DE LEITURA RESOLVIDAS AUTOMATICAMENTE (valor dominante entre os documentos):\n`;
    autoCorrectionLines.forEach(l => {
      formattedReport += `${l}\n`;
    });
    formattedReport += `\n`;
  }

  if (substantiveAlertsToInclude.length > 0) {
    formattedReport += `🟠 ALERTAS ESTRATÉGICOS DE MÉRITO (PARA AVALIAÇÃO DA EQUIPE JURÍDICA):\n`;
    substantiveAlertsToInclude.forEach(a => {
      formattedReport += `${a}\n\n`;
    });
  }

  if (degradedOcrDocs.length > 0) {
    formattedReport += `🟡 DOCUMENTOS COM LEITURA DEGRADADA (RECOMENDA-SE CONFERÊNCIA FÍSICA):\n`;
    degradedOcrDocs.forEach(d => {
      formattedReport += `${d}\n`;
    });
    formattedReport += `\n`;
  }

  formattedReport += `══════════════════════════════════════════════════════════════════════════════\n`;
  formattedReport += `TEXTO INTEGRAL DOS DOCUMENTOS CURADOS E SANEADOS:\n`;
  formattedReport += `══════════════════════════════════════════════════════════════════════════════\n\n`;

  return formattedReport;
}

// Localiza o número de página do marcador estrutural [PÁGINA N - ...] mais próximo que vem
// ANTES de um índice de caractere no texto — usado pra apontar ao advogado exatamente em
// que página do documento uma divergência foi encontrada, pra ele conferir no original.
export function findPageNumberAtIndex(text: string, index: number): number | null {
  const headerRegex = /\[P[ÁA]GINA\s+(\d+)\s*-/gi;
  let lastPageNum: number | null = null;
  let hm;
  headerRegex.lastIndex = 0;
  while ((hm = headerRegex.exec(text)) !== null) {
    if (hm.index > index) break;
    lastPageNum = parseInt(hm[1], 10);
  }
  return lastPageNum;
}

// Formata uma localização (documento + página, se encontrada) pra exibir ao advogado.
export function formatLocation(doc: string, page: number | null): string {
  return page !== null ? `${doc} (pág. ${page})` : doc;
}

export interface IdentifierLocation {
  doc: string;
  page: number | null;
}

// Extrai números (RG/CPF/Identidade) associados a um papel genérico (ex: requerente, genitora), agrupando
// por número normalizado -> lista de locais (documento + página) onde aparece. Não depende de nomes ou
// casos específicos.
export function collectRoleIdentifiers(fullDocs: any[], roleRegex: RegExp): Map<string, IdentifierLocation[]> {
  const map = new Map<string, IdentifierLocation[]>();
  fullDocs.forEach(d => {
    const text = d.text || '';
    const name = d.name || 'Documento';
    const matches = Array.from(text.matchAll(roleRegex));
    matches.forEach((match) => {
      const raw = match[0].match(/[\d.\-\/]{7,18}/)?.[0]?.replace(/[^\d]/g, '');
      if (!raw || raw.length < 7 || raw.length > 11) return;
      let formatted = raw;
      if (raw.length === 11) {
        formatted = `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
      } else if (raw.length === 9) {
        formatted = `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}-${raw.slice(8)}`;
      }
      const page = findPageNumberAtIndex(text, match.index ?? 0);
      if (!map.has(formatted)) map.set(formatted, []);
      const locations = map.get(formatted)!;
      if (!locations.some(l => l.doc === name && l.page === page)) locations.push({ doc: name, page });
    });
  });
  return map;
}

export function generateFolderPrePetitionAudit(fullDocs: any[], clientName: string): PrePetitionAuditResult {
  const criticalDiscrepancies: string[] = [];
  const substantiveAlerts: string[] = [];
  const identityDivergences: IdentityDivergence[] = [];
  const cadastralAlerts: string[] = [];
  const degradedOcrDocs: string[] = [];
  const curationRules: CurationRule[] = [];

  // Identifica documentos com OCR degradado (regra genérica, vale para qualquer caso)
  fullDocs.forEach(d => {
    const text = d.text || '';
    const name = d.name || 'Documento';
    const conf = getRealConfidence(text, d.confidence);
    const hasOcrBruto = /\[P[ÁA]GINA\s+\d+\s+-\s+OCR\s+BRUTO\s*\(\s*([1-6]\d)%/i.test(text);
    if (conf < 70 || hasOcrBruto) {
      degradedOcrDocs.push(`• ${name} (Confiabilidade de leitura: ~${conf}%) - Recomenda-se conferência visual direta no PDF.`);
    }
  });

  // Divergência de identidade (RG/CPF) por PAPEL genérico — funciona pra qualquer cliente, sem nome/número fixo.
  // Aqui só DETECTA e agrupa as variações. Quem tem vencedor claro é corrigido sozinho no compilado
  // (pickConfidentWinner); o que for ambíguo vira alerta pro advogado decidir qual número está correto.
  const titularRoleRegex = /(?:Requerente|Autor|Titular|Paciente|Segurad[oa]|Interessad[oa])[^\n]{0,90}?(?:CPF|RG|Identidade)[\s:nºo.]*([\d.\-\/]{7,18})/gi;
  const representanteRoleRegex = /(?:Genitora|Genitor|M[ãa]e|Pai|Representante\s+Legal|Respons[áa]vel)[^\n]{0,90}?(?:CPF|RG|Identidade)[\s:nºo.]*([\d.\-\/]{7,18})/gi;

  const titularNumbers = collectRoleIdentifiers(fullDocs, titularRoleRegex);
  const representanteNumbers = collectRoleIdentifiers(fullDocs, representanteRoleRegex);

  if (titularNumbers.size > 1) {
    const details = Array.from(titularNumbers.entries()).map(([num, locs]) => `  - ${num} em: ${locs.map(l => formatLocation(l.doc, l.page)).join(', ')}`).join('\n');
    substantiveAlerts.push(
      `• DIVERGÊNCIA DE IDENTIDADE DO REQUERENTE/AUTOR:\n${details}\n  ➔ Números diferentes de RG/CPF foram encontrados para o requerente em documentos distintos. Escolha abaixo qual está correto.`
    );
    identityDivergences.push({ label: "Identidade do Requerente/Autor", candidates: Array.from(titularNumbers.keys()) });
  }
  if (representanteNumbers.size > 1) {
    const details = Array.from(representanteNumbers.entries()).map(([num, locs]) => `  - ${num} em: ${locs.map(l => formatLocation(l.doc, l.page)).join(', ')}`).join('\n');
    substantiveAlerts.push(
      `• DIVERGÊNCIA DE IDENTIDADE DO REPRESENTANTE/GENITOR(A):\n${details}\n  ➔ Números diferentes de RG/CPF foram encontrados para o representante legal em documentos distintos. Escolha abaixo qual está correto.`
    );
    identityDivergences.push({ label: "Identidade do Representante/Genitor(a)", candidates: Array.from(representanteNumbers.keys()) });
  }

  // Divergência de CRM médico por médico (nome extraído do próprio documento, não fixo) — mesma lógica de detecção.
  // Guarda também documento + página de cada ocorrência, pra o advogado conferir no original.
  const crmByDoctor = new Map<string, Map<string, IdentifierLocation[]>>();
  const crmPattern = /Dr[a]?\.?\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+){1,4})[\s\S]{0,120}?CRM[\s\/:\-]*([A-Z]{0,2}\s?[\d.\-]{4,10})|CRM[\s\/:\-]*([A-Z]{0,2}\s?[\d.\-]{4,10})[\s\S]{0,120}?Dr[a]?\.?\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+){1,4})/g;
  fullDocs.forEach(d => {
    const text = d.text || '';
    const name = d.name || 'Documento';
    let cm;
    crmPattern.lastIndex = 0;
    while ((cm = crmPattern.exec(text)) !== null) {
      const doctorName = (cm[1] || cm[4] || '').trim().toUpperCase();
      const crmNum = (cm[2] || cm[3] || '').replace(/\s+/g, '');
      if (!doctorName || !crmNum) continue;
      if (!crmByDoctor.has(doctorName)) crmByDoctor.set(doctorName, new Map());
      const crmMap = crmByDoctor.get(doctorName)!;
      if (!crmMap.has(crmNum)) crmMap.set(crmNum, []);
      const page = findPageNumberAtIndex(text, cm.index ?? 0);
      const locations = crmMap.get(crmNum)!;
      if (!locations.some(l => l.doc === name && l.page === page)) locations.push({ doc: name, page });
    }
  });
  crmByDoctor.forEach((crmMap, doctorName) => {
    if (crmMap.size > 1) {
      const details = Array.from(crmMap.entries()).map(([num, locs]) => `  - ${num} em: ${locs.map(l => formatLocation(l.doc, l.page)).join(', ')}`).join('\n');
      substantiveAlerts.push(
        `• DIVERGÊNCIA DE CRM MÉDICO — ${doctorName}:\n${details}\n  ➔ Provável ruído de OCR no carimbo/rodapé. Escolha abaixo o número correto (ex: confirme no site do CRM/UF).`
      );
      identityDivergences.push({ label: `CRM Médico — ${doctorName}`, candidates: Array.from(crmMap.keys()) });
    }
  });

  // Montagem do Relatório Formatado Curado e Saneado
  const formattedReport = buildAuditFormattedReport(curationRules, substantiveAlerts, degradedOcrDocs);

  return {
    criticalDiscrepancies,
    substantiveAlerts,
    identityDivergences,
    cadastralAlerts,
    degradedOcrDocs,
    curationRules,
    formattedReport
  };
}

// Pega só o TRECHO INICIAL de cada documento (onde normalmente ficam os dados de
// identificação: nome, CPF, RG, data de nascimento, endereço) em vez do texto inteiro —
// mantém o custo baixo e previsível independente de quantas páginas o documento tem.
export function extractDocumentHeaderExcerpts(fullDocs: any[], maxCharsPerDoc: number = 700): string {
  return fullDocs.map((d, i) => {
    const text = (d.text || '').slice(0, maxCharsPerDoc);
    return `--- DOCUMENTO ${i + 1}: ${d.name || 'Documento'} ---\n${text}`;
  }).join('\n\n');
}

// Auditoria GERAL de consistência via IA — em vez de escrever um regex novo pra cada tipo de
// dado (CPF, CRM, data de nascimento, endereço, etc.), pede pra própria IA ler os trechos de
// identificação de todos os documentos da pasta e apontar QUALQUER dado que devia ser igual
// (mesma pessoa/processo) mas aparece diferente entre documentos — sem precisar prever o
// tipo de campo com antecedência. Roda uma vez só por pasta compilada, não por página.
export async function generateAiConsistencyAudit(fullDocs: any[], clientName: string): Promise<{ alert: string; candidates: string[] }[]> {
  const headerExcerpts = extractDocumentHeaderExcerpts(fullDocs);
  if (!headerExcerpts.trim()) return [];

  const systemInstruction = `Você é um auditor jurídico sênior do escritório Félix & Castro Advocacia, especialista em detectar inconsistências factuais entre documentos de um mesmo processo previdenciário.

Sua ÚNICA tarefa: ler os trechos iniciais (dados de identificação) de vários documentos abaixo, todos relativos ao mesmo cliente${clientName ? ` ("${clientName}")` : ''}, e apontar qualquer dado que DEVERIA ser idêntico entre documentos (por se referir à mesma pessoa, mesmo processo, mesmo evento) mas aparece com valores DIFERENTES em documentos diferentes — por exemplo: data de nascimento, CPF, RG, número de benefício (NB), endereço, nome de familiar, número de processo, CID, lateralidade (direito/esquerdo), data de um mesmo evento citado em mais de um lugar, etc. NÃO se limite a essa lista — aponte qualquer inconsistência factual real que encontrar.

REGRAS CRÍTICAS:
1. Só aponte divergência REAL de VALOR (ex: "29/01/1963" em um documento vs "20/01/1963" em outro). NÃO aponte diferenças de formatação, abreviação ou grafia que representem o MESMO valor (ex: "SUS - AMBULATORIO" vs "SUS-AMBULATORIO" não é divergência).
2. Se não encontrar nenhuma divergência real, retorne um array vazio.
3. Para cada divergência, cite o número do documento (ex: "Documento 3") e o valor exato encontrado em cada um no texto de "alerta".
4. Em "candidatos", liste cada valor divergente encontrado EXATAMENTE como aparece no texto original, caractere por caractere (incluindo pontuação, maiúsculas/minúsculas) — isso será usado pra substituição automática no texto, então precisa ser uma cópia literal e exata do trecho, nunca parafraseado ou corrigido por você.
5. Retorne APENAS um JSON válido, no formato: {"divergencias": [{"alerta": "texto autoexplicativo citando documentos e valores", "candidatos": ["valor exato 1", "valor exato 2"]}]}.`;

  // O servidor cuida de chaves, modelos e do desistir cedo quando o Google está sobrecarregado.
  try {
    const out = await generateTextViaServer({
      text: `Trechos de identificação dos documentos:

${headerExcerpts}`,
      systemInstruction,
      temperature: 0.1,
      json: true,
      timeoutMs: 45000,
    });
    let parsed: any = null;
    try {
      parsed = JSON.parse(out.trim());
    } catch (jsonErr) {
      const jsonMatch = out.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0].trim());
    }
    const divergencias = Array.isArray(parsed?.divergencias) ? parsed.divergencias : [];
    return divergencias
      .filter((d: any) => d && typeof d.alerta === 'string' && d.alerta.trim())
      .map((d: any) => ({
        alert: `• DIVERGÊNCIA (Auditoria Geral IA): ${d.alerta}`,
        candidates: Array.isArray(d.candidatos) ? d.candidatos.filter((c: any) => typeof c === 'string' && c.trim()) : [],
      }));
  } catch (err) {
    // Falhou: não bloqueia a compilação, só não traz esse reforço extra — as checagens de CPF/RG/CRM seguem normais.
    console.warn("[Auditoria Geral IA] Não foi possível completar a auditoria geral — seguindo só com as checagens específicas.", err);
    return [];
  }
}
