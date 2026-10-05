// Procura nomes NAO DEFINIDOS (import faltando, variavel inexistente) em src/, IGNORANDO o "// @ts-nocheck"
// dos arquivos. O App e os modulos usam ts-nocheck, entao o `tsc` e o build NAO pegam esse tipo de erro
// (ele so estouraria em tempo de execucao). Rode depois de qualquer refatoracao: npm run check:names
// Uso: node scripts/check-names.cjs [raiz-do-projeto]   (padrao: pasta atual)
const path = require('path');
const fs = require('fs');
const root = process.argv[2] || process.cwd();
const ts = require(path.join(root, 'node_modules', 'typescript'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(root, 'src'));
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  skipLibCheck: true,
  noEmit: true,
  allowJs: true,
  isolatedModules: true,
  allowImportingTsExtensions: true,
  esModuleInterop: true,
};
const host = ts.createCompilerHost(options);
const origGSF = host.getSourceFile.bind(host);
host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
  const norm = fileName.replace(/\\/g, '/');
  if (/\/src\/.*\.tsx?$/.test(norm) && !/\.d\.ts$/.test(norm)) {
    const text = fs.readFileSync(fileName, 'utf8').replace(/^\/\/ @ts-nocheck/m, '// (ts-nocheck desligado pela verificacao)');
    return ts.createSourceFile(fileName, text, languageVersion, true);
  }
  return origGSF(fileName, languageVersion, onError, shouldCreate);
};
const program = ts.createProgram(srcFiles, options, host);
// 2304 Cannot find name | 2552 Cannot find name (did you mean) | 2448/2454 usado antes de declarar/atribuir |
// 2305/2614 export/import inexistente | 2307 modulo nao encontrado | 2724 sem export nomeado
const CODES = new Set([2304, 2552, 2448, 2454, 2305, 2614, 2307, 2724, 2300, 2451]);
let total = 0;
for (const sf of program.getSourceFiles()) {
  if (!srcFiles.includes(sf.fileName) && !srcFiles.map(f => f.replace(/\\/g, '/')).includes(sf.fileName.replace(/\\/g, '/'))) continue;
  const diags = program.getSemanticDiagnostics(sf).concat(program.getSyntacticDiagnostics(sf)).filter(d => CODES.has(d.code));
  for (const d of diags) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
    console.log(`${path.relative(root, sf.fileName)}:${line + 1}:${character + 1} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    total++;
  }
}
console.log(total === 0 ? 'OK: nenhum nome indefinido / import quebrado.' : `ATENCAO: ${total} problema(s) acima.`);
process.exit(total === 0 ? 0 : 1);
