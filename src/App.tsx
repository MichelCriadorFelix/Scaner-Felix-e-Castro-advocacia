// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { createClient } from '@supabase/supabase-js';

// ── Paleta e estilos globais ──────────────────────────────────────────────────
const G = {
  bg: "#0d0f14",
  surface: "#141720",
  card: "#1a1e2a",
  border: "#252b3b",
  accent: "#c9a84c",
  accentDim: "#8a6e2f",
  text: "#e8e6e0",
  muted: "#6b7280",
  success: "#22c55e",
  error: "#ef4444",
  info: "#3b82f6",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: ${G.bg};
    color: ${G.text};
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
  }

  .app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Header */
  .header {
    padding: 20px 20px 16px;
    border-bottom: 1px solid ${G.border};
    background: ${G.surface};
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .logo {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    color: ${G.accent};
    letter-spacing: 0.02em;
  }
  .logo span { color: ${G.muted}; font-size: 11px; display: block; font-family: 'DM Mono', monospace; letter-spacing: 0.1em; }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    background: ${G.bg};
    border-radius: 10px;
    padding: 4px;
  }
  .tab {
    flex: 1;
    padding: 8px 4px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: ${G.muted};
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all .2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .tab.active {
    background: ${G.card};
    color: ${G.accent};
  }
  .tab-icon { font-size: 16px; }

  /* Content */
  .content { flex: 1; padding: 16px; overflow-y: auto; }

  /* Scanner Panel */
  .scanner-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .upload-zone {
    border: 2px dashed ${G.border};
    border-radius: 14px;
    padding: 32px 20px;
    text-align: center;
    background: ${G.card};
    cursor: pointer;
    transition: all .25s;
    position: relative;
    overflow: hidden;
  }
  .upload-zone::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 0%, ${G.accentDim}18, transparent 70%);
    pointer-events: none;
  }
  .upload-zone:hover, .upload-zone.drag-over {
    border-color: ${G.accent};
    background: #1f2333;
  }
  .upload-icon { font-size: 40px; margin-bottom: 10px; }
  .upload-title {
    font-family: 'Playfair Display', serif;
    font-size: 16px;
    color: ${G.text};
    margin-bottom: 6px;
  }
  .upload-sub { font-size: 12px; color: ${G.muted}; line-height: 1.5; }
  .upload-formats {
    margin-top: 10px;
    display: flex;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .badge {
    background: ${G.bg};
    border: 1px solid ${G.border};
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 10px;
    color: ${G.muted};
    font-family: 'DM Mono', monospace;
  }
  .badge.accent { border-color: ${G.accentDim}; color: ${G.accent}; }

  .action-buttons-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .action-card {
    background: ${G.card};
    border: 1px solid ${G.border};
    border-radius: 14px;
    padding: 24px 10px;
    text-align: center;
    cursor: pointer;
    transition: all .2s;
    color: ${G.text};
    font-family: 'DM Sans', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .action-card:hover {
    border-color: ${G.accent};
    background: #1f2333;
  }
  .action-card-full {
    grid-column: span 2;
  }
  .action-icon {
    font-size: 32px;
    margin-bottom: 10px;
  }
  .action-title {
    font-size: 14px;
    font-weight: 500;
    color: ${G.text};
  }
  .action-desc {
    font-size: 11px;
    color: ${G.muted};
    margin-top: 4px;
  }

  /* Camera button */
  .cam-btn {
    width: 100%;
    padding: 14px;
    border: 1px solid ${G.border};
    border-radius: 12px;
    background: ${G.card};
    color: ${G.text};
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all .2s;
  }
  .cam-btn:hover { border-color: ${G.accent}; color: ${G.accent}; }

  /* Preview */
  .preview-wrap {
    border-radius: 12px;
    overflow: hidden;
    background: ${G.card};
    border: 1px solid ${G.border};
  }
  .preview-img {
    width: 100%;
    max-height: 280px;
    object-fit: contain;
    display: block;
  }
  .preview-info {
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .preview-name { font-size: 12px; color: ${G.muted}; font-family: 'DM Mono', monospace; }
  .remove-btn {
    background: none;
    border: none;
    color: ${G.error};
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }

  /* Process button */
  .process-btn {
    width: 100%;
    padding: 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, ${G.accent}, ${G.accentDim});
    color: #0d0f14;
    font-family: 'Playfair Display', serif;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all .25s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    letter-spacing: 0.02em;
  }
  .process-btn:hover { opacity: 0.9; transform: translateY(-1px); }
  .process-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  /* Progress */
  .progress-wrap {
    background: ${G.card};
    border: 1px solid ${G.border};
    border-radius: 12px;
    padding: 16px;
  }
  .progress-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 12px;
    color: ${G.muted};
    font-family: 'DM Mono', monospace;
  }
  .progress-bar-bg {
    height: 4px;
    background: ${G.bg};
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, ${G.accent}, ${G.accentDim});
    border-radius: 2px;
    transition: width .4s ease;
  }
  .progress-status {
    margin-top: 8px;
    font-size: 11px;
    color: ${G.accent};
    font-family: 'DM Mono', monospace;
  }

  /* Result */
  .result-card {
    background: ${G.card};
    border: 1px solid ${G.border};
    border-radius: 14px;
    overflow: hidden;
  }
  .result-header {
    padding: 14px 16px;
    border-bottom: 1px solid ${G.border};
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .result-title {
    font-family: 'Playfair Display', serif;
    font-size: 14px;
    color: ${G.accent};
  }
  .result-meta { font-size: 11px; color: ${G.muted}; font-family: 'DM Mono', monospace; }
  .result-text {
    padding: 16px;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    line-height: 1.7;
    color: ${G.text};
    max-height: 280px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .result-text::-webkit-scrollbar { width: 4px; }
  .result-text::-webkit-scrollbar-track { background: transparent; }
  .result-text::-webkit-scrollbar-thumb { background: ${G.border}; border-radius: 2px; }

  .result-actions {
    padding: 12px 16px;
    border-top: 1px solid ${G.border};
    display: flex;
    gap: 8px;
  }
  .dl-btn {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid ${G.border};
    background: ${G.bg};
    color: ${G.text};
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all .2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .dl-btn:hover { border-color: ${G.accent}; color: ${G.accent}; }
  .dl-btn.primary { background: ${G.accent}; border-color: ${G.accent}; color: #0d0f14; font-weight: 700; }
  .dl-btn.primary:hover { opacity: 0.88; }

  /* History */
  .history-panel { display: flex; flex-direction: column; gap: 10px; }
  .history-empty {
    text-align: center;
    padding: 60px 20px;
    color: ${G.muted};
  }
  .history-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }
  .history-empty p { font-size: 13px; line-height: 1.6; }

  .hist-card {
    background: ${G.card};
    border: 1px solid ${G.border};
    border-radius: 12px;
    overflow: hidden;
    transition: border-color .2s;
  }
  .hist-card:hover { border-color: ${G.accentDim}; }
  .hist-header {
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .hist-thumb {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    background: ${G.bg};
    border: 1px solid ${G.border};
  }
  .hist-thumb-placeholder {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: ${G.bg};
    border: 1px solid ${G.border};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .hist-info { flex: 1; min-width: 0; }
  .hist-name {
    font-size: 13px;
    font-weight: 500;
    color: ${G.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .hist-date { font-size: 11px; color: ${G.muted}; font-family: 'DM Mono', monospace; }
  .hist-chars { font-size: 11px; color: ${G.accent}; font-family: 'DM Mono', monospace; margin-top: 2px; }
  .hist-actions { display: flex; gap: 6px; align-items: center; }
  .icon-btn {
    background: none;
    border: none;
    color: ${G.muted};
    cursor: pointer;
    padding: 4px;
    font-size: 16px;
    line-height: 1;
    transition: color .2s;
    border-radius: 6px;
  }
  .icon-btn:hover { color: ${G.accent}; }
  .icon-btn.danger:hover { color: ${G.error}; }

  .hist-preview {
    padding: 0 14px 12px;
    font-size: 11px;
    font-family: 'DM Mono', monospace;
    color: ${G.muted};
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${G.card};
    border: 1px solid ${G.border};
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 13px;
    color: ${G.text};
    z-index: 999;
    animation: slideUp .3s ease;
    white-space: nowrap;
    max-width: 90vw;
  }
  .toast.success { border-color: ${G.success}; color: ${G.success}; }
  .toast.error { border-color: ${G.error}; color: ${G.error}; }
  @keyframes slideUp {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* Camera modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal-video {
    width: 100%;
    max-width: 400px;
    border-radius: 14px;
    border: 2px solid ${G.accent};
    background: #000;
  }
  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }
  .modal-btn {
    padding: 12px 24px;
    border-radius: 10px;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all .2s;
  }
  .modal-btn.capture {
    background: ${G.accent};
    color: #0d0f14;
  }
  .modal-btn.cancel {
    background: ${G.card};
    color: ${G.text};
    border: 1px solid ${G.border};
  }

  /* Scrollbar global */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${G.border}; border-radius: 2px; }

  .divider {
    text-align: center;
    font-size: 11px;
    color: ${G.muted};
    font-family: 'DM Mono', monospace;
    position: relative;
    margin: 4px 0;
  }
  .divider::before, .divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 38%;
    height: 1px;
    background: ${G.border};
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }

  .confidence-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid ${G.border};
    font-size: 11px;
    color: ${G.muted};
    font-family: 'DM Mono', monospace;
  }
  .conf-fill {
    flex: 1;
    height: 3px;
    background: ${G.bg};
    border-radius: 2px;
    overflow: hidden;
  }
  .conf-inner {
    height: 100%;
    border-radius: 2px;
    transition: width .5s ease;
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(ts) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function downloadTXT(text, name) {
  // Adicionando BOM (\uFEFF) para forçar o reconhecimento do UTF-8 no Bloco de Notas do Windows
  const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name + ".txt"; a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(text, name) {
  // jsPDF via CDN
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
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

// ── Tesseract loader ──────────────────────────────────────────────────────────
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

// ── PDF.js loader ─────────────────────────────────────────────────────────────
async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

// ── Extrai texto de PDF (nativo + OCR fallback) ───────────────────────────────
async function extractFromPDF(file, onProgress) {
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  let confidence = 0;
  let confidenceCount = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(Math.round((i / pdf.numPages) * 60), `Página ${i} de ${pdf.numPages}...`);
    const page = await pdf.getPage(i);

    // Tenta texto nativo
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ").trim();

    if (pageText.length > 30) {
      fullText += pageText + "\n\n";
      confidence += 98;
    } else {
      // Fallback OCR
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      const result = await runOCR(blob, (p) =>
        onProgress(60 + Math.round(p * 0.35), `OCR página ${i}...`)
      );
      fullText += result.text + "\n\n";
      confidence += result.confidence;
    }
    confidenceCount++;
  }

  return { text: fullText.trim(), confidence: Math.round(confidence / confidenceCount) };
}

// ── Extração Inteligente via Gemini AI ───────────────────────────────────────
async function extractWithGemini(file, onProgress) {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    // O AI Studio injeta a chave na compilação do Vite
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const base64 = await new Promise((r) => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });

    onProgress(30, "Enviando documento para a Nuvem de IA...");
    
    const prompt = `Você é um Auditor Especialista em Extração de Dados Jurídicos para o seu software.
Sua tarefa é analisar a imagem/PDF deste documento e extrair as informações de forma limpa, estruturada e absurdamente precisa.

Regras INEGOCIÁVEIS:
1. Identifique o tipo de documento logo no início em caixa alta (ex: "DOCUMENTO: CARTEIRA NACIONAL DE HABILITAÇÃO (CNH)", "DOCUMENTO: RECEITUÁRIO MÉDICO", "DOCUMENTO: ATESTADO/LAUDO").
2. Estruture as informações extraídas no formato de Chave/Valor.
     Exemplo para CNH:
     Nome: [NOME DO TITULAR]
     Identidade / Órgão Emissor: [RG] / [ORGÃO]
     CPF: [CPF]
     Data de Emissão: [DATA]
3. IGNORE completamente ruídos visuais, carimbos pela metade e símbolos soltos gerados por falhas de scan ou marcas d'água.
4. TEXTO MANUSCRITO OU LETRA DE MÉDICO: Quando identificar atestados, receituários ou laudos escritos à mão, use seu raciocínio lógico avançado para deduzir palavras ilegíveis a partir do contexto clínico/jurídico. Descreva com extrema precisão sintomas, CIDs, datas de afastamento e medicações.
5. Corrija o texto com inteligência contextual (se estiver escrito algo com erro de OCR mas o contexto for claro, corrija pra ficar literariamente e tecnicamente perfeito).
6. Se for uma petição genérica ou texto fluido, transcreva o texto preservando parágrafos e resuma o tipo de petição no topo.
7. Apenas devolva o texto final extraído, NENHUMA saudação como "Aqui está".`;

    onProgress(60, "Interpretando caligrafia e metadados...");
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { 
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType: file.type } }
        ] 
      }
    });
    
    onProgress(90, "Formatando apresentação final...");
    return { text: response.text.trim(), confidence: 99 };
  } catch (err) {
    console.error("Erro na IA:", err);
    throw new Error("Erro ao acessar a API do Gemini. Tente enviar como texto bruto.");
  }
}

