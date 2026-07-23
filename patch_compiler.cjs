const fs = require('fs');

const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `  // 4. FATIAR EM CHUNKS PARA REVISÃO PROFUNDA DE IA SEM CONGELAMENTO
  const chunks = splitTextIntoCleanChunks(refinedText, 12000);
  const totalChunks = chunks.length;

  if (addLogCallback) {
    addLogCallback(\`[\${new Date().toLocaleTimeString()}] ✂️ Documento fatiado com precisão em \${totalChunks} trechos para revisão ortográfica profunda de alta fidelidade.\`);
  }

  const refinedChunks: string[] = [];

  for (let index = 0; index < totalChunks; index++) {
    const chunk = chunks[index];
    
    // Se não for a primeira iteração, aplicamos um pequeno atraso de cortesia para evitar limite de RPM (Too Many Requests - 429)
    if (index > 0) {
      if (addLogCallback) {
        addLogCallback(\`[\${new Date().toLocaleTimeString()}] ⏳ Aguardando intervalo de segurança anti-estrangulamento de API (1.5s)...\`);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Atualiza o progresso visual de 45% a 95%
    const progressPercent = 45 + Math.round((index / totalChunks) * 50);
    const statusMsg = \`Revisando com IA profunda (\${index + 1}/\${totalChunks})...\`;
    
    if (onProgressCallback) {
      onProgressCallback(progressPercent, statusMsg);
    }

    if (addLogCallback) {
      addLogCallback(\`[\${new Date().toLocaleTimeString()}] 🪄 Iniciando revisão profunda do trecho \${index + 1} de \${totalChunks} (\${Math.round((chunk.length / 1024) * 10) / 10} KB)...\`);
    }

    try {
      const refinedChunk = await refineChunkWithGemini(
        chunk,
        clientName,
        index,
        totalChunks,
        finalSortedKeys,
        addLogCallback
      );
      refinedChunks.push(refinedChunk);
      
      if (addLogCallback) {
        addLogCallback(\`[\${new Date().toLocaleTimeString()}]   ↳ ✅ Trecho \${index + 1} de \${totalChunks} concluído com sucesso e livre de erros.\`);
      }
    } catch (err: any) {
      if (addLogCallback) {
        addLogCallback(\`[\${new Date().toLocaleTimeString()}]   ↳ ⚠️ Falha na revisão profunda do trecho \${index + 1}: \${err.message || err}. Mantendo texto semi-limpo.\`);
      }
      refinedChunks.push(chunk); // fallback de segurança
    }
  }

  if (addLogCallback) {
    addLogCallback(\`[\${new Date().toLocaleTimeString()}] 🤝 Unificando trechos revisados e finalizando arquivo consolidado...\`);
  }

  return refinedChunks.join("\\n\\n");`;

const replaceStr = `  // 4. PULO DE IA: Os documentos individuais JÁ FORAM extraídos com IA (OCR via Gemini). 
  // Executar a IA novamente em todo o texto massivo fará a IA truncar e dropar páginas (causando perda de provas).
  // Retornamos aqui o texto compilado que já teve o nome arrumado e ortografia comum fixada localmente.
  
  if (addLogCallback) {
    addLogCallback(\`[\${new Date().toLocaleTimeString()}] 🤝 Compilando trechos e finalizando arquivo consolidado com 100% de integridade das provas...\`);
  }

  return refinedText;`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync(file, code, 'utf8');
    console.log('Patched successfully');
} else {
    console.log('Target string not found');
}
