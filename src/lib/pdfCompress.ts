// @ts-nocheck
import { loadJSPDF } from './browserHelpers';
import { loadPDFJS, PDFJS_BASE_OPTIONS } from './loaders';

// ── COMPRESSOR INTELIGENTE DE ALTA QUALIDADE (INSS & E-PROC) ─────────────────────────
export async function compressPDF(
  blob: Blob,
  qualityLevel: string = 'lite',
  onProgress?: (percent: number, msg: string) => void
): Promise<Blob> {
  try {
    const jsPDF = await loadJSPDF();
    const pdfjsLib = await loadPDFJS();
    const arrayBuffer = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_BASE_OPTIONS }).promise;
    const totalPages = pdf.numPages;

    if (totalPages === 0) return blob;

    // Configurações calibradas para máxima legibilidade jurídica com forte redução de bytes
    // Nível Lite (INSS/e-Proc): scale 1.35 (~1100-1400px), JPEG 0.70 (Redução de 75% a 85%)
    let scale = 1.35;
    let jpegQuality = 0.70;

    if (qualityLevel === 'Pouca' || qualityLevel === 'leve' || qualityLevel === 'Leve') {
      scale = 1.6;
      jpegQuality = 0.82;
    } else if (qualityLevel === 'Média' || qualityLevel === 'media') {
      scale = 1.25;
      jpegQuality = 0.62;
    } else if (qualityLevel === 'Máxima' || qualityLevel === 'maxima') {
      scale = 1.0;
      jpegQuality = 0.48;
    }

    let outPdf: any = null;

    for (let i = 1; i <= totalPages; i++) {
      if (onProgress) {
        onProgress(Math.round((i / totalPages) * 100), `Página ${i}/${totalPages}`);
      }
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);

      // Dimensões originais em mm (1 pt = 0.352778 mm)
      const baseViewport = page.getViewport({ scale: 1.0 });
      const wMm = baseViewport.width * 0.352778;
      const hMm = baseViewport.height * 0.352778;
      const orientation = wMm > hMm ? 'l' : 'p';

      if (i === 1) {
        outPdf = new jsPDF({
          orientation,
          unit: "mm",
          format: [wMm, hMm],
          compress: true
        });
      } else {
        outPdf.addPage([wMm, hMm], orientation);
      }

      outPdf.addImage(dataUrl, 'JPEG', 0, 0, wMm, hMm, undefined, 'FAST');

      canvas.width = 0;
      canvas.height = 0;
    }

    try {
      if (pdf && pdf.destroy) await pdf.destroy();
    } catch(e) {}

    if (!outPdf) return blob;
    const compressedBlob = outPdf.output('blob');

    // Se o arquivo original já for menor, preserva o original
    if (compressedBlob.size >= blob.size && blob.size > 0) {
      return blob;
    }
    return compressedBlob;
  } catch (err) {
    console.error("[compressPDF] Falha na compressão do PDF, preservando original:", err);
    return blob;
  }
}

export async function compressImage(blob: Blob, qualityLevel: string = 'lite'): Promise<Blob> {
  let maxWidth = 1400;
  let quality = 0.70;

  if (qualityLevel === 'Pouca' || qualityLevel === 'leve' || qualityLevel === 'Leve') {
    maxWidth = 1800;
    quality = 0.82;
  } else if (qualityLevel === 'Média' || qualityLevel === 'media') {
    maxWidth = 1200;
    quality = 0.62;
  } else if (qualityLevel === 'Máxima' || qualityLevel === 'maxima') {
    maxWidth = 1000;
    quality = 0.48;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      }
      canvas.toBlob((b) => {
        if (b && (b.size < blob.size || blob.size === 0)) {
          resolve(b);
        } else {
          resolve(blob);
        }
      }, "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
