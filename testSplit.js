const fs = require('fs');

function splitTextIntoCleanChunks(text, maxChunkSize = 12000) {
  const chunks = [];
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

// simulate a text
const text = "A".repeat(25000);
const chunks = splitTextIntoCleanChunks(text, 12000);
console.log(chunks.map(c => c.length));
