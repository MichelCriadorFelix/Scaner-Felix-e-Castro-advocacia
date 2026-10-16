// @ts-nocheck

// Aumenta o contraste, nitidez e saturação para PDFs ou imagens de baixa qualidade antes do OCR/IA, sem perder as cores originais importantes para CNH/RG.
export async function enhanceImageForGemini(imageInput: any, maxDimension: number = 2000, jpegQuality: number = 0.90, applyFilter: boolean = true): Promise<Blob> {
  try {
    const MAX_DIMENSION = maxDimension;

    // Caminho ultra-rápido: se já for um HTMLCanvasElement, pula toda a conversão de Blob/Image
    if (imageInput instanceof HTMLCanvasElement || (imageInput && imageInput.tagName === "CANVAS")) {
      const srcCanvas = imageInput as HTMLCanvasElement;
      let width = srcCanvas.width;
      let height = srcCanvas.height;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        if (applyFilter) ctx.filter = 'contrast(106%) brightness(101%)';
        ctx.drawImage(srcCanvas, 0, 0, width, height);
      }
      const resBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", jpegQuality));
      canvas.width = 0; canvas.height = 0;
      return resBlob || new Blob([], { type: "image/jpeg" });
    }

    const img = await new Promise<HTMLImageElement | null>((res) => {
      const i = new Image();
      const url = URL.createObjectURL(imageInput);
      i.onload = () => { URL.revokeObjectURL(url); res(i); };
      i.onerror = () => { URL.revokeObjectURL(url); res(null); };
      i.src = url;
    });
    if (!img) return imageInput;

    const canvas = document.createElement("canvas");
    let { width, height } = img;
    
    // Resize adaptativo em alta definição (Max 2000px na maior dimensão, JPEG 90%)
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width > height) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
    }

    canvas.width = width; 
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      if (applyFilter) ctx.filter = 'contrast(106%) brightness(101%)';
      ctx.drawImage(img, 0, 0, width, height);
    }
    const resBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", jpegQuality));
    canvas.width = 0; canvas.height = 0;
    return resBlob || imageInput;
  } catch (e) {
    console.warn("Falha ao otimizar imagem para a IA, usando original:", e);
    return imageInput instanceof Blob ? imageInput : new Blob([], { type: "image/jpeg" });
  }
}