// ── OCR via Tesseract ─────────────────────────────────────────────────────────
async function runOCR(imageBlob, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(imageBlob, "por+eng", {
    logger: ({ status, progress }) => {
      if (status === "recognizing text") onProgress(progress);
    }
  });
  return {
    text: result.data.text.trim(),
    confidence: Math.round(result.data.confidence)
  };
}

// ── Integração Bancos de Dados ────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// ── LocalStorage (Fallback para quando o Supabase não estiver disponível) ─────
const DB_KEY = "juridico_scanner_history";
const CLIENTS_KEY = "juridico_scanner_clients";

function getHistory() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(items) {
  localStorage.setItem(DB_KEY, JSON.stringify(items));
}
function addToHistory(item) {
  const items = getHistory();
  items.unshift(item);
  if (items.length > 50) items.splice(50);
  saveHistory(items);
}
function removeFromHistory(id) {
  saveHistory(getHistory().filter(i => i.id !== id));
}

function getClients() {
  try { return JSON.parse(localStorage.getItem(CLIENTS_KEY) || "[]"); }
  catch { return []; }
}
function saveClients(items) {
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(items));
}
function addClient(name) {
  const clients = getClients();
  const newClient = { id: Date.now().toString(), name, ts: Date.now() };
  clients.unshift(newClient);
  saveClients(clients);
  return newClient;
}
function removeClient(id) {
  saveClients(getClients().filter(c => c.id !== id));
  // Remover os docs do cliente também
  const hist = getHistory().filter(h => h.clientId !== id);
  saveHistory(hist);
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ScannerJuridico() {
  const [tab, setTab] = useState("scanner");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [viewingClient, setViewingClient] = useState(null); // null = tela geral de clientes, "unassigned" = sem pasta, "ID" = pasta esp
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  
  const [toast, setToast] = useState(null);
  const [camera, setCamera] = useState(false);
  const [stream, setStream] = useState(null);

  const [aiMode, setAiMode] = useState(true);

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
  const [completedCrop, setCompletedCrop] = useState(null);

  const fileRefImg = useRef();
  const fileRefPdf = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const croppedImgRef = useRef();

  useEffect(() => { 
    async function loadData() {
      if (supabase) {
        try {
          const { data: cData } = await supabase.from('lexscan_clients').select('*').order('created_at', { ascending: false });
          if (cData) setClients(cData.map(c => ({ id: c.id, name: c.name, ts: c.created_at })));
          
          const { data: dData } = await supabase.from('lexscan_documents').select('*').order('created_at', { ascending: false });
          if (dData) {
            setHistory(dData.map(d => ({
              id: d.id,
              clientId: d.client_id || 'unassigned',
              name: d.name,
              type: d.file_type || '',
              preview: d.file_url || null,
              fileUrl: d.file_url || null,
              text: d.extracted_text,
              confidence: d.confidence,
              chars: d.chars_count,
              words: d.words_count,
              ts: d.created_at
            })));
          }
        } catch(e) { console.error('Erro Supabase:', e); }
      } else {
        setHistory(getHistory()); 
        setClients(getClients());
      }
    }
    loadData();
  }, []);

  const confColor = (c) => {
    if (c >= 90) return G.success;
    if (c >= 70) return G.warning;
    return G.error;
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const handleFile = (f) => {
    if (!f) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(f.type)) { showToast("Formato não suportado", "error"); return; }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const process = async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Iniciando...");

    try {
      let extracted;
      const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

      if (aiMode) {
        onProgress(10, "Iniciando IA Jurídica...");
        extracted = await extractWithGemini(file, onProgress);
      } else {
        if (file.type === "application/pdf") {
          onProgress(5, "Carregando PDF...");
          extracted = await extractFromPDF(file, onProgress);
        } else {
          onProgress(10, "Carregando OCR...");
          extracted = await runOCR(file, (p) =>
            onProgress(10 + Math.round(p * 88), "Reconhecendo texto...")
          );
        }
      }

      onProgress(80, "Verificando nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString();

      if (supabase) {
        onProgress(85, "Armazenando PDF/Imagem na Nuvem...");
        const ext = file.name.split('.').pop() || 'jpg';
        const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${Date.now()}_${rawName}.${ext}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage.from('lexscan-files').upload(fileName, file);
        if (!uploadError) {
           fileUrl = supabase.storage.from('lexscan-files').getPublicUrl(fileName).data.publicUrl;
        } else {
           console.error("Storage Error:", uploadError);
        }

        onProgress(95, "Sincronizando com o banco GED...");
        const docRecord = {
           client_id: selectedClient || null,
           name: file.name,
           file_type: file.type,
           file_url: fileUrl,
           extracted_text: extracted.text,
           confidence: extracted.confidence,
           chars_count: extracted.text.length,
           words_count: extracted.text.split(/\s+/).filter(Boolean).length
        };

        const { data: dbData, error: dbError } = await supabase.from('lexscan_documents').insert([docRecord]).select();
        if (dbData && dbData[0]) {
           finalId = dbData[0].id;
        } else {
           console.error("DB Error:", dbError);
        }
      }

      onProgress(100, "Concluído!");

      const item = {
        id: finalId,
        name: file.name,
        type: file.type,
        preview: fileUrl || (file.type.startsWith("image/") ? preview : null),
        fileUrl: fileUrl,
        text: extracted.text,
        confidence: extracted.confidence,
        chars: extracted.text.length,
        words: extracted.text.split(/\s+/).filter(Boolean).length,
        ts: Date.now(),
        clientId: selectedClient || "unassigned"
      };

      if (!supabase) addToHistory(item);
      setHistory(prev => [item, ...prev]);

      setResult(item);
      showToast("✓ Texto extraído com sucesso!");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erro ao processar arquivo", "error");
    } finally {
      setProcessing(false);
    }
  };

  const applyCrop = async () => {
    if (!completedCrop || !croppedImgRef.current || !completedCrop.width || !completedCrop.height) {
      setIsCropping(false);
      return;
    }
    const image = croppedImgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const pixelRatio = window.devicePixelRatio;
    canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
    canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = 'high';

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      canvas.toBlob(blob => {
        if (!blob) return;
        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_corte.jpg", { type: "image/jpeg" });
        setFile(newFile);
        setPreview(URL.createObjectURL(blob));
        setIsCropping(false);
      }, "image/jpeg", 0.95);
    }
  };

  // Camera
  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setStream(s);
      setCamera(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch { showToast("Câmera não disponível", "error"); }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if(!blob) return;
      const f = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
      handleFile(f);
      closeCamera();
      setTimeout(() => setIsCropping(true), 150);
    }, "image/jpeg", 0.95);
  };

  const closeCamera = () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null); setCamera(false);
  };

  const loadFromHistory = (item) => {
    setResult(item);
    setTab("scanner");
    showToast("Documento carregado do histórico");
  };

  const deleteFromHistory = async (id) => {
    if (supabase) {
      await supabase.from('lexscan_documents').delete().eq('id', id);
      setHistory(history.filter(h => h.id !== id));
      showToast("Removido do Supabase");
    } else {
      removeFromHistory(id);
      setHistory(getHistory());
      showToast("Removido do histórico");
    }
  };

  const deleteClientHandler = async (id, name) => {
    if(confirm(`Excluir a pasta do cliente "${name}" e todos os seus arquivos?`)) {
      if (supabase) {
        showToast("Excluindo...");
        await supabase.from('lexscan_clients').delete().eq('id', id);
        setClients(clients.filter(c => c.id !== id));
        setHistory(history.filter(h => h.clientId !== id));
        showToast("Pasta do cliente excluída do Supabase");
      } else {
        removeClient(id);
        setClients(getClients());
        setHistory(getHistory());
        showToast("Pasta do cliente excluída");
      }
    }
  };

  const handleCreateClient = async () => {
    if(!newClientName.trim()) return;
    const name = newClientName.trim();
     setIsCreatingClient(false);
    setNewClientName("");
    
    if (supabase) {
      showToast("Criando pasta...");
      const { data, error } = await supabase.from('lexscan_clients').insert([{ name }]).select();
      if (error) {
        console.error("Supabase Error:", error);
        showToast("Erro DB: " + error.message, "error");
      } else if (data && data.length > 0) {
        const nc = { id: data[0].id, name: data[0].name, ts: data[0].created_at };
        setClients(prev => [nc, ...prev]);
        setSelectedClient(nc.id);
        showToast("Pasta criada no Supabase!");
      }
    } else {
      const nc = addClient(name);
      setClients(getClients());
      setSelectedClient(nc.id);
      showToast("Pasta criada (Local)!");
    }
  };

  const compileFolderTXT = () => {
    const docs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
    // Clona e ordena do mais antigo pro mais novo para uma leitura cronológica natural
    const sortedDocs = [...docs].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    
    const folderName = viewingClient === 'unassigned' ? 'Geral' : clients.find(c => c.id === viewingClient)?.name || 'Pasta';
    
    let compiledText = `COMPILADO DE DOCUMENTOS - LEXSCAN\n`;
    compiledText += `Pasta: ${folderName}\n`;
    compiledText += `Data de Exportação: ${new Date().toLocaleString('pt-BR')}\n`;
    compiledText += `Quantidade de Documentos: ${sortedDocs.length}\n`;
    compiledText += `======================================================\n\n`;

    sortedDocs.forEach((doc, i) => {
      compiledText += `------------------------------------------------------\n`;
      compiledText += `DOCUMENTO ${i + 1}: ${doc.name}\n`;
      compiledText += `Originalmente Escaneado em: ${formatDate(doc.ts)}\n`;
      compiledText += `------------------------------------------------------\n\n`;
      compiledText += `${doc.text}\n\n\n\n`;
    });

    downloadTXT(compiledText, `COMPILADO_${folderName.replace(/\s+/g, '_')}`);
  };

  return (
    <>
      <style>{css}</style>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Camera modal */}
      {camera && (
        <div className="modal-overlay" style={{zIndex: 100}}>
          <video ref={videoRef} autoPlay playsInline className="modal-video" />
          <div className="modal-actions">
            <button className="modal-btn cancel" onClick={closeCamera}>✕ Cancelar</button>
            <button className="modal-btn capture" onClick={capture}>📸 Capturar</button>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {isCropping && preview && file && file.type.startsWith("image/") && (
        <div className="modal-overlay" style={{zIndex: 110}}>
          <div style={{background: G.card, padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '440px'}}>
            <h3 style={{marginBottom: 16, fontFamily: 'Playfair Display', color: G.accent, fontSize: '18px', textAlign: 'center'}}>
               ✂️ Cortar Documento
            </h3>
            <div style={{maxHeight: '55vh', overflow: 'auto', textAlign: 'center', background: '#000', borderRadius: '8px'}}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                <img ref={croppedImgRef} src={preview} alt="Crop" style={{maxHeight: '55vh', width: 'auto'}} />
              </ReactCrop>
            </div>
            <div className="modal-actions" style={{marginTop: 20}}>
              <button className="modal-btn cancel" style={{flex: 1}} onClick={() => setIsCropping(false)}>Pular</button>
              <button className="modal-btn capture" style={{flex: 1}} onClick={applyCrop}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="app">
        {/* Header */}
        <div className="header">
          <div className="header-top">
            <div className="logo">
              LexScan
              <span>SCANNER JURÍDICO v1.0</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <span className="badge accent">OCR PT</span>
              <span className="badge">PDF</span>
            </div>
          </div>
          <div className="tabs">
            <button className={`tab ${tab === "scanner" ? "active" : ""}`} onClick={() => setTab("scanner")}>
              <span className="tab-icon">📄</span>Scanner
            </button>
            <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
              <span className="tab-icon">🗂️</span>Histórico
              {history.length > 0 && (
                <span style={{ background: G.accent, color: "#0d0f14", borderRadius: "10px", padding: "1px 6px", fontSize: "10px", fontWeight: 700 }}>
                  {history.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="content">

          {/* ── SCANNER TAB ── */}
          {tab === "scanner" && (
            <div className="scanner-panel">

              {/* Upload zone */}
              {!file && (
                <div
                  onDragOver={e => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={handleDrop}
                  style={{
                    border: drag ? `2px dashed ${G.accent}` : "2px dashed transparent",
                    padding: drag ? '10px' : '0',
                    borderRadius: '16px',
                    transition: 'all 0.2s',
                    position: 'relative',
                    zIndex: 10
                  }}
                >
                  <div className="action-buttons-grid">
                    <button className="action-card" onClick={() => fileRefPdf.current.click()}>
                      <div className="action-icon">📄</div>
                      <div className="action-title">Upload de PDF</div>
                      <div className="action-desc">Extração rápida</div>
                    </button>

                    <button className="action-card" onClick={() => fileRefImg.current.click()}>
                      <div className="action-icon">🖼️</div>
                      <div className="action-title">Upload de Imagem</div>
                      <div className="action-desc">OCR inteligente</div>
                    </button>

                    <button className="action-card action-card-full" onClick={openCamera}>
                      <div className="action-icon">📷</div>
                      <div className="action-title">Escanear com Câmera</div>
                      <div className="action-desc">Tire foto do documento</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Preview */}
              {file && !result && (
                <div className="preview-wrap">
                  {file.type.startsWith("image/") ? (
                    <img src={preview} alt="preview" className="preview-img" />
                  ) : (
                    <div style={{ padding: "40px", textAlign: "center", fontSize: "48px" }}>📄</div>
                  )}
                  <div className="preview-info">
                    <span className="preview-name">{file.name.length > 28 ? file.name.slice(0, 25) + "..." : file.name}</span>
                    <button className="remove-btn" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>✕</button>
                  </div>
                  {file.type.startsWith("image/") && (
                    <div style={{padding: '0 14px 10px'}}>
                      <button onClick={() => setIsCropping(true)} style={{
                         width: '100%', padding: '8px', borderRadius: '8px', border: `1px solid ${G.border}`,
                         background: G.bg, color: G.text, cursor: 'pointer', fontFamily: 'DM Sans',
                         display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                      }}>
                        <span>✂️</span> Ajustar Recorte
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Progress */}
              {processing && (
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span>Processando</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar" style={{ width: progress + "%" }} />
                  </div>
                  <div className="progress-status">{progressMsg}</div>
                </div>
              )}

              {/* Select Folder area if not processing and not result */}
              {file && !result && !processing && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: G.muted, marginBottom: '6px' }}>Salvar na Pasta:</label>
                  <select 
                    value={selectedClient} 
                    onChange={e => setSelectedClient(e.target.value)}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${G.border}`,
                      background: G.surface, color: G.text, outline: 'none', fontFamily: 'DM Sans', fontSize: '14px'
                    }}
                  >
                    <option value="">Geral (Sem Pasta Específica)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Process button */}
              {file && !result && !processing && (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
                    background: G.surface, padding: '12px 14px', borderRadius: '12px', border: `1px solid ${G.border}`
                  }}>
                    <input type="checkbox" checked={aiMode} onChange={(e) => setAiMode(e.target.checked)} id="ai-mode" 
                      style={{ accentColor: G.accent, width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                    <label htmlFor="ai-mode" style={{ fontSize: '13px', color: G.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
                      <span style={{ fontWeight: 600, color: G.accent }}>Tratamento com IA e Estruturação</span>
                      <span style={{ fontSize: '11px', color: G.muted }}>Organiza Nome, CPF, RG limpos. Remove ruídos e corrige o OCR.</span>
                    </label>
                  </div>
                  <button className="process-btn" onClick={process}>
                    {aiMode ? "🧠 Extrair Inteligente" : "🔍 Extrair Texto (Bruto)"}
                  </button>
                </>
              )}

              {/* Result */}
              {result && (
                <>
                  <div className="result-card">
                    <div className="result-header">
                      <span className="result-title">Texto Extraído</span>
                      <span className="result-meta">{result.words} palavras · {result.chars} chars</span>
                    </div>
                    <div className="result-text">{result.text || "(nenhum texto reconhecido)"}</div>
                    <div className="confidence-bar">
                      <span>Confiança OCR</span>
                      <div className="conf-fill">
                        <div className="conf-inner" style={{ width: result.confidence + "%", background: confColor(result.confidence) }} />
                      </div>
                      <span style={{ color: confColor(result.confidence) }}>{result.confidence}%</span>
                    </div>
                    <div className="result-actions">
                      <button className="dl-btn" onClick={() => downloadTXT(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                        📝 .TXT
                      </button>
                      <button className="dl-btn primary" onClick={() => downloadPDF(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                        📄 PDF
                      </button>
                    </div>
                  </div>
                  <button className="cam-btn" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
                    ＋ Novo documento
                  </button>
                </>
              )}

              <input ref={fileRefImg} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
              <input ref={fileRefPdf} type="file" accept="application/pdf" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (
            <div className="history-panel">
              {viewingClient === null ? (
                // View: Lista de Pastas
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Pastas de Clientes</h3>
                    <button 
                      onClick={() => setIsCreatingClient(true)}
                      style={{ background: G.accent, color: '#000', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                    >
                      + Nova Pasta
                    </button>
                  </div>

                  {isCreatingClient && (
                    <div style={{ background: G.card, padding: '16px', borderRadius: '12px', marginBottom: '16px', border: `1px solid ${G.border}` }}>
                      <input 
                        type="text" 
                        autoFocus
                        placeholder="Nome do Cliente..."
                        value={newClientName}
                        onChange={e => setNewClientName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateClient()}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${G.border}`, background: G.bg, color: G.text, outline: 'none', marginBottom: '10px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setIsCreatingClient(false)} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'transparent', color: G.muted, border: 'none', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={handleCreateClient} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: G.success, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
                      </div>
                    </div>
                  )}

                  <div className="folders-grid" style={{ display: 'grid', gap: '12px' }}>
                    <div 
                      className="folder-card"
                      onClick={() => setViewingClient('unassigned')}
                      style={{ background: G.card, padding: '16px', borderRadius: '12px', border: `1px solid ${G.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .2s' }}
                    >
                      <div style={{ fontSize: '24px' }}>📁</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: G.text }}>Geral (Sem pasta)</div>
                        <div style={{ fontSize: '12px', color: G.muted }}>{history.filter(h => h.clientId === 'unassigned' || !h.clientId).length} documentos</div>
                      </div>
                      <div style={{ color: G.muted }}>→</div>
                    </div>

                    {clients.map(c => {
                      const docsCount = history.filter(h => h.clientId === c.id).length;
                      return (
                        <div 
                          key={c.id}
                          className="folder-card"
                          onClick={() => setViewingClient(c.id)}
                          style={{ background: G.card, padding: '16px', borderRadius: '12px', border: `1px solid ${G.accentDim}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .2s' }}
                        >
                          <div style={{ fontSize: '24px' }}>📂</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, color: G.text }}>{c.name}</div>
                            <div style={{ fontSize: '12px', color: G.muted }}>{docsCount} documentos</div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteClientHandler(c.id, c.name); }}
                            style={{ background: 'none', border: 'none', color: G.error, cursor: 'pointer', padding: '4px', fontSize: '16px' }}
                          >🗑</button>
                          <div style={{ color: G.muted }}>→</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                // View: Arquivos dentro da Pasta
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => setViewingClient(null)}
                      style={{ background: 'none', border: 'none', color: G.muted, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>←</span> Voltar
                    </button>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: G.accent, flex: 1 }}>
                      {viewingClient === 'unassigned' ? "Geral (Sem pasta)" : clients.find(c => c.id === viewingClient)?.name}
                    </h3>
                    {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length > 0 && (
                      <button 
                        onClick={compileFolderTXT}
                        style={{ background: G.accent, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <span>📑</span> Compilar em TXT Único
                      </button>
                    )}
                  </div>

                  {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length === 0 ? (
                    <div className="history-empty">
                      <div className="history-empty-icon">📭</div>
                      <p>Pasta vazia.</p>
                    </div>
                  ) : (
                    history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).map(item => (
                      <div key={item.id} className="hist-card">
                        <div className="hist-header">
                          {item.preview
                            ? <img src={item.preview} alt="" className="hist-thumb" />
                            : <div className="hist-thumb-placeholder">📄</div>
                          }
                          <div className="hist-info">
                            <div className="hist-name">{item.name}</div>
                            <div className="hist-date">{formatDate(item.ts)}</div>
                            <div className="hist-chars">{item.words} palavras · {item.confidence}% OCR</div>
                          </div>
                          <div className="hist-actions">
                            {item.fileUrl && (
                               <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Baixar Original" style={{textDecoration: 'none'}}>🌐</a>
                            )}
                            <button className="icon-btn" title="Abrir Extração" onClick={() => loadFromHistory(item)}>↗</button>
                            <button className="icon-btn" title="Baixar TXT" onClick={() => downloadTXT(item.text, item.name.replace(/\.[^.]+$/, ""))}>📝</button>
                            <button className="icon-btn danger" title="Remover" onClick={() => deleteFromHistory(item.id)}>🗑</button>
                          </div>
                        </div>
                        <div className="hist-preview">{item.text.slice(0, 120)}...</div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
