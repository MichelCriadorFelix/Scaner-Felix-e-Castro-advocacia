// @ts-nocheck

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatDate(ts) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export async function forceDownload(url, filename, supabaseContext = null) {
  try {
    // Interceptar URLs do Supabase (mesmo públicas) que podem estar retornando 404 por configurações de RLS
    if (url.includes('.supabase.co/storage/v1/object/') && supabaseContext) {
      const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
      if (match) {
        const bucket = match[1];
        const filePath = match[2].split('?')[0]; // Remover parâmetros de URL
        
        try {
          const { data: fileBlob, error } = await supabaseContext.storage.from(bucket).download(decodeURIComponent(filePath));
          if (fileBlob && !error) {
            const blobUrl = URL.createObjectURL(fileBlob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
            return;
          }
        } catch(sdkErr) {
          console.warn("Falha no download direto pelo SDK do Supabase, tentando fetch padrão", sdkErr);
        }
      }
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Erro na requisição HTTP " + response.status);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (e) {
    console.error("Erro ao forçar download via Blob, usando fallback:", e);
    // Fallback: usar parâmetro download do Supabase ou abrir nova aba
    const fallbackUrl = new URL(url);
    fallbackUrl.searchParams.append('download', filename);
    const a = document.createElement("a");
    a.href = fallbackUrl.toString();
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export function downloadTXT(text, name) {
  // Adicionando BOM (\uFEFF) para forçar o reconhecimento do UTF-8 no Bloco de Notas do Windows
  const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name + ".txt"; a.click();
  URL.revokeObjectURL(url);
}

export async function loadJSPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

export async function downloadPDF(text, name) {
  const jsPDF = await loadJSPDF();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, 180);
  let y = 20;
  lines.forEach(line => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(line, 15, y);
    y += 5.5;
  });
  doc.save(name + ".pdf");
}
