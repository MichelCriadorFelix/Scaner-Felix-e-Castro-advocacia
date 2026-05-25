// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

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
    -webkit-tap-highlight-color: transparent;
    overflow-x: hidden;
  }

  .app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
  }

  /* Optimize for mobile devices without hover */
  @media (max-width: 480px) {
    .app { box-shadow: none; }
    .header { padding: 16px 16px 12px; }
  }

  button {
    user-select: none;
    touch-action: manipulation;
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
  
  .hover-overlay:hover, .hover-overlay:active { opacity: 1 !important; }
  
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
    transition: all .2s;
    cursor: pointer;
  }
  .hist-card:hover { border-color: ${G.accent}; transform: translateY(-1px); background: rgba(255, 255, 255, 0.015); }
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
  .hist-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .hist-name {
    font-size: 13px;
    font-weight: 500;
    color: ${G.text};
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    width: 100%;
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

async function forceDownload(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Erro na requisição HTTP");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
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

// ── Banco de API Keys & Auto-Failover ────────────────────────
function getAvailableGeminiKeys() {
  const rawKeys = [];
  
  const addKey = (val) => {
    if (!val) return;
    if (typeof val === 'string') {
      const parts = val.split(',').map(k => k.trim()).filter(Boolean);
      rawKeys.push(...parts);
    }
  };

  // 1. Busca por substituiÃ§Ã£o estÃ¡tica (Vite Define)
  // IMPORTANTE: Vite troca essas chamadas literais por strings no momento do Build.
  try {
    if (process.env.GEMINI_API_KEY) addKey(process.env.GEMINI_API_KEY);
  } catch(e) {}
  try {
    if (process.env.API_KEY) addKey(process.env.API_KEY);
  } catch(e) {}
  try {
    if (process.env.ALL_GEMINI_KEYS) addKey(process.env.ALL_GEMINI_KEYS);
  } catch(e) {}

  // 2. Busca nativa VITE (import.meta.env)
  try {
    if (import.meta && import.meta.env) {
      if (import.meta.env.VITE_API_KEY) addKey(import.meta.env.VITE_API_KEY);
      Object.keys(import.meta.env).forEach(k => {
        if (k.includes('GEMINI')) addKey(import.meta.env[k]);
        if (k.includes('API_KEY')) addKey(import.meta.env[k]);
      });
    }
  } catch (e) {}

  // Remove duplicatas e limpa
  return [...new Set(rawKeys)].filter(k => k && typeof k === 'string' && k.length > 20);
}

// Helper para ler status e uso de chaves diretamente do localStorage (compartilhado com React)
function getKeyMetadata(apiKey) {
  const hash = apiKey.slice(-6);
  let usage = 0;
  let errorStatus = 'ok';

  try {
    const savedUsage = localStorage.getItem('lexscan_key_usage');
    if (savedUsage) {
      const parsed = JSON.parse(savedUsage);
      usage = parsed[hash] || 0;
    }
  } catch (e) {}

  try {
    const savedErrors = localStorage.getItem('lexscan_key_errors');
    if (savedErrors) {
      const parsed = JSON.parse(savedErrors);
      errorStatus = parsed[hash] || 'ok';
    }
  } catch (e) {}

  return { hash, usage, errorStatus };
}

// Aumenta o contraste, nitidez e saturação para PDFs ou imagens de baixa qualidade antes do OCR/IA, sem perder as cores originais importantes para CNH/RG.
async function enhanceImageForGemini(imageBlob) {
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      const url = URL.createObjectURL(imageBlob);
      i.onload = () => { URL.revokeObjectURL(url); res(i); };
      i.onerror = () => { URL.revokeObjectURL(url); rej(); };
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Filtro profissional inteligente: Melhora contraste (+20%), brilho (+2%) e cores (+10%) sem binarizar.
      // Isso é crucial para CNH e RG que possuem fundos verdes ou cinzas que somem sob binarização severa.
      ctx.filter = 'contrast(120%) brightness(102%) saturate(110%)';
      ctx.drawImage(img, 0, 0);
    }
    const resBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
    canvas.width = 0; canvas.height = 0;
    return resBlob || imageBlob;
  } catch (e) {
    console.warn("Falha ao otimizar imagem para a IA, usando original:", e);
    return imageBlob;
  }
}

// ── Extrai texto de PDF e Imagem (Sistema Híbrido) ──────────────────────────
async function extractPageWithGemini(blob, onProgress) {
  const allKeys = getAvailableGeminiKeys();
  let lastError = null;

  if (allKeys.length === 0) {
    throw new Error("❌ Nenhuma Chave GEMINI ou API_KEY configurada.");
  }

  // Mapeia todas as chaves com metadados do localStorage
  const keysMetadata = allKeys.map((key) => {
    const meta = getKeyMetadata(key);
    return { key, ...meta };
  });

  // Filtra chaves que NÃO estão com erro (deve ter status 'ok' ou 'active' ou vazio)
  const activeKeys = keysMetadata.filter(m => 
    !m.errorStatus || m.errorStatus === 'ok' || m.errorStatus === 'active'
  );
  
  // Se TODAS as chaves estiverem marcadas com erro, usamos todas como fallback (reiniciando tentativa caso alguma tenha resetado)
  const candidateKeysInfo = activeKeys.length > 0 ? activeKeys : keysMetadata;

  // ORDENAÇÃO INTELIGENTE (Load-Balancing Dinâmico): 
  // Prioriza chaves com MENOR número de requisições realizadas (usage crescente).
  // Isso faz com que as chaves 7, 8 e 9 (com 0 ou poucas chamadas) sejam usadas antes de sobrecarregar as chaves 4, 5 e 6!
  candidateKeysInfo.sort((a, b) => a.usage - b.usage);

  const finalSortedKeys = candidateKeysInfo.map(info => info.key);

  const base64 = await new Promise((r) => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
  
  const prompt = `Você é o Assistente Jurídico de OCR do escritório Felix & Castro Advocacia (Previdenciário, Trabalhista, Consumidor e Cível).

MISSÃO: Identificar o documento e extrair APENAS as informações que um advogado precisa para redigir uma peça processual. Ignore cabeçalhos institucionais, frases de praxe, endereços de cartório, URLs e textos decorativos sem valor jurídico. Aplique esta lógica em TODAS as páginas do documento.

REGRA ABSOLUTA — DÚVIDA = INCLUIR: Se não tiver certeza se uma informação é relevante para uma petição, inclua (é melhor sobrar do que faltar). Nunca invente dados (zero alucinação). Para textos normais impressos/digitados incompreensíveis use [ILEGÍVEL], mas para assinaturas ou rubricas use [Assinatura Manuscrita Detectada] — nunca use [ILEGÍVEL] para assinaturas. Para caligrafias médicas complexas, esforce-se ao máximo absoluto para decifrá-las.

══════════════════════════════════════════════════
PASSO 1 — TÍTULO
══════════════════════════════════════════════════
Escreva o título exatamente como aparece no documento (ex: "CERTIDÃO DE ÓBITO", "PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO", "TERMO DE RESCISÃO DO CONTRATO DE TRABALHO"). Se não houver título explícito, nomeie com precisão.

══════════════════════════════════════════════════
PASSO 2 — EXTRAÇÃO JURÍDICA DIRECIONADA
══════════════════════════════════════════════════
Com base no tipo identificado, extraia os dados abaixo. Campo presente: transcreva. Campo ausente: omita. Campo ilegível: [ILEGÍVEL].

► CNIS
Dados pessoais: nome, CPF, NIT/PIS, data de nascimento, sexo
Vínculos: empregador | CNPJ | tipo | início | fim | indicador especial (um por linha)
Contribuições avulsas: competência | valor | código
Benefícios: tipo | NB | DIB | DCB
Lacunas: períodos sem contribuição (datas)
Última atualização do extrato

► PPP / LTCAT
Trabalhador: nome, CPF, NIT, função, CBO
Empresa: razão social, CNPJ, CNAE
Períodos especiais: início | fim | setor | função
Agentes nocivos: agente | CAS | intensidade | limite de tolerância | técnica
EPI/EPC: tipo | CA | eficácia (neutraliza sim/não)
Responsável técnico: nome, formação, registro (CRM/CREA/CRQ)
LTCAT referenciado: data
Conclusão sobre exposição (literal)

► LAUDO MÉDICO / ATESTADO
Paciente: nome, CPF, data de nascimento
CIDs: todos os códigos e descrições
Diagnóstico principal e secundários (literal)
Limitações funcionais e restrições (literal)
Capacidade laborativa: apto / inapto parcial / inapto total / temporário / permanente
Data de início da incapacidade (DII)
Tempo de afastamento estimado
Médico: nome, CRM, especialidade, data do laudo

► CARTA INSS (Indeferimento ou Concessão)
Segurado: nome, CPF, NB, protocolo, DER
Espécie: código e descrição
Decisão: CONCEDIDO ou INDEFERIDO
Motivo do indeferimento (literal — é o argumento a refutar na peça)
Base legal citada pelo INSS
DIB / DIP / DCB / valor do benefício (se concedido)
Prazo e forma de recurso (literal)

► SENTENÇA / DECISÃO / ACÓRDÃO — PREVIDENCIÁRIO
Processo: número CNJ, vara/JEF/TRF/instância
Partes: autor(a) e réu
Objeto: espécie e código do benefício
Dispositivo (literal e completo — nunca resumir)
DIB, DIP, índice de correção, juros
Honorários: percentual, base, responsável
Prazo para recurso ou cumprimento
Data e magistrado(a)

► CTPS
Trabalhador: nome, CPF, PIS/NIS, data de nascimento
Número e série da CTPS
Registros: empresa | CNPJ | função | CBO | salário admissional | admissão | saída | motivo
Anotações especiais: estabilidade, gestante, aprendiz, acidente

► HOLERITE / CONTRACHEQUE
Empregado: nome, CPF, matrícula, cargo
Empresa: razão social, CNPJ
Competência e data de pagamento
Salário base
Proventos: descrição | valor (todos)
Descontos: descrição | valor (todos)
Salário líquido
Bases: INSS retido, FGTS depositado, IR retido

► TRCT (Rescisão)
Empregado: nome, CPF, PIS/NIS, cargo
Empresa: razão social, CNPJ
Admissão e demissão
Tipo de rescisão
Aviso prévio: trabalhado ou indenizado, dias
Verbas rescisórias: descrição | valor (todas)
Deduções: descrição | valor
Líquido a receber
FGTS: saldo, multa 40%, saque autorizado
Homologação: data, local, sindicato se presente

► SENTENÇA / DECISÃO / ACÓRDÃO — TRABALHISTA
Processo: número CNJ, vara/TRT/TST
Partes: reclamante e reclamada
Pedidos: procedente / improcedente / parcial
Dispositivo (literal e completo)
Verbas deferidas: descrição | valor
Índice de correção, juros, contribuições previdenciárias e IR
Honorários advocatícios e sucumbenciais
Prazo para cumprimento
Data e magistrado(a)

► CONTRATO BANCÁRIO / FINANCIAMENTO / CRÉDITO
Partes: cliente (nome, CPF) e instituição (nome, CNPJ)
Modalidade do crédito
Valor financiado
Taxa de juros mensal e anual (nominal e efetiva)
CET (Custo Efetivo Total)
Parcelas: quantidade, valor, datas de vencimento
IOF e outros encargos
Garantias
Cláusulas de mora, multa e vencimento antecipado
Cláusulas abusivas identificadas (destacar)
Data de assinatura

► CONTRATO DE SERVIÇOS (telefonia, internet, energia, água)
Partes: contratante (nome, CPF) e prestadora (nome, CNPJ)
Serviço e plano contratado
Valor mensal
Fidelidade: prazo e multa por rescisão antecipada
Cláusulas de reajuste
Cláusulas abusivas identificadas
Data de assinatura

► NOTIFICAÇÃO DE NEGATIVAÇÃO / COBRANÇA
Devedor: nome, CPF/CNPJ
Credor: nome, CNPJ
Valor e data de origem da dívida
Número do contrato
Órgão de proteção (Serasa, SPC, etc.)
Data da negativação
Prazo para regularização

► SENTENÇA / DECISÃO / ACÓRDÃO — CONSUMIDOR / JEC
Processo: número CNJ, juizado/vara/turma recursal
Partes
Pedidos: dano moral, material, obrigação de fazer
Dispositivo (literal e completo)
Valores: dano moral (R$), dano material (R$), obrigação de fazer descrita
Correção, juros, custas, honorários
Prazo para cumprimento espontâneo
Data e magistrado(a)

► ESCRITURA PÚBLICA
Tipo: compra/venda, doação, inventário, divórcio
Partes: nome, CPF, estado civil de cada um
Objeto: descrição do bem (imóvel com matrícula, veículo)
Valor declarado
Condições de pagamento
Ônus e gravames sobre o bem
Tabelião: nome e cartório
Livro, folha, ato, data

► MATRÍCULA / CERTIDÃO DE IMÓVEL
Matrícula e circunscrição (CRI)
Descrição do imóvel: área, localização, limites
Proprietário(s) atual(is): nome, CPF, fração
Histórico de transmissões relevantes
Ônus e gravames: hipoteca | credor | valor | penhora | alienação fiduciária | usufruto
Inscrição municipal (IPTU) se constar

► SENTENÇA / ACORDO — DIVÓRCIO / ALIMENTOS / GUARDA
Partes: nomes e CPFs
Filhos: nome e data de nascimento (cada um)
Guarda: unilateral (para quem) ou compartilhada
Regime de visitas (literal)
Alimentos: valor, periodicidade, forma de pagamento, indexador
Partilha: bem | valor | destinado a quem
Data de homologação

► PROCURAÇÃO
Outorgante: nome, CPF, estado civil
Outorgado / Advogado: nome, CPF/OAB
Poderes conferidos (literal)
Poderes especiais: receber, transigir, dar quitação
Substabelecimento: permitido ou vedado
Data e validade

► CERTIDÃO DE ÓBITO
Falecido: nome, CPF
Matrícula da certidão
Data, hora e local do óbito
Causa mortis (literal — todas as causas)
Estado civil e nome do cônjuge sobrevivente
Data de nascimento e naturalidade
Filiação
Médico atestante: nome e CRM/documento
Existência de bens (sim/não)
Filhos: nome e idade de cada um
Anotações/Averbações (literal)
Anotação de identidade (RG/DETRAN)
Cartório: nome e CNS
Livro, folha, termo
Código do selo de autenticação

► CERTIDÃO DE NASCIMENTO / CASAMENTO
Tipo
Titular(es): nome(s), data(s), local
Filiação (para nascimento)
Regime de bens (para casamento)
Cartório: nome, livro, folha, termo
Data do registro

► RG / CNH / IDENTIDADE
Nome, CPF, data de nascimento
Número do documento e órgão expedidor
Filiação
Naturalidade
Validade (CNH)
Categorias e restrições (CNH)
Data de expedição

► EXTRATO BANCÁRIO
Titular: nome, CPF, agência, conta, banco
Período do extrato
Saldo inicial e final
Movimentações relevantes: data | descrição | valor | tipo (C/D)
Entradas recorrentes que indicam renda

► COMPROVANTE DE RESIDÊNCIA
Titular: nome
Endereço completo (rua, número, complemento, bairro, município, CEP)
Tipo e empresa emissora
Data de referência

► DOCUMENTO NÃO MAPEADO
1. Identifique o tipo real com precisão (nunca use "Documento Geral")
2. Extraia: emissor, destinatário, data, número/protocolo, objeto
3. Transcreva todos os valores, datas, nomes e números
4. Sinalize o que pode ser juridicamente relevante

══════════════════════════════════════════════════
REGRAS DE TRANSCRIÇÃO
══════════════════════════════════════════════════
ZERO ALUCINAÇÃO: Nunca invente dados. Texto impresso de fato ilegível (apagado, borrado ou rasgado) → [ILEGÍVEL].
CALIGRAFIA MÉDICA E COMPLEXA: Esforce-se ao máximo absoluto para decifrar e decodificar manuscritos difíceis, incluindo receitas, prontuários, laudos e atestados médicos com letras garrafais de médicos. Só use a marcação '[ILEGÍVEL]' em último caso, após esgotadas todas as tentativas analíticas de leitura de corpos de textos manuscritos.
ASSINATURAS E RUBRICAS: Você é TERMINANTEMENTE PROIBIDO de utilizar a marcação '[ILEGÍVEL]' para assinaturas, rubricas, autorizações ou garras manuscritas.
- Se for possível identificar ou deduzir o titular pelo nome impresso ao lado, abaixo ou no contexto, transcreva de forma descritiva: ex: [Assinatura Manuscrita: Nome do Titular].
- Se for uma assinatura garrancho, rabisco ou rubrica indecifrável por extenso, transcreva obrigatoriamente como '[Assinatura Manuscrita Detectada]' ou '[Assinatura Manuscrita]' ou '[Rubrica Detectada]'.
- Garanta que qualquer marcação de caneta indicando assinatura seja tratada dessa forma.
DISPOSITIVOS E MOTIVOS INSS: Sempre literal, nunca resumir.
TABELAS: Use markdown para dados tabulares (CNIS, holerite, ponto, extrato).
MÚLTIPLAS PÁGINAS: Repita a extração jurídica para cada página — aplique o mesmo critério em todo o documento.

══════════════════════════════════════════════════
FORMATO DE SAÍDA
══════════════════════════════════════════════════
TÍTULO: [título exato do documento]
TIPO: [classificação precisa]
ÁREA: [Previdenciário / Trabalhista / Consumidor / Cível / Múltiplas]
OBS: [só se relevante: ilegível, páginas faltando, sem assinatura, cópia simples — omitir se não houver]

[Extração jurídica direta, campo a campo, sem blocos separadores.
Formato: Campo: valor
Campos ausentes: omitir.
Dúvida sobre relevância: incluir.]`

  // Lista de modelos do Google (Atualizado para Gemini 3.5 Flash conforme solicitado)
  const modelsToTry = ["gemini-3.5-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"];

  // Matriz de Auto-Failover Duplo: Roda as Chaves Híbridas cruzando com Modelos!
  for (let i = 0; i < finalSortedKeys.length; i++) {
    const apiKey = finalSortedKeys[i];
    const keyHash = apiKey.slice(-6);
    
    for (let m = 0; m < modelsToTry.length; m++) {
      const modelName = modelsToTry[m];
      try {
        console.log(`[Auto-Failover Matrix] Chave ${i + 1}/${finalSortedKeys.length} (..${keyHash}) | Tentando modelo: ${modelName}`);
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        
        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: { parts: [{ text: prompt }, { inlineData: { data: base64, mimeType: blob.type } }] }
        });

        let fullText = "";
        let chunksReceived = 0;
        
        for await (const chunk of responseStream) {
          fullText += chunk.text;
          chunksReceived++;
          if (onProgress) {
            // Fakes a smooth progression dynamically based on chunks
            const fakePercent = Math.min(95, 70 + (chunksReceived * 2)); 
            onProgress(fakePercent, `IA Lendo e Transcrevendo... (Gerado ${chunksReceived} fragmentos)`);
          }
        }

        // Registrar sucesso no uso da chave para o dashboard
        if (window.updateKeyUsage) window.updateKeyUsage(keyHash);

        return fullText.trim();
        
      } catch (e) {
        console.warn(`[Matriz Falha] Chave ${i + 1} (..${keyHash}) - Modelo ${modelName}:`, e.message || e);
        lastError = e;
        
        const errorStr = (e.message || "").toLowerCase();
        
        // Identificar tipo exato do erro para atualizar o dashboard
        let errorType = 'error';
        if (errorStr.includes("403") || errorStr.includes("denied") || errorStr.includes("forbidden") || errorStr.includes("permission")) {
          errorType = 'blocked'; 
        } else if (errorStr.includes("api key not valid") || errorStr.includes("api_key_invalid") || errorStr.includes("key is invalid")) {
          errorType = 'invalid';
        } else if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted") || errorStr.includes("rate limit")) {
          errorType = 'quota_exceeded';
        }

        console.warn(`👉 [Auto-Failover] Chave ${i + 1} (..${keyHash}) indisponível (${errorType}). Alternando imediatamente!`);
        if (window.setKeyError) window.setKeyError(keyHash, errorType);
        
        break; // Sai do loop "m" (modelos) e vai pro loop "i" (próxima chave) para poupar precioso tempo!
      }
    }
  }

  // Se esgotar tudo (Todos Modelos x Todas Chaves)
  throw new Error("❌ Esgotamento Total: " + (lastError?.message || "Servidores do Google indisponíveis."));
}

function getRealConfidence(text, fallbackConfidence) {
  if (!text || typeof text !== 'string') return fallbackConfidence || 0;
  
  const textLower = text.toLowerCase();
  
  // REGRA DE OURO: Se o texto contém marcação de OCR LOCAL, OCR BRUTO ou TEXTO DIGITAL NATIVO, a confiança líquida é ZERO para permitir reprocessamento.
  if (
    textLower.includes('ocr local') || 
    textLower.includes('ocr bruto') || 
    textLower.includes('texto digital nativo') || 
    textLower.includes('digital nativo')
  ) {
    return 0;
  }
  
  // Se o documento tiver marcas de "[ILEGÍVEL]" ou "ILEGÍVEL", penaliza a confiança proporcionalmente
  const ilegivelCount = (textLower.match(/ileg[íi]vel/g) || []).length;
  let computedConfidence = fallbackConfidence || 99;
  
  const pageRegex = /(?:PÁGINA|PAGINA)\s+(\d+)/gi;
  const lines = text.split('\n');
  const pagesSeen = new Set();
  const failedPagesSeen = new Set();
  let hasCheckedPages = false;
  
  for (let line of lines) {
    const match = pageRegex.exec(line);
    pageRegex.lastIndex = 0;
    
    if (match) {
      const pageNum = parseInt(match[1], 10);
      const lowerLine = line.toLowerCase();
      
      const isFailed = lowerLine.includes('pulada') || 
                       lowerLine.includes('crash') || 
                       lowerLine.includes('falha') || 
                       lowerLine.includes('erro crítico') || 
                       lowerLine.includes('erro critico');
      
      pagesSeen.add(pageNum);
      if (isFailed) {
        failedPagesSeen.add(pageNum);
      }
      hasCheckedPages = true;
    }
  }
  
  if (hasCheckedPages && pagesSeen.size > 0) {
    const totalCount = pagesSeen.size;
    const failedCount = failedPagesSeen.size;
    const successfulCount = Math.max(0, totalCount - failedCount);
    
    if (successfulCount === 0) return 0;
    
    const baseConfidence = Math.max(0, Math.min(100, computedConfidence));
    const successRatio = successfulCount / totalCount;
    computedConfidence = Math.min(100, Math.max(0, Math.round(baseConfidence * successRatio)));
  } else if (textLower.includes('página pulada') || textLower.includes('pagina pulada') || textLower.includes('erro crítico na página') || textLower.includes('erro critico na pagina')) {
    computedConfidence = Math.max(0, Math.round(computedConfidence * 0.5));
  } else {
    computedConfidence = Math.min(100, Math.max(0, Math.round(computedConfidence)));
  }

  // É do Modo IA Jurídica?
  const isAiJuridica = textLower.includes('ia jurídica') || textLower.includes('ia juridica') || textLower.includes('recuperado via ia');

  if (isAiJuridica) {
    // Para a IA Jurídica (Padrão Ouro), o fato de marcar campos carimbados ou assinaturas indecifráveis como [ILEGÍVEL] 
    // é um sinal de extrema fidedignidade e precisão (evitando alucinação perigosa), e não uma falha de detecção.
    // Portanto, a penalidade por ilegível é praticamente nula (apenas 0.5% por ocorrência, limitado a no máximo 4% de dedução total).
    if (ilegivelCount > 0) {
      const ilegivelPenalty = Math.min(4, Math.round(ilegivelCount * 0.5));
      computedConfidence = Math.max(95, computedConfidence - ilegivelPenalty); // Garante piso de 95% para transcrições da IA
    } else {
      computedConfidence = Math.max(99, computedConfidence);
    }
  } else {
    // Para OCR local comum, se houver marcas de ilegibilidade, de fato indica que o OCR local falhou em partes maiores
    if (ilegivelCount > 0) {
      const ilegivelPenalty = Math.min(30, ilegivelCount * 5);
      computedConfidence = Math.max(0, computedConfidence - ilegivelPenalty);
    }
  }

  return computedConfidence;
}

// Substituição cirúrgica do texto de uma página específica
function replacePageTextInDoc(fullText: string, pageNum: number, newPageText: string): string {
  const regexHeader = new RegExp(`\\[(?:PÁGINA|PAGINA|ERRO\\s+CRÍTICO\\s+NA\\s+PÁGINA|ERRO\\s+CRITICO\\s+NA\\s+PAGINA)\\s+${pageNum}\\b`, 'i');
  
  const match = regexHeader.exec(fullText);
  if (!match) {
    return fullText + `\n\n[PÁGINA ${pageNum} - RECUPERADO VIA IA JURÍDICA]\n` + newPageText;
  }
  
  const startIndex = match.index;
  const nextHeaderRegex = /\[(?:PÁGINA|PAGINA|ERRO\s+CRÍTICO\s+NA\s+PÁGINA|ERRO\\s+CRITICO\\s+NA\\s+PAGINA)\s+\d+\b/gi;
  nextHeaderRegex.lastIndex = startIndex + match[0].length;
  
  const nextMatch = nextHeaderRegex.exec(fullText);
  let endIndex = fullText.length;
  if (nextMatch) {
    endIndex = nextMatch.index;
  }
  
  const before = fullText.substring(0, startIndex);
  const after = fullText.substring(endIndex);
  
  const replacement = `[PÁGINA ${pageNum} - RECUPERADO VIA IA JURÍDICA]\n` + newPageText + "\n\n";
  return before.trim() + "\n\n" + replacement + after.trim();
}

async function extractPDFHybrid(file, onProgress, useAi, startPage = 1, forceAi = false) {
  const pdfjsLib = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  let confidenceTotal = 0;
  let pagesEvaluated = 0;

  // Global worker reference to speed up massive PDFs
  let tesseractWorker = null;
  const Tesseract = await loadTesseract();

  const withTimeout = (promise, ms, errorMsg) => {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  };

  const startIdx = parseInt(startPage) || 1;
  const endIdx = pdf.numPages;

  for (let i = startIdx; i <= endIdx; i++) {
    if (window.lexscan_abort) {
        window.lexscan_abort = false;
        fullText += `\n\n[PROCESSO INTERROMPIDO PELO USUÁRIO NA PÁGINA ${i-1}]\n\n`;
        break;
    }

    let pageSuccess = false;
    let pageText = "";
    let lastPageError = null;
    const maxPageAttempts = 3;

    for (let attempt = 1; attempt <= maxPageAttempts; attempt++) {
      try {
        if (attempt > 1) {
          // Breve recuo exponencial/estratégico para limpar memória, conexões ou limites de taxa
          const delayTime = 2500 * (attempt - 1);
          onProgress(
            Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
            `Pág ${i}/${endIdx}: Estabilizando conexões... Tentativa de reparo ${attempt}/${maxPageAttempts} em ${delayTime / 1000}s...`
          );
          await new Promise(r => setTimeout(r, delayTime));
        }

        onProgress(
          Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
          `Lendo pág ${i}/${endIdx} (Tentativa ${attempt}/${maxPageAttempts})...`
        );

        // Ajuste elástico de timeout de carregamento da página do PDF
        const currentTimeout = 20000 * attempt;
        const page = await withTimeout(pdf.getPage(i), currentTimeout, `Timeout ao carregar dados do PDF para a pág ${i}`);

        // Tenta texto digital nativo primeiro (somente na tentativa 1 para poupar redundâncias)
        const shouldBypassNative = forceAi;
        if (!shouldBypassNative && attempt === 1) {
          try {
            const textContent = await withTimeout(page.getTextContent(), currentTimeout, `Timeout no texto nativo da pág ${i}`);
            pageText = textContent.items.map(item => item.str).join(" ").trim();
          } catch (nativeErr) {
            console.warn(`[Pág ${i}] Não foi possível obter texto nativo (tentando OCR visual):`, nativeErr);
            pageText = "";
          }
        }

        if (!shouldBypassNative && pageText.length > 600) {
          fullText += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + pageText + "\n\n";
          confidenceTotal += 100;
          pagesEvaluated++;
          pageSuccess = true;
          if (page && page.cleanup) page.cleanup();
          break; // Sucesso com texto nativo, prossegue!
        } else {
          // Página escaneada, foto ou PDF complexo: Renderiza tela do canvas
          onProgress(
            Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
            `Pág ${i}: Renderizando imagem estrutural (Tentativa ${attempt})...`
          );

          let viewport = null;
          let finalCanvasToUse = null;
          let renderSuccess = false;

          // Escala adaptativa progressiva para economia de heap/buffers caso esteja falhando
          const attemptScales = attempt === 1 ? [1.25, 1.0] : attempt === 2 ? [1.0, 0.85] : [0.75];
          
          for (let scaleAttempt of attemptScales) {
            let canvas = document.createElement("canvas");
            let ctx = null;
            let renderTask = null;
            try {
              viewport = page.getViewport({ scale: scaleAttempt });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              ctx = canvas.getContext("2d", { willReadFrequently: true });
              if (!ctx) continue;

              renderTask = page.render({ canvasContext: ctx, viewport });
              await withTimeout(renderTask.promise, 35000, `Timeout na renderização com escala ${scaleAttempt}`);
              finalCanvasToUse = canvas;
              renderSuccess = true;
              break;
            } catch (renderErr) {
              console.warn(`[Pág ${i}] Renderização falhou com escala ${scaleAttempt} na tentativa ${attempt}`, renderErr);
              if (renderTask) {
                try { renderTask.cancel(); } catch (cancelErr) {}
              }
              canvas.width = 0; canvas.height = 0;
            }
          }

          if (!renderSuccess || !finalCanvasToUse) {
            throw new Error(`Falha crítica ao tentar renderizar a página ${i} em tela.`);
          }

          // Filtro profissional para contraste do OCR local
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = finalCanvasToUse.width; tempCanvas.height = finalCanvasToUse.height;
          const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
          if (tempCtx) {
             tempCtx.filter = 'grayscale(100%) contrast(220%) brightness(105%)';
             tempCtx.drawImage(finalCanvasToUse, 0, 0);
          }

          let blob = await new Promise<Blob | null>(r => tempCanvas.toBlob(r, "image/png", 0.9));
          if (!blob) throw new Error("Erro de buffer ao gerar canvas otimizado.");

          if (useAi || forceAi) {
            let ocrRes = { text: "", confidence: 0 };
            let shouldGoToAi = forceAi;

            // OCR local como teste prévio (apenas se não estiver forçando IA diretamente)
            if (!shouldGoToAi) {
              onProgress(
                Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
                `Pág ${i}: Rodando validação de OCR Local (Tentativa ${attempt})...`
              );
              try {
                if (!tesseractWorker) {
                   tesseractWorker = await Tesseract.createWorker("por+eng", 1, { logger: () => {} });
                }
                const res = await withTimeout(tesseractWorker.recognize(blob), 60000, `Timeout OCR local na página ${i}`);
                ocrRes = { text: res.data.text.trim(), confidence: Math.round(res.data.confidence) };
              } catch (err) {
                console.warn(`[Pág ${i}] Erro no Tesseract local, relegando fluxo...`, err);
                ocrRes = { text: "", confidence: 0 };
                if (tesseractWorker) {
                  await tesseractWorker.terminate().catch(()=>null);
                  tesseractWorker = null;
                }
              }
              if (ocrRes.confidence >= 99) {
                fullText += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + ocrRes.text + "\n\n";
                confidenceTotal += 100;
                pageSuccess = true;
                
                // Cleanup
                finalCanvasToUse.width = 0; finalCanvasToUse.height = 0;
                tempCanvas.width = 0; tempCanvas.height = 0;
                if (page && page.cleanup) page.cleanup();
                break;
              } else {
                shouldGoToAi = true;
              }
            }

            if (shouldGoToAi) {
              onProgress(
                Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
                `Pág ${i}: Extraindo via IA Jurídica (Tentativa ${attempt})...`
              );
              
              const originalColorBlob = await new Promise<Blob | null>(r => finalCanvasToUse.toBlob(r, "image/jpeg", 0.95));
              if (!originalColorBlob) throw new Error("Falha ao exportar imagem original colorida.");
              const enhancedForAi = await enhanceImageForGemini(originalColorBlob);
              
              const aiText = await extractPageWithGemini(enhancedForAi, onProgress);
              fullText += `[PÁGINA ${i} - RECUPERADO VIA IA JURÍDICA]\n` + aiText + "\n\n";
              confidenceTotal += 99;
              pageSuccess = true;

              // Cleanup
              finalCanvasToUse.width = 0; finalCanvasToUse.height = 0;
              tempCanvas.width = 0; tempCanvas.height = 0;
              if (page && page.cleanup) page.cleanup();
              break;
            }
          } else {
            // Apenas OCR local pura
            onProgress(
              Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
              `Pág ${i}: Executando OCR Local...`
            );
            let ocrRes = { text: "", confidence: 0 };
            try {
              if (!tesseractWorker) {
                 tesseractWorker = await Tesseract.createWorker("por+eng", 1, { logger: () => {} });
              }
              const res = await withTimeout(tesseractWorker.recognize(blob), 60000, `Timeout OCR local na página ${i}`);
              ocrRes = { text: res.data.text.trim(), confidence: Math.round(res.data.confidence) };
            } catch (err) {
              ocrRes = { text: "[PÁGINA PULADA]", confidence: 0 };
              if (tesseractWorker) {
                await tesseractWorker.terminate().catch(()=>null);
                tesseractWorker = null;
              }
            }

            if (ocrRes.confidence >= 99) {
              fullText += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + ocrRes.text + "\n\n";
              confidenceTotal += 100;
            } else {
              fullText += `[PÁGINA ${i} - OCR BRUTO (${ocrRes.confidence}%)]\n` + ocrRes.text + "\n\n";
              confidenceTotal += 0;
            }
            pageSuccess = true;

            // Cleanup
            finalCanvasToUse.width = 0; finalCanvasToUse.height = 0;
            tempCanvas.width = 0; tempCanvas.height = 0;
            if (page && page.cleanup) page.cleanup();
            break;
          }

          // Active GC
          if (finalCanvasToUse) { finalCanvasToUse.width = 0; finalCanvasToUse.height = 0; }
          tempCanvas.width = 0; tempCanvas.height = 0;
          blob = null;
        }

        pagesEvaluated++;

        // Restart worker periodicamente para manter cota e memoria Wasm limpa
        if (pagesEvaluated % 20 === 0 && tesseractWorker) {
           await tesseractWorker.terminate().catch(()=>null);
           tesseractWorker = null;
        }
        
        if (page && page.cleanup) page.cleanup();
      } catch (pageErr) {
        console.warn(`[Pág ${i}] Falha capturada na tentativa ${attempt}:`, pageErr);
        lastPageError = pageErr;
      }
    }

    if (!pageSuccess) {
      console.error(`[Pág ${i}] Falha persistente após ${maxPageAttempts} tentativas.`);
      const errorMsg = lastPageError ? lastPageError.message || "Erro de timeout/IA" : "Erro estrutural";
      
      if (pageText && pageText.trim().length > 5) {
        fullText += `\n\n[PÁGINA ${i} - TEXTO DIGITAL NATIVO (REDUZIDO DE FALLBACK devido a falha: ${errorMsg})]\n\n` + pageText + "\n\n";
        confidenceTotal += 100;
      } else {
        fullText += `\n\n[ERRO CRÍTICO NA PÁGINA ${i} - PÁGINA PULADA (Falha persistente: ${errorMsg})]\n\n`;
      }
      pagesEvaluated++;
    }
  }

  if (tesseractWorker && tesseractWorker.terminate) {
    await tesseractWorker.terminate();
  }

  try {
     if (pdf && pdf.destroy) await pdf.destroy();
  } catch(e) { }

  const rawConfidence = Math.min(100, Math.max(0, Math.round(confidenceTotal / (pagesEvaluated || 1))));
  return { text: fullText.trim(), confidence: getRealConfidence(fullText, rawConfidence) };
}

async function convertSingleImageToPDF(file) {
  // Injeção Local de Jspdf
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
  
  const blobUrl = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(blobUrl); res(i); };
    i.onerror = () => { URL.revokeObjectURL(blobUrl); rej(); };
    i.src = blobUrl;
  });

  const pdfW = 210;
  const pdfH = 297;
  
  const compCanvas = document.createElement("canvas");
  const compCtx = compCanvas.getContext("2d");
  
  // Compressão Média
  let scale = 1;
  const MAX_SIZE = 1200;
  if (img.width > MAX_SIZE || img.height > MAX_SIZE) {
     scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height);
  }
  
  compCanvas.width = img.width * scale;
  compCanvas.height = img.height * scale;
  compCtx.drawImage(img, 0, 0, compCanvas.width, compCanvas.height);
  
  const compressedDataUrl = compCanvas.toDataURL("image/jpeg", 0.7);
  
  let imgW = (compCanvas.width * pdfH) / compCanvas.height;
  let imgH = (compCanvas.height * pdfW) / compCanvas.width;
  
  if (imgH > pdfH) {
     imgH = pdfH;
     imgW = (compCanvas.width * pdfH) / compCanvas.height;
  }
  
  const x = (pdfW - imgW) / 2;
  const y = (pdfH - imgH) / 2;

  doc.addImage(compressedDataUrl, 'JPEG', x, y, imgW, imgH, undefined, 'FAST');
  URL.revokeObjectURL(blobUrl);

  const pdfBlob = doc.output('blob');
  return new File([pdfBlob], file.name.replace(/\.[^/.]+$/, "") + ".pdf", { type: "application/pdf" });
}

async function extractImageHybrid(file, onProgress, useAi, forceAi = false) {
  if (forceAi) {
      onProgress(20, "Forçando extração via IA Jurídica...");
      try {
          const enhancedForAi = await enhanceImageForGemini(file);
          const aiText = await extractPageWithGemini(enhancedForAi, onProgress);
          return { text: `[RECUPERADO VIA IA JURÍDICA]\n` + aiText, confidence: 99 };
      } catch(e) {
          let errMsg = e.message || "Erro desconhecido";
          return { text: `[OCR BRUTO (FALHA IA: ${errMsg})]\n`, confidence: 0 };
      }
  }

  onProgress(10, "Avaliando qualidade da imagem via OCR Local...");
  const ocrRes = await runOCR(file, (p) => onProgress(10 + Math.round(p * 40), `Avaliando OCR: ${Math.round(p*100)}%`));
  
  if (useAi && ocrRes.confidence < 99) {
      onProgress(70, `Qualidade insuficiente (${ocrRes.confidence}%). Acionando IA Jurídica...`);
      try {
          // Melhora o contraste de imagem nativa/foto antes de extrair com Gemini
          const enhancedForAi = await enhanceImageForGemini(file);
          const aiText = await extractPageWithGemini(enhancedForAi, onProgress);
          return { text: `[RECUPERADO VIA IA JURÍDICA]\n` + aiText, confidence: 99 };
      } catch(e) {
          let errMsg = e.message || "Erro desconhecido";
          // Se falhar a IA, marcamos como 0 para permitir lote posterior
          return { text: `[OCR BRUTO (FALHA IA: ${errMsg})]\n` + ocrRes.text, confidence: 0 };
      }
  }
  
  if (ocrRes.confidence >= 99) {
      return { text: `[TEXTO DIGITAL NATIVO]\n` + ocrRes.text, confidence: 100 };
  }
  
  return { text: `[OCR BRUTO (${ocrRes.confidence}%)]\n` + ocrRes.text, confidence: 0 };
}

// ── OCR via Tesseract ─────────────────────────────────────────────────────────
async function runOCR(imageBlob, onProgress) {
  // Pré-processamento para imagens enviadas diretamente
  const enhancedBlob = await (async () => {
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        const url = URL.createObjectURL(imageBlob);
        i.onload = () => { URL.revokeObjectURL(url); res(i); };
        i.onerror = () => { URL.revokeObjectURL(url); rej(); };
        i.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      // Filtro otimizado para fotos de celular (mais contraste para manuscritos)
      ctx.filter = 'grayscale(100%) contrast(200%) brightness(105%)';
      ctx.drawImage(img, 0, 0);
      const resBlob = await new Promise(r => canvas.toBlob(r, "image/png", 1.0));
      canvas.width = 0; canvas.height = 0;
      return resBlob;
    } catch (e) {
      console.warn("Falha no pré-processamento, usando original", e);
      return imageBlob;
    }
  })();

  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(enhancedBlob, "por+eng", {
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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// ── Componente principal ──────────────────────────────────────────────────────
export default function ScannerJuridico() {
  const [tab, setTab] = useState("scanner");
  const [file, setFile] = useState(null);
  const [queue, setQueue] = useState([]); // Fila de arquivos para processamento em massa
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [startPage, setStartPage] = useState(1);
  const [history, setHistory] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [viewingClient, setViewingClient] = useState(null); // null = tela geral de clientes, "unassigned" = sem pasta, "ID" = pasta esp
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [movingItem, setMovingItem] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [newDocumentName, setNewDocumentName] = useState("");
  const [sortOrder, setSortOrder] = useState("date-desc"); // "date-desc", "date-asc", "name-asc", "name-desc"
  
  const [toast, setToast] = useState(null);
  const [camera, setCamera] = useState(false);
  const [stream, setStream] = useState(null);

  const [aiMode, setAiMode] = useState(true);
  const [keyUsage, setKeyUsage] = useState(() => {
    try {
      const saved = localStorage.getItem('lexscan_key_usage');
      return saved ? JSON.parse(saved) : {};
    } catch(e) {
      return {};
    }
  });
  
  const [keyErrors, setKeyErrors] = useState(() => {
    try {
      const saved = localStorage.getItem('lexscan_key_errors');
      return saved ? JSON.parse(saved) : {};
    } catch(e) {
      return {};
    }
  });

  // Flow State para Escaneamento em Lote (Multi-Páginas)
  const [cameraPages, setCameraPages] = useState([]);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchDocName, setBatchDocName] = useState("Documento_Escaneado");
  const [pdfQuality, setPdfQuality] = useState("media"); // leve, media, alta

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
  const [completedCrop, setCompletedCrop] = useState(null);

  const fileRefImg = useRef();
  const fileRefPdf = useRef();
  const fileRefBatchImg = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const croppedImgRef = useRef();
  const [viewingBatchPage, setViewingBatchPage] = useState(null);

  // Expor função de tracking para o motor externo de IA
  useEffect(() => {
    window.updateKeyUsage = (hash) => {
      setKeyUsage(prev => {
        const next = {
          ...prev,
          [hash]: (prev[hash] || 0) + 1
        };
        localStorage.setItem('lexscan_key_usage', JSON.stringify(next));
        return next;
      });
      setKeyErrors(prev => {
        const next = { ...prev, [hash]: 'active' };
        localStorage.setItem('lexscan_key_errors', JSON.stringify(next));
        return next;
      });
    };
    window.setKeyError = (hash, errorType) => {
      setKeyErrors(prev => {
        const next = { ...prev, [hash]: errorType };
        localStorage.setItem('lexscan_key_errors', JSON.stringify(next));
        return next;
      });
    };
  }, []);

  // Proactive Purge: Bloqueia e destrói completamente qualquer elemento ou iframe do Vercel Toolbar/Live Feedback/GitHub
  useEffect(() => {
    try {
      window.__VERCEL_FEEDBACK = null;
      window.__VERCEL_TOOLBAR = null;
      window.__VERCEL_DEV_SHORTS = null;
      Object.defineProperty(window, '__VERCEL_FEEDBACK', {
        value: null,
        writable: false,
        configurable: false
      });
      Object.defineProperty(window, '__VERCEL_TOOLBAR', {
        value: null,
        writable: false,
        configurable: false
      });
    } catch (e) {
      console.warn("Supressão de variáveis Vercel:", e);
    }

    const purgeVercelElements = () => {
      const selectors = [
        'vercel-live-feedback',
        '#vercel-preview-feedback-iframe',
        '[id*="vercel-preview-feedback"]',
        '[class*="vercel-preview-feedback"]',
        'iframe[src*="vercel.com"]',
        'iframe[src*="vercel.app"]'
      ];
      selectors.forEach(sel => {
        try {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => el.remove());
        } catch (err) {}
      });
    };

    purgeVercelElements();
    const intervalId = setInterval(purgeVercelElements, 200);

    const observer = new MutationObserver(() => {
      purgeVercelElements();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, []);

  const loadData = useCallback(async () => {
    if (supabase) {
      try {
        const { data: cData } = await supabase.from('lexscan_clients').select('*').order('created_at', { ascending: false });
        if (cData) {
          setClients(cData.map(c => {
             let name = c.name;
             let parentId = null;
             if (name.includes('::')) {
                const parts = name.split('::');
                parentId = parts[0];
                name = parts.slice(1).join('::');
             }
             return { id: c.id, name, parentId, ts: c.created_at, originalName: c.name };
          }));
        }
        
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
      console.warn("Supabase não está configurado. A persistência de dados está desativada.");
    }
  }, []);

  useEffect(() => { 
    loadData();
  }, [loadData]);

  // Sincronização em Tempo Real (Realtime Sync) para multiplos usuários simultâneos
  useEffect(() => {
    if (!supabase) return;

    const clientsChannel = supabase
      .channel('realtime-clients')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lexscan_clients' },
        () => {
          loadData();
        }
      )
      .subscribe();

    const docsChannel = supabase
      .channel('realtime-docs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lexscan_documents' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [loadData]);

  const confColor = (c) => {
    if (c >= 90) return G.success;
    if (c >= 70) return G.warning;
    return G.error;
  };

  /**
   * Otimiza o texto bruto do OCR sem usar IA (Lógica heurística)
   * Tenta reconstruir parágrafos, remover ruídos de leitura e normalizar espaços.
   */
  const optimizeRawText = (text) => {
    if (!text) return "";
    
    // 1. Limpeza de ruído de borda e caracteres isolados estranhos
    let cleaned = text.split('\n')
      .map(line => {
        // Remove caracteres que costumam ser "sujeira" de scanner (bordas de página)
        // Mantém letras, números, acentos e pontuação básica
        let l = line.replace(/[^a-zA-Z0-9\sáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ.,:;()\-/$%]/g, ' ');
        
        // Remove símbolos isolados (caracteres sozinhos que não são palavras comuns como 'a', 'e', 'o')
        l = l.split(' ').filter(word => {
            if (word.length === 1) {
                return /^[aeiou0-9]$/i.test(word); // Mantém se for vogal ou número
            }
            return true;
        }).join(' ');

        return l.trim().replace(/\s+/g, ' ');
      })
      .filter(line => line.length > 2) // Remove linhas muito curtas (geralmente ruído)
      .join('\n');

    // 2. Reconstrução de Parágrafos e Destaque de Cabeçalhos
    // O OCR quebra linhas no meio de frases. Tentamos juntar e destacar títulos.
    const lines = cleaned.split('\n');
    let reconstructed = "";
    for (let i = 0; i < lines.length; i++) {
      let current = lines[i].trim();
      let next = lines[i+1] ? lines[i+1].trim() : "";

      // Se a linha parece um cabeçalho (CURTA e em CAIXA ALTA), negritamos
      const looksLikeHeader = current.length < 50 && current === current.toUpperCase() && /[A-Z]/.test(current);
      if (looksLikeHeader) {
        current = `**${current}**`;
      }

      reconstructed += current;

      // Se a linha ATUAL não termina com pontuação forte (. : ? ! ;) 
      // e o cabeçalho não foi o foco atual (cabeçalhos costumam quebrar linha)
      const endsWithSentencePunctuation = /[.:?!;]$/.test(current);
      
      if (!endsWithSentencePunctuation && !looksLikeHeader && next) {
        reconstructed += " ";
      } else {
        reconstructed += "\n\n";
      }
    }

    // 3. Normalização final de espaços e limpezas
    return reconstructed
      .replace(/\n{3,}/g, '\n\n') // No max 2 newlines
      .replace(/ {2,}/g, ' ')     // No double spaces
      .trim();
  };

  const compressFile = async (blob, level = 0.6) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b), "image/jpeg", level);
      };
      img.src = URL.createObjectURL(blob);
    });
  };

  const handleCompressAndDownload = async (item, levelName) => {
    const levelMap = { 'Pouca': 0.9, 'Média': 0.6, 'Máxima': 0.3 };
    const level = levelMap[levelName];
    
    showToast(`Comprimindo (${levelName})...`);
    
    try {
      // Se for imagem, conseguimos comprimir via canvas
      if (item.type.startsWith('image/')) {
        const response = await fetch(item.fileUrl || item.preview);
        const blob = await response.blob();
        const compressedBlob = await compressFile(blob, level);
        const url = URL.createObjectURL(compressedBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `[COMPRIMIDO_${levelName}]_${item.name.replace(/\.[^.]+$/, "")}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("✓ Download concluído!");
      } else {
        showToast("Compressão avançada disponível para imagens/scans", "info");
      }
    } catch (e) {
      showToast("Erro ao comprimir", "error");
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    const validFiles = Array.from(files).filter(f => allowed.includes(f.type));
    
    if (validFiles.length === 0) {
      showToast("Nenhum formato suportado selecionado", "error");
      return;
    }

    if (validFiles.length > 2000) {
      showToast("Capacidade expandida: Limite de 2000 arquivos por vez", "info");
      validFiles.splice(2000);
    }

    const allImages = validFiles.every(f => f.type.startsWith("image/"));

    if (validFiles.length > 1 && allImages) {
      setCameraPages(validFiles);
      setIsBatchModalOpen(true);
      return;
    }

    if (validFiles.length === 1) {
      const f = validFiles[0];
      setFile(f);
      setQueue([]);
      setResult(null);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setQueue(validFiles);
      setFile(null);
      setPreview(null);
      setResult(null);
      showToast(`${validFiles.length} arquivos prontos na fila`, "info");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  const processBatch = async () => {
    if (queue.length === 0) return;
    
    setProcessing(true);
    setCurrentQueueIndex(0);
    
    for (let i = 0; i < queue.length; i++) {
      setCurrentQueueIndex(i);
      const currentFile = queue[i];
      await performSingleProcess(currentFile, i + 1, queue.length);
    }
    
    setProcessing(false);
    setCurrentQueueIndex(-1);
    setQueue([]);
    showToast(`✓ Lote de ${queue.length} concluído!`, "success");
    setTab("history");
  };

  const uploadBatchWithoutOCR = async () => {
    if (queue.length === 0) return;
    
    setProcessing(true);
    setCurrentQueueIndex(0);
    
    for (let i = 0; i < queue.length; i++) {
      setCurrentQueueIndex(i);
      const f = queue[i];
      setProgress(Math.round(((i) / queue.length) * 100));
      setProgressMsg(`[${i+1}/${queue.length}] Salvando na nuvem: ${f.name}`);
      
      try {
        let fileUrl = null;
        let finalId = Date.now().toString() + "_" + i;
        let finalFileForUpload = f;

        if (f.type.startsWith("image/")) {
           setProgressMsg(`[${i+1}/${queue.length}] Convertendo para PDF: ${f.name}`);
           try {
              finalFileForUpload = await convertSingleImageToPDF(f);
           } catch(e) {
              console.error("Erro na conversão para PDF, enviando original", e);
           }
        }

        if (supabase) {
          const ext = finalFileForUpload.name.split('.').pop() || 'jpg';
          const rawName = finalFileForUpload.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `${Date.now()}_${rawName}.${ext}`;
          
          const { data: uploadData } = await supabase.storage.from('ged-auditoria').upload(fileName, finalFileForUpload);
          if (uploadData) {
            const { data: publicUrl } = supabase.storage.from('ged-auditoria').getPublicUrl(fileName);
            fileUrl = publicUrl.publicUrl;
          }

          const { data: inserted } = await supabase.from('lexscan_documents').insert({
            client_id: selectedClient === 'unassigned' || !selectedClient ? null : selectedClient,
            name: finalFileForUpload.name,
            extracted_text: '',
            confidence: 0,
            file_url: fileUrl,
            file_type: finalFileForUpload.type,
            chars_count: 0,
            words_count: 0
          }).select().single();
          
          if (inserted) finalId = inserted.id;
        }

        const item = {
          id: finalId,
          clientId: selectedClient || 'unassigned',
          name: finalFileForUpload.name,
          type: finalFileForUpload.type,
          ts: Date.now(),
          text: '',
          confidence: 0,
          words: 0,
          chars: 0,
          fileUrl,
          preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
          localBlobUrl: URL.createObjectURL(finalFileForUpload)
        };

        setHistory(prev => [item, ...prev]);
      } catch (e) {
        console.error("Erro salvando arquivo (seml ocr):", e);
        showToast(`Erro ao salvar arquivo ${i+1}`, "error");
      }
    }
    
    setProcessing(false);
    setCurrentQueueIndex(-1);
    setQueue([]);
    showToast(`✓ ${queue.length} arquivos salvos na pasta!`, "success");
    setTab("history");
  };

  const performSingleProcess = async (f, current, total) => {
    setProgress(0);
    setProgressMsg(`[${current}/${total}] Processando: ${f.name}`);

    try {
      let extracted;
      const onProgress = (p, msg) => { 
        setProgress(p); 
        setProgressMsg(`[${current}/${total}] ${msg || "Extraindo..."}`); 
      };

      if (f.type === "application/pdf") {
        extracted = await extractPDFHybrid(f, onProgress, aiMode, startPage, aiMode);
      } else {
        extracted = await extractImageHybrid(f, onProgress, aiMode, aiMode);
      }

      // Otimização Heurística para todos os casos (limpeza final)
      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text);
      }

      onProgress(85, "Salvando na nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString() + "_" + current;
      let finalFileForUpload = f;
      
      // Se for imagem, a pedido do usuário, converter para PDF nativamente antes de salvar
      if (f.type.startsWith("image/")) {
         onProgress(88, "Convertendo Imagem para PDF...");
         try {
            finalFileForUpload = await convertSingleImageToPDF(f);
         } catch(e) {
            console.error("Erro na conversão para PDF, enviando original", e);
         }
      }

      if (supabase) {
        const ext = finalFileForUpload.name.split('.').pop() || 'jpg';
        const rawName = finalFileForUpload.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${Date.now()}_${rawName}.${ext}`;
        
        const { data: uploadData } = await supabase.storage.from('ged-auditoria').upload(fileName, finalFileForUpload);
        if (uploadData) {
          const { data: publicUrl } = supabase.storage.from('ged-auditoria').getPublicUrl(fileName);
          fileUrl = publicUrl.publicUrl;
        }

        const { data: inserted } = await supabase.from('lexscan_documents').insert({
          client_id: selectedClient === 'unassigned' || !selectedClient ? null : selectedClient,
          name: finalFileForUpload.name,
          extracted_text: extracted.text,
          confidence: extracted.confidence,
          file_url: fileUrl,
          file_type: finalFileForUpload.type,
          chars_count: extracted.text.length,
          words_count: extracted.text.split(/\s+/).length
        }).select().single();
        
        if (inserted) finalId = inserted.id;
      }

      const item = {
        id: finalId,
        clientId: selectedClient || 'unassigned',
        name: finalFileForUpload.name,
        type: finalFileForUpload.type,
        ts: Date.now(),
        text: extracted.text,
        confidence: extracted.confidence,
        words: extracted.text.split(/\s+/).length,
        fileUrl,
        preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        localBlobUrl: URL.createObjectURL(finalFileForUpload)
      };

      setHistory(prev => [item, ...prev]);
    } catch (e) {
      console.error(e);
      showToast(`Erro no arquivo ${current}`, "error");
    }
  };

  const process = async () => {
    if (queue.length > 0) {
      processBatch();
      return;
    }
    if (!file) return;
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Iniciando...");

    try {
      let extracted;
      const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

      window.lexscan_abort = false;

      if (file.type === "application/pdf") {
        extracted = await extractPDFHybrid(file, onProgress, aiMode, startPage, aiMode);
      } else {
        extracted = await extractImageHybrid(file, onProgress, aiMode, aiMode);
      }

      // Otimização Heurística para todos os casos (limpeza final)
      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text);
      }

      onProgress(80, "Verificando nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString();
      let finalFileForUpload = file;

      if (file.type.startsWith("image/")) {
         onProgress(88, "Convertendo Imagem para PDF...");
         try {
            finalFileForUpload = await convertSingleImageToPDF(file);
         } catch(e) {
            console.error("Erro na conversão para PDF, enviando original", e);
         }
      }

      if (supabase) {
        onProgress(85, "Armazenando PDF na Nuvem...");
        
        const ext = finalFileForUpload.name.split('.').pop() || 'jpg';
        const rawName = finalFileForUpload.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${Date.now()}_${rawName}.${ext}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage.from('ged-auditoria').upload(fileName, finalFileForUpload);
        if (!uploadError) {
           fileUrl = supabase.storage.from('ged-auditoria').getPublicUrl(fileName).data.publicUrl;
        } else {
           console.error("Storage Error:", uploadError);
           showToast("Erro ao armazenar arquivo na nuvem", "error");
           return;
        }

        onProgress(95, "Sincronizando com o banco GED...");
        const docRecord = {
           client_id: selectedClient || null,
           name: finalFileForUpload.name,
           file_type: finalFileForUpload.type,
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
        name: finalFileForUpload.name,
        type: finalFileForUpload.type,
        preview: fileUrl || (file.type.startsWith("image/") ? preview : null),
        localBlobUrl: URL.createObjectURL(finalFileForUpload),
        fileUrl: fileUrl,
        text: extracted.text,
        confidence: extracted.confidence,
        chars: extracted.text.length,
        words: extracted.text.split(/\s+/).filter(Boolean).length,
        ts: Date.now(),
        clientId: selectedClient || "unassigned"
      };

      if (!supabase) {
        showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
      }
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

  const saveWithoutOCR = async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Iniciando...");

    try {
      const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

      onProgress(20, "Verificando nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString();
      let finalFileForUpload = file;

      if (file.type.startsWith("image/")) {
         onProgress(50, "Convertendo Imagem para PDF...");
         try {
            finalFileForUpload = await convertSingleImageToPDF(file);
         } catch(e) {
            console.error("Erro na conversão para PDF, enviando original", e);
         }
      }

      if (supabase) {
        onProgress(40, "Armazenando PDF na Nuvem...");
        
        const ext = finalFileForUpload.name.split('.').pop() || 'jpg';
        const rawName = finalFileForUpload.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${Date.now()}_${rawName}.${ext}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage.from('ged-auditoria').upload(fileName, finalFileForUpload);
        if (!uploadError) {
           fileUrl = supabase.storage.from('ged-auditoria').getPublicUrl(fileName).data.publicUrl;
        } else {
           console.error("Storage Error:", uploadError);
           showToast("Erro ao armazenar arquivo na nuvem", "error");
           return;
        }

        onProgress(80, "Sincronizando com o banco GED...");
        const docRecord = {
           client_id: selectedClient || null,
           name: finalFileForUpload.name,
           file_type: finalFileForUpload.type,
           file_url: fileUrl,
           extracted_text: "",
           confidence: 100, // No OCR, so fully confident it is what it is
           chars_count: 0,
           words_count: 0
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
        name: finalFileForUpload.name,
        type: finalFileForUpload.type,
        preview: fileUrl || (file.type.startsWith("image/") ? preview : null),
        localBlobUrl: URL.createObjectURL(finalFileForUpload),
        fileUrl: fileUrl,
        text: "",
        confidence: 100,
        chars: 0,
        words: 0,
        ts: Date.now(),
        clientId: selectedClient || "unassigned"
      };

      if (!supabase) {
        showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
      }
      setHistory(prev => [item, ...prev]);

      setResult(item);
      showToast("✓ Arquivo salvo com sucesso!");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erro ao salvar arquivo", "error");
    } finally {
      setProcessing(false);
    }
  };

  const recoverFailedPages = async (targetResult) => {
    if (!targetResult) return;
    const currentText = targetResult.text || "";
    
    // Encontra todas as páginas falhas
    const failedPages = [];
    const regex1 = /\[ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
    let match;
    while ((match = regex1.exec(currentText)) !== null) {
      failedPages.push(parseInt(match[1], 10));
    }
    const regex2 = /\[P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO\s+\(FALHA\s+IA/gi;
    while ((match = regex2.exec(currentText)) !== null) {
      failedPages.push(parseInt(match[1], 10));
    }
    
    const pagesToProcess = [...new Set(failedPages)].sort((a, b) => a - b);
    
    if (pagesToProcess.length === 0) {
      showToast("Nenhuma página com falha ou erro crítico foi encontrada neste documento!", "info");
      return;
    }
    
    setProcessing(true);
    setProgress(0);
    setProgressMsg(`Iniciando recuperação de ${pagesToProcess.length} página(s) falha(s)...`);
    
    try {
      const pdfjsLib = await loadPDFJS();
      
      // Pegando arquivo original
      let fileSource = file; 
      if (!fileSource && targetResult.localBlobUrl) {
        const res = await fetch(targetResult.localBlobUrl).catch(() => null);
        if (res) {
          fileSource = await res.blob();
        }
      }
      if (!fileSource && targetResult.fileUrl) {
        setProgressMsg("Baixando PDF original da nuvem...");
        const res = await fetch(targetResult.fileUrl).catch(() => null);
        if (res) {
          fileSource = await res.blob();
        }
      }
      
      if (!fileSource) {
        throw new Error("Não foi possível acessar o PDF original para carregar as páginas.");
      }
      
      const arrayBuffer = await fileSource.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let updatedText = currentText;
      let successCount = 0;
      
      // Carrega Tesseract de forma proativa se precisar
      const Tesseract = await loadTesseract();
      
      for (let step = 0; step < pagesToProcess.length; step++) {
        const pageNum = pagesToProcess[step];
        setProgressMsg(`[${step + 1}/${pagesToProcess.length}] Recuperando Pág ${pageNum}...`);
        setProgress(Math.round(((step + 1) / pagesToProcess.length) * 100));
        
        try {
          const page = await pdf.getPage(pageNum);
          let viewport = page.getViewport({ scale: 1.25 });
          let canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          let ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) continue;
          
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          const originalColorBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
          const enhancedForAi = await enhanceImageForGemini(originalColorBlob);
          
          const aiText = await extractPageWithGemini(enhancedForAi, (p, msg) => {
            setProgressMsg(`[Pág ${pageNum}] ${msg || "Extraindo..."}`);
          });
          
          const cleanAiText = optimizeRawText(aiText);
          
          // Substituição cirúrgica no texto completo!
          updatedText = replacePageTextInDoc(updatedText, pageNum, cleanAiText);
          
          // Limpar canvas
          canvas.width = 0; canvas.height = 0;
          successCount++;
        } catch (pageErr) {
          console.error(`Erro ao tentar recuperar página ${pageNum}:`, pageErr);
        }
      }
      
      // Atualizar o resultado
      const updatedItem = {
        ...targetResult,
        text: updatedText,
        words: updatedText.split(/\s+/).filter(Boolean).length,
        chars: updatedText.length,
        confidence: Math.max(targetResult.confidence, 95) // Sobe a confiança já que recuperou páginas críticas!
      };
      
      // Se estiver usando o Supabase, atualizar no banco local/remoto!
      if (supabase && targetResult.id) {
        setProgressMsg("Sincronizando atualização no banco de dados...");
        const { error: dbError } = await supabase
          .from('lexscan_documents')
          .update({
            extracted_text: updatedText,
            confidence: updatedItem.confidence,
            chars_count: updatedText.length,
            words_count: updatedItem.words
          })
          .eq('id', targetResult.id);
          
        if (dbError) {
          console.error("Erro ao persistir atualização do PDF recuperado:", dbError);
        }
      }
      
      // Atualizar no Histórico
      setHistory(prev => prev.map(item => item.id === targetResult.id ? updatedItem : item));
      setResult(updatedItem);
      
      showToast(`✓ Sucesso! ${successCount} de ${pagesToProcess.length} páginas foram totalmente recuperadas e reinseridas!`, "success");
    } catch (err) {
      console.error(err);
      showToast(`Erro na recuperação de páginas: ${err.message}`, "error");
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
        // Instead of setting file directly and pushing to handleFile natively:
        setIsCropping(false);
        setCameraPages(prev => [...prev, blob]);
        setIsBatchModalOpen(true);
      }, "image/jpeg", 0.85);
    }
  };

  const rotateImage90 = () => {
    if (!croppedImgRef.current) return;
    const img = croppedImgRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const newFile = new File([blob], file.name, { type: file.type });
      setFile(newFile);
      setPreview(URL.createObjectURL(blob));
      setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
      setCompletedCrop(null);
    }, file.type, 1.0);
  };

  // Camera
  const openCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setStream(s);
      setCamera(true);
      setTimeout(() => { 
        if (videoRef.current) videoRef.current.srcObject = s; 
      }, 100);
    } catch { showToast("Câmera não disponível", "error"); }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Resolução Nativa da Câmera
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    
    ctx.drawImage(video, 0, 0);

    // Converte para JPEG com compressão equilibrada (Alta Qualidade de OCR, baixo disco)
    canvas.toBlob(blob => {
      if(!blob) return;
      // Salva arquivo temporário e pula pro corte
      const tempF = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
      setFile(tempF);
      setPreview(URL.createObjectURL(blob));
      closeCamera();
      // Sugere o corte
      setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
      setTimeout(() => setIsCropping(true), 150);
    }, "image/jpeg", 0.85); // 0.85 é o "ponto doce" entre nitidez e tamanho de arquivo
  };

  const closeCamera = () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null); setCamera(false);
  };

  const skipCropAndAddPage = () => {
    setIsCropping(false);
    fetch(preview).then(r => r.blob()).then(blob => {
      setCameraPages(prev => [...prev, blob]);
      setIsBatchModalOpen(true);
    });
  };

  const handleBatchImageAdd = (files) => {
    if (!files || files.length === 0) return;
    
    if (files.length === 1) {
       const f = files[0];
       setIsBatchModalOpen(false);
       const reader = new FileReader();
       reader.onload = (e) => {
          setPreview(e.target.result); 
          setFile(f);
          setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
          setTimeout(() => setIsCropping(true), 150);
       };
       reader.readAsDataURL(f);
    } else {
       const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
       setCameraPages(prev => [...prev, ...valid]);
       showToast(`${valid.length} imagens adicionadas!`);
    }
  };

  const movePage = (index, direction) => {
    setCameraPages(prev => {
      const arr = [...prev];
      if (index + direction < 0 || index + direction >= arr.length) return arr;
      const temp = arr[index];
      arr[index] = arr[index + direction];
      arr[index + direction] = temp;
      return arr;
    });
  };

  const compileCameraBatch = async () => {
    if (cameraPages.length === 0) return;
    
    showToast("Gerando PDF com Múltiplas Páginas...");
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Iniciando conversão...");
    
    // Injeção Local de Jspdf para alta consistência
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
    
    for (let i = 0; i < cameraPages.length; i++) {
      if (i > 0) doc.addPage();
      const pageBlob = cameraPages[i];
      const pageUrl = URL.createObjectURL(pageBlob);
      
      const img = await new Promise((res) => {
        const image = new Image();
        image.onload = () => res(image);
        image.src = pageUrl;
      });
      
      // Aplicando compressão no nível do PDF para economizar MBs
      let maxW; 
      let q;
      if(pdfQuality === 'leve') { maxW = 800; q = 0.6; }
      else if(pdfQuality === 'media') { maxW = 1200; q = 0.75; }
      else { maxW = 1920; q = 0.9; } // Alta

      let scaleCanvas = 1;
      if (img.width > maxW) scaleCanvas = maxW / img.width;

      const compCanvas = document.createElement("canvas");
      compCanvas.width = img.width * scaleCanvas;
      compCanvas.height = img.height * scaleCanvas;
      const compCtx = compCanvas.getContext("2d");
      compCtx.drawImage(img, 0, 0, compCanvas.width, compCanvas.height);
      const compressedDataUrl = compCanvas.toDataURL("image/jpeg", q);

      const pdfW = 210;
      const pdfH = 297;
      let imgW = pdfW;
      let imgH = (compCanvas.height * pdfW) / compCanvas.width;
      
      if (imgH > pdfH) {
         imgH = pdfH;
         imgW = (compCanvas.width * pdfH) / compCanvas.height;
      }
      
      const x = (pdfW - imgW) / 2;
      const y = (pdfH - imgH) / 2;

      doc.addImage(compressedDataUrl, 'JPEG', x, y, imgW, imgH, undefined, pdfQuality === 'alta' ? 'SLOW' : 'FAST');
    }
    
    setProgressMsg("Salvando PDF gerado...");
    const pdfBlob = doc.output('blob');
    const finalName = batchDocName.trim() ? batchDocName.trim() : "Documento_Escaneado";
    const sanitizedName = finalName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFile = new File([pdfBlob], `${finalName}.pdf`, { type: "application/pdf" });

    // Upload direto pro Supabase (Sem OCR) para acelerar a mesa
    showToast("PDF Otimizado e Gerado! Salvando na nuvem...");
    
    let fileUrl = null;
    let finalId = Date.now().toString();

    if (supabase) {
      const fileName = `${Date.now()}_${sanitizedName}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('ged-auditoria').upload(fileName, finalFile, {
        contentType: 'application/pdf'
      });
      
      if (!uploadError) {
         fileUrl = supabase.storage.from('ged-auditoria').getPublicUrl(fileName).data.publicUrl;
      } else {
         console.error("Storage Error:", uploadError);
         showToast("Erro ao fazer upload para a nuvem. O arquivo não foi salvo no DB.", "error");
         return; // Aborta para evitar registros ocos
      }
      
      const docRecord = {
         client_id: selectedClient === 'unassigned' || !selectedClient ? null : selectedClient,
         name: finalFile.name,
         file_type: finalFile.type,
         file_url: fileUrl,
         extracted_text: '',
         confidence: 0,
         chars_count: 0,
         words_count: 0
      };

      const { data: dbData } = await supabase.from('lexscan_documents').insert([docRecord]).select();
      if (dbData && dbData[0]) finalId = dbData[0].id;
    }

    const newItem = {
      id: finalId,
      clientId: selectedClient || 'unassigned',
      name: finalFile.name,
      type: finalFile.type,
      ts: Date.now(),
      text: '',
      confidence: 0,
      words: 0,
      chars: 0,
      fileUrl: fileUrl,
      preview: fileUrl,
      localBlobUrl: URL.createObjectURL(pdfBlob)
    };

    setHistory(prev => [newItem, ...prev]);
    if (!supabase) addToHistory(newItem);

    setCameraPages([]);
    setIsBatchModalOpen(false);
    setBatchDocName("Documento_Escaneado"); // reset config

    // Limpar o state da foto anterior e da crop session
    setFile(null);
    setPreview(null);
    setResult(null);
    setCroppedImage(null);

    // Joga pra aba scanner novamente para recomeçar o fluxo direto
    setTab("scanner"); 
    
    showToast("✓ Salvo! Scanner liberado para seu próximo documento.");
  };

  const processHistoryItem = async (item) => {
    setProcessing(true);
    setTab("scanner");
    setProgress(0);
    setProgressMsg("Baixando arquivo do GED...");
    
    try {
      const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;
      const res = await fetch(urlToFetch);
      const blob = await res.blob();
      const fileToProcess = new File([blob], item.name, { type: item.type });

      let extracted;
      const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

      window.lexscan_abort = false;

      if (fileToProcess.type === "application/pdf") {
        extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, true);
      } else {
        extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, true);
      }

      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text);
      }
      
      onProgress(90, "Atualizando banco de dados...");
      
      if (supabase) {
        await supabase.from("lexscan_documents").update({
          extracted_text: extracted.text,
          confidence: extracted.confidence,
          words_count: extracted.text.split(/\s+/).filter(Boolean).length,
          chars_count: extracted.text.length
        }).eq("id", item.id);
      }

      const updatedItem = {
        ...item,
        text: extracted.text,
        confidence: extracted.confidence,
        words: extracted.text.split(/\s+/).filter(Boolean).length,
        chars: extracted.text.length
      };

      setHistory(prev => prev.map(h => h.id === item.id ? updatedItem : h));
      if(!supabase) {
         let localH = getHistory().map(h => h.id === item.id ? updatedItem : h);
         localStorage.setItem("lexscan_history", JSON.stringify(localH));
      }
      setResult(updatedItem);
      showToast("OCR processado com sucesso!");
    } catch(err) {
      console.error(err);
      showToast("Erro ao processar OCR do item arquivado.", "error");
    } finally {
      setProcessing(false);
    }
  };

  const processFolderOCR = async () => {
    const docs = history.filter(h => 
       (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)
       && (!h.text || h.text.trim() === '' || getRealConfidence(h.text, h.confidence) <= 98)
    );
    
    if (docs.length === 0) {
       showToast("Todos os documentos já possuem OCR extraído ou confiança real >= 99%.", "info");
       return;
    }

    setTab("scanner");
    setProcessing(true);
    
    let processedCount = 0;

    for (let i = 0; i < docs.length; i++) {
        const item = docs[i];
        setProgress(0);
        setProgressMsg(`[${i + 1}/${docs.length}] Processando: ${item.name}...`);
        
        try {
          const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;
          const res = await fetch(urlToFetch);
          const blob = await res.blob();
          const fileToProcess = new File([blob], item.name, { type: item.type });
    
          let extracted;
          const onProgress = (p, msg) => { 
             setProgress(p); 
             setProgressMsg(`[${i + 1}/${docs.length}] ${msg || ""}`); 
          };
    
          window.lexscan_abort = false;

          if (fileToProcess.type === "application/pdf") {
            extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, true);
          } else {
            extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, true);
          }
    
          if (extracted && extracted.text) {
            extracted.text = optimizeRawText(extracted.text);
          }
          
          onProgress(90, "Atualizando banco de dados...");
          
          if (supabase) {
            await supabase.from("lexscan_documents").update({
              extracted_text: extracted.text,
              confidence: extracted.confidence,
              words_count: extracted.text.split(/\s+/).filter(Boolean).length,
              chars_count: extracted.text.length
            }).eq("id", item.id);
          }
    
          const updatedItem = {
            ...item,
            text: extracted.text,
            confidence: extracted.confidence,
            words: extracted.text.split(/\s+/).filter(Boolean).length,
            chars: extracted.text.length
          };
    
          setHistory(prev => prev.map(h => h.id === item.id ? updatedItem : h));
          if(!supabase) {
             let localH = getHistory().map(h => h.id === item.id ? updatedItem : h);
             localStorage.setItem("lexscan_history", JSON.stringify(localH));
          }
          processedCount++;
        } catch (e) {
          console.error(`Error on file ${item.name}`, e);
          showToast(`Erro ao processar: ${item.name}`, "error");
        }
    }
    
    setProcessing(false);
    setProgress(0);
    setProgressMsg("");
    setTab("history"); // Retorna para o histórico após processar todos
    showToast(`✓ Lote de OCR concluído! ${processedCount} documentos processados.`, "success");
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
      showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
    }
  };

  const handleRenameDocument = async () => {
    if (!renamingItem || !newDocumentName.trim()) {
      setRenamingItem(null);
      return;
    }
    
    // Maintain extension if not typed
    let finalExt = renamingItem.name.split('.').pop() || 'pdf';
    let rawInput = newDocumentName.trim();
    if (!rawInput.includes('.')) {
       rawInput = `${rawInput}.${finalExt}`;
    }

    try {
      showToast("Renomeando...");
      if (supabase) {
        await supabase.from('lexscan_documents').update({ name: rawInput }).eq('id', renamingItem.id);
      } else {
        throw new Error("Supabase não disponível");
      }
      setHistory(prev => prev.map(h => h.id === renamingItem.id ? { ...h, name: rawInput } : h));
      showToast("Renomeado com sucesso!");
    } catch(e) {
      showToast("Erro ao renomear", "error");
    } finally {
      setRenamingItem(null);
      setNewDocumentName("");
    }
  };

  const moveDocumentHandler = async (documentId, newClientId) => {
    if (!supabase) {
      showToast("Supabase não configurado", "error");
      return;
    }

    try {
      showToast("Movendo documento...");
      const { error } = await supabase
        .from('lexscan_documents')
        .update({ client_id: newClientId === 'unassigned' ? null : newClientId })
        .eq('id', documentId);

      if (error) throw error;

      setHistory(prev => prev.map(h => h.id === documentId ? { ...h, clientId: newClientId } : h));
      setMovingItem(null);
      showToast("✓ Documento movido com sucesso!");
    } catch (e) {
      console.error(e);
      showToast("Erro ao mover documento", "error");
    }
  };

  const deleteClientHandler = async (id, name) => {
    if(confirm(`Excluir a pasta do cliente "${name}" e todos os seus arquivos?`)) {
      if (supabase) {
        showToast("Excluindo...");
        await supabase.from('lexscan_clients').delete().eq('id', id);
        setClients(clients.filter(c => c.id !== id));
        setHistory(history.filter(h => h.clientId !== id));
        showToast("Pasta do cliente excluída do banco");
      } else {
        showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
      }
    }
  };

  const handleCreateClient = async () => {
    if(!newClientName.trim()) return;
    const isSubfolder = viewingClient !== null && viewingClient !== 'unassigned';
    const finalName = isSubfolder ? `${viewingClient}::${newClientName.trim()}` : newClientName.trim();
    
    setIsCreatingClient(false);
    setNewClientName("");
    
    if (supabase) {
      showToast("Criando pasta...");
      const { data, error } = await supabase.from('lexscan_clients').insert([{ name: finalName }]).select();
      if (error) {
        console.error("Supabase Error:", error);
        showToast("Erro DB: " + error.message, "error");
      } else if (data && data.length > 0) {
        setClients(prev => {
          let name = data[0].name;
          let parentId = null;
          if (name.includes('::')) {
             const parts = name.split('::');
             parentId = parts[0];
             name = parts.slice(1).join('::');
          }
          const nc = { id: data[0].id, name, parentId, ts: data[0].created_at, originalName: data[0].name };
          if (!parentId) {
            setSelectedClient(nc.id); // select it in drop down if it's a main folder
          }
          return [nc, ...prev];
        });
        showToast("Pasta criada no banco!");
      }
    } else {
      showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
    }
  };

  const compileFolderTXT = () => {
    const docs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
    
    // Clona e ordena usando Ordem Alfanumérica Natural (Natural Sort)
    // Isso garante que "Doc. 1", "Doc. 2", "Doc. 10", "Doc. 13" fiquem na ordem matemática e lógica,
    // independentemente de que horas foram escaneados ou inseridos.
    const sortedDocs = [...docs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    
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

  const downloadFolderPDFsZip = async () => {
    const docs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
    if (docs.length === 0) {
      showToast("Nenhum documento nesta pasta.", "info");
      return;
    }

    const folderName = viewingClient === 'unassigned' ? 'Geral' : clients.find(c => c.id === viewingClient)?.name || 'Pasta';
    showToast("Preparando download de todos os arquivos...");
    
    setTab("scanner");
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Iniciando compactação...");

    try {
      const zip = new JSZip();

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        setProgress(Math.round(((i) / docs.length) * 100));
        setProgressMsg(`[${i + 1}/${docs.length}] Buscando: ${doc.name}`);

        try {
          const urlToFetch = doc.fileUrl || doc.localBlobUrl || doc.preview;
          if (!urlToFetch) continue;

          const response = await fetch(urlToFetch);
          if (!response.ok) throw new Error("Falha no fetch");
          const blob = await response.blob();
          
          let entryName = doc.name;
          // Garantir extensão básica baseada no tipo se o nome não tiver
          if (!entryName.includes('.')) {
            if (blob.type === 'application/pdf') entryName += '.pdf';
            else if (blob.type === 'image/jpeg') entryName += '.jpg';
          }
          
          zip.file(entryName, blob);
        } catch (err) {
          console.error("Erro no ZIP item:", doc.name, err);
        }
      }

      setProgress(95);
      setProgressMsg("Gerando arquivo ZIP final...");
      const content = await zip.generateAsync({ type: "blob" });
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `DOCS_${folderName.replace(/\s+/g, '_')}_SCANNED.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast("Download ZIP concluído!", "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao gerar o download em massa.", "error");
    } finally {
      setProcessing(false);
      setProgress(0);
      setProgressMsg("");
    }
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
               ✂️ Cortar e Editar
            </h3>
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: '12px'}}>
              <button 
                onClick={rotateImage90}
                style={{ background: G.border, color: G.text, border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                🔄 Girar 90°
              </button>
            </div>
            <div style={{maxHeight: '55vh', overflow: 'auto', textAlign: 'center', background: '#000', borderRadius: '8px'}}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                <img ref={croppedImgRef} src={preview} alt="Crop" style={{maxHeight: '55vh', width: 'auto'}} />
              </ReactCrop>
            </div>
            <div className="modal-actions" style={{marginTop: 20}}>
              <button className="modal-btn cancel" style={{flex: 1}} onClick={skipCropAndAddPage}>Utilizar Imagem (Pular Corte)</button>
              <button className="modal-btn capture" style={{flex: 1}} onClick={applyCrop}>Salvar Edição na Página</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Compile Modal */}
      {isBatchModalOpen && (
        <div className="modal-overlay" style={{zIndex: 115}}>
          <div style={{background: G.card, padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '440px'}}>
            <h3 style={{marginBottom: 16, fontFamily: 'Playfair Display', color: G.accent, fontSize: '18px', textAlign: 'center'}}>
               📑 Documento: {cameraPages.length} página(s)
            </h3>
            
            <div style={{display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '8px'}}>
               {cameraPages.map((p, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div onClick={() => setViewingBatchPage(i)} style={{minWidth: '80px', height: '110px', background: G.bg, borderRadius: '8px', overflow: 'hidden', position: 'relative', border: `1px solid ${G.border}`, cursor: 'pointer'}}>
                      <img src={URL.createObjectURL(p)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                      <div style={{position: 'absolute', bottom: 2, right: 4, fontSize: '10px', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '2px 4px', borderRadius: '4px'}}>{i+1}</div>
                      <div className="hover-overlay" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.2s'}}>
                         <span style={{color: '#fff', fontSize: '20px'}}>👁️</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', width: '100%', justifyContent: 'space-between' }}>
                      <button 
                        disabled={i === 0} 
                        onClick={() => movePage(i, -1)} 
                        style={{ flex: 1, padding: '4px 0', background: G.surface, border: `1px solid ${G.border}`, color: i === 0 ? G.muted : G.text, borderRadius: '4px', fontSize: '12px', cursor: i === 0 ? 'not-allowed' : 'pointer' }}
                      >◀</button>
                      <button 
                        disabled={i === cameraPages.length - 1} 
                        onClick={() => movePage(i, 1)} 
                        style={{ flex: 1, padding: '4px 0', background: G.surface, border: `1px solid ${G.border}`, color: i === cameraPages.length - 1 ? G.muted : G.text, borderRadius: '4px', fontSize: '12px', cursor: i === cameraPages.length - 1 ? 'not-allowed' : 'pointer' }}
                      >▶</button>
                    </div>
                  </div>
               ))}
            </div>

            <div style={{marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
               <label style={{fontSize: '12px', color: G.muted}}>Renomear Arquivo PDF:</label>
               <input 
                 type="text" 
                 value={batchDocName}
                 onChange={e => setBatchDocName(e.target.value)}
                 style={{background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '12px', color: G.text, borderRadius: '8px', width: '100%', fontSize: '14px'}}
               />
               <small style={{fontSize: '10px', color: G.muted}}>Todas as fotos serão acopladas em um único PDF na nuvem sem OCR automático.</small>
            </div>

            <div style={{marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
               <label style={{fontSize: '12px', color: G.muted}}>Qualidade do PDF (Compressão):</label>
               <select 
                 value={pdfQuality} 
                 onChange={e => setPdfQuality(e.target.value)}
                 style={{background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '12px', color: G.text, borderRadius: '8px', width: '100%', fontSize: '14px', cursor: 'pointer'}}
               >
                 <option value="leve">Leve (Maior economia. Bom para CNHs - 800px)</option>
                 <option value="media">Média (Equilibrado. Ideal p/ Documentos e Textos - 1200px)</option>
                 <option value="alta">Alta (Maior qualidade, arquivos mais pesados - 1920px)</option>
               </select>
            </div>

            <div style={{marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
               <label style={{fontSize: '12px', color: G.muted}}>Salvar na Pasta do Cliente:</label>
               <select 
                 value={selectedClient} 
                 onChange={e => setSelectedClient(e.target.value)}
                 style={{background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '12px', color: G.text, borderRadius: '8px', width: '100%', fontSize: '14px', cursor: 'pointer'}}
               >
                 <option value="unassigned">Geral (Sem Pasta Específica)</option>
                 {clients.map(c => <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>)}
               </select>
            </div>

            <div className="modal-actions" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', gap: '8px'}}>
                <button 
                  className="modal-btn" 
                  style={{flex: 1, background: G.surface, color: G.text, border: `1px solid ${G.border}`, fontSize: '12px'}} 
                  onClick={() => { setIsBatchModalOpen(false); openCamera(); }}
                >
                  📸 Câmera
                </button>
                <button 
                  className="modal-btn" 
                  style={{flex: 1, background: G.surface, color: G.text, border: `1px solid ${G.border}`, fontSize: '12px'}} 
                  onClick={() => fileRefBatchImg.current.click()}
                >
                  🖼️ Arquivo
                </button>
              </div>
              <button className="modal-btn capture" onClick={compileCameraBatch}>✅ Finalizar e Salvar para a Pasta</button>
            </div>
          </div>
          
          <input ref={fileRefBatchImg} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleBatchImageAdd(e.target.files)} />

          {/* Viewing Single Page overlay */}
          {viewingBatchPage !== null && (
            <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 999, display: 'flex', flexDirection: 'column'}}>
              <div style={{display: 'flex', padding: '16px', justifyContent: 'space-between', alignItems: 'center'}}>
                 <button onClick={() => setViewingBatchPage(null)} style={{background: 'transparent', color: '#fff', border: 'none', fontSize: '16px', cursor: 'pointer'}}>← Voltar</button>
                 <button onClick={() => {
                   setCameraPages(prev => prev.filter((_, idx) => idx !== viewingBatchPage));
                   setViewingBatchPage(null);
                   if (cameraPages.length === 1) setIsBatchModalOpen(false); // fechar se for a última
                 }} style={{background: G.error, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}}>🗑️ Excluir Página</button>
              </div>
              <div style={{flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', overflow: 'hidden', position: 'relative'}}>
                 <img src={URL.createObjectURL(cameraPages[viewingBatchPage])} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px'}} />
                 
                 {/* Setinhas dentro do modal de visualização individual */}
                 <div style={{position: 'absolute', bottom: '30px', display: 'flex', gap: '30px'}}>
                     <button 
                        disabled={viewingBatchPage === 0} 
                        onClick={() => { movePage(viewingBatchPage, -1); setViewingBatchPage(viewingBatchPage - 1); }}
                        style={{background: viewingBatchPage === 0 ? '#444' : G.accent, color: '#000', padding: '12px 18px', borderRadius: '50%', border: 'none', cursor: viewingBatchPage === 0 ? 'not-allowed' : 'pointer', opacity: viewingBatchPage === 0 ? 0.4 : 1, fontSize: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}
                     >◀</button>
                     <button 
                        disabled={viewingBatchPage === cameraPages.length - 1} 
                        onClick={() => { movePage(viewingBatchPage, 1); setViewingBatchPage(viewingBatchPage + 1); }}
                        style={{background: viewingBatchPage === cameraPages.length - 1 ? '#444' : G.accent, color: '#000', padding: '12px 18px', borderRadius: '50%', border: 'none', cursor: viewingBatchPage === cameraPages.length - 1 ? 'not-allowed' : 'pointer', opacity: viewingBatchPage === cameraPages.length - 1 ? 0.4 : 1, fontSize: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}
                     >▶</button>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Move Document Modal */}
      {movingItem && (
        <div className="modal-overlay" style={{zIndex: 120}}>
          <div style={{background: G.card, padding: '20px', borderRadius: '16px', width: '90%', maxWidth: '380px'}}>
            <h3 style={{marginBottom: 12, fontSize: '16px', fontWeight: 600, color: G.accent, textAlign: 'center'}}>Mover Documento</h3>
            <p style={{fontSize: '12px', color: G.muted, marginBottom: '16px', textAlign: 'center'}}>
              Selecione o novo destino para: <br/> <strong>{movingItem.name}</strong>
            </p>
            
            <div style={{maxHeight: '40vh', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '20px'}}>
              <button 
                onClick={() => moveDocumentHandler(movingItem.id, 'unassigned')}
                style={{
                  padding: '12px', borderRadius: '10px', background: movingItem.clientId === 'unassigned' ? G.accent : G.surface, 
                  color: movingItem.clientId === 'unassigned' ? '#000' : G.text, border: `1px solid ${G.border}`, cursor: 'pointer', textAlign: 'left', fontSize: '13px'
                }}
              >
                📁 Geral (Sem pasta)
              </button>
              {clients.map(c => (
                <button 
                  key={c.id}
                  onClick={() => moveDocumentHandler(movingItem.id, c.id)}
                  style={{
                    padding: '12px', 
                    paddingLeft: c.parentId ? '32px' : '12px',
                    borderRadius: '10px', 
                    background: movingItem.clientId === c.id ? G.accent : G.surface, 
                    color: movingItem.clientId === c.id ? '#000' : G.text, 
                    border: `1px solid ${G.border}`, 
                    cursor: 'pointer', 
                    textAlign: 'left', 
                    fontSize: '13px'
                  }}
                >
                  {c.parentId ? '↳ 📂' : '📂'} {c.name}
                </button>
              ))}
            </div>

            <button className="modal-btn cancel" style={{width: '100%'}} onClick={() => setMovingItem(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="app">
        {/* Header */}
        <div className="header">
          <div className="header-top">
            <div className="logo">
              Scaner Felix e Castro
              <span>ADVOCACIA ESPECIALIZADA v1.0</span>
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

        {/* API STATUS DASHBOARD (DEMONSTRADOR) */}
        <div style={{ padding: '12px 20px', background: G.bg, borderBottom: `1px solid ${G.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '11px', color: G.muted, fontWeight: 600, letterSpacing: '0.05em' }}>STATUS DA INFRAESTRUTURA IA</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={() => {
                  if (confirm("Deseja realmente limpar/resetar o status e contadores de todas as chaves de API?")) {
                    localStorage.removeItem('lexscan_key_errors');
                    localStorage.removeItem('lexscan_key_usage');
                    setKeyErrors({});
                    setKeyUsage({});
                  }
                }}
                style={{
                  fontSize: '9px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
              >
                🔄 Resetar Status
              </button>
              <span style={{ fontSize: '10px', color: G.success, background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>Ativo</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {getAvailableGeminiKeys().map((key, idx) => {
              const hash = key.slice(-6);
              const usageCount = keyUsage[hash] || 0;
              const errorStatus = keyErrors[hash] || 'ok';
              
              const isOk = errorStatus === 'ok' || errorStatus === 'active';
              
              let badgeText = `${usageCount} ${usageCount === 1 ? 'requisito' : 'requisições'}`;
              let statusText = 'Status: Ok';
              let statusColor = G.muted;
              let cardBorder = G.border;
              let badgeColor = G.accent;

              if (errorStatus === 'quota_exceeded') {
                badgeText = 'ESGOTADA';
                statusText = 'Limite de uso diário atingido.';
                statusColor = '#ef4444';
                cardBorder = 'rgba(239, 68, 68, 0.6)';
                badgeColor = '#ef4444';
              } else if (errorStatus === 'blocked') {
                badgeText = 'BLOQUEADA';
                statusText = 'Chave suspensa / Denied Access.';
                statusColor = '#ef4444';
                cardBorder = 'rgba(239, 68, 68, 0.6)';
                badgeColor = '#ef4444';
              } else if (errorStatus === 'invalid') {
                badgeText = 'INVÁLIDA';
                statusText = 'Chave incorreta ou expirada.';
                statusColor = '#ef4444';
                cardBorder = 'rgba(239, 68, 68, 0.6)';
                badgeColor = '#ef4444';
              } else if (!isOk) {
                badgeText = 'FALHA';
                statusText = 'Erro detectado na requisição.';
                statusColor = '#ef4444';
                cardBorder = 'rgba(239, 68, 68, 0.6)';
                badgeColor = '#ef4444';
              }

              return (
                <div key={hash} style={{ 
                  background: G.surface, borderRadius: '10px', padding: '8px 10px', border: `1px solid ${cardBorder}`,
                  display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: G.text, fontWeight: 500 }}>API #{idx + 1} (..{hash})</span>
                    <span style={{ fontSize: '9px', color: badgeColor, fontWeight: '600' }}>{badgeText}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: statusColor, textAlign: 'left', marginTop: '2px' }}>{statusText}</div>
                </div>
              );
            })}
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
                    <span>{currentQueueIndex !== -1 ? `Processando Lote` : `Processando`}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar" style={{ width: progress + "%" }} />
                  </div>
                  <div className="progress-status">{progressMsg}</div>
                  {currentQueueIndex !== -1 && (
                    <div style={{ marginTop: 8, fontSize: '11px', color: G.muted, textAlign: 'center' }}>
                      Arquivo {currentQueueIndex + 1} de {queue.length}
                    </div>
                  )}
                  <button onClick={() => { window.lexscan_abort = true; }} style={{ marginTop: '14px', background: G.card, border: `1px solid ${G.border}`, borderRadius: '8px', padding: '10px 16px', color: G.text, cursor: 'pointer', fontSize: '13px', width: '100%', fontWeight: 500, transition: 'all 0.2s', ':hover': { borderColor: G.accent } }}>
                     ⏹ Pausar / Salvar Progresso Atual
                  </button>
                </div>
              )}

              {/* Select Folder area if not processing and not result */}
              {(file || queue.length > 0) && !result && !processing && (
                <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {file && file.type === "application/pdf" && queue.length === 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: G.muted, marginBottom: '6px' }}>Página Inicial do PDF (Para continuar de onde parou):</label>
                      <input 
                         type="number" min="1" 
                         value={startPage} 
                         onChange={(e) => setStartPage(e.target.value)} 
                         style={{
                           width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${G.border}`,
                           background: G.surface, color: G.text, outline: 'none', fontFamily: 'DM Sans', fontSize: '14px'
                         }}
                      />
                    </div>
                  )}
                  
                  <div>
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
                        <option key={c.id} value={c.id}>{c.parentId ? '↳ ' : ''}{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* MODO DE EXTRAÇÃO (Comum para Único ou Lote) */}
              {(file || queue.length > 0) && !result && !processing && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
                  background: G.surface, padding: '12px 14px', borderRadius: '12px', border: `1px solid ${G.border}`
                }}>
                  <input type="checkbox" checked={aiMode} onChange={(e) => setAiMode(e.target.checked)} id="ai-mode" 
                    style={{ accentColor: G.accent, width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                  <label htmlFor="ai-mode" style={{ fontSize: '13px', color: G.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
                    <span style={{ fontWeight: 600, color: G.accent }}>
                      Motor Híbrido Inteligente (Recomendado)
                      <span style={{ background: '#2d3340', color: G.success, padding: '2px 8px', borderRadius: '12px', fontSize: '10px', marginLeft: '8px', border: `1px solid ${G.success}40` }}>
                         🟢 {getAvailableGeminiKeys().length} {getAvailableGeminiKeys().length === 1 ? 'API Disponível' : 'APIs Disponíveis'}
                      </span>
                    </span>
                    <span style={{ fontSize: '11px', color: G.muted }}>Faz Roteamento Inteligente com Auto-Failover: Extrai texto perfeito e aciona as APIs ativas sequencialmente em manuscritos.</span>
                  </label>
                </div>
              )}

              {queue.length > 0 && !result && !processing && (
                 <div style={{ textAlign: 'center', background: G.card, padding: '20px', borderRadius: '16px', border: `1px solid ${G.border}`, marginBottom: '14px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>Lote de {queue.length} arquivos</div>
                    <div style={{ fontSize: '12px', color: G.muted, marginBottom: '16px' }}>Os arquivos abaixo serão processados sequencialmente</div>
                    
                    <button className="process-btn" onClick={processBatch} style={{ background: G.accent, color: '#000' }}>
                      {aiMode ? "🧠 Iniciar Lote com IA Jurídica" : "🔍 Iniciar Lote (Texto Bruto)"}
                    </button>
                    
                    <button className="process-btn" onClick={uploadBatchWithoutOCR} style={{ background: G.surface, color: G.text, border: `1px solid ${G.border}`, marginTop: '8px' }}>
                      ☁️ Apenas Salvar na Pasta (Sem OCR)
                    </button>

                    <div style={{ maxHeight: '100px', overflowY: 'auto', background: G.bg, padding: '10px', borderRadius: '10px', marginTop: '16px', textAlign: 'left', border: `1px solid ${G.border}` }}>
                      {queue.map((q, i) => (
                        <div key={i} style={{ fontSize: '11px', color: G.text, padding: '4px 0', borderBottom: i < queue.length - 1 ? `1px solid ${G.border}` : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {i + 1}. {q.name}
                        </div>
                      ))}
                    </div>

                    <button onClick={() => setQueue([])} style={{ marginTop: '12px', background: 'none', border: 'none', color: G.error, fontSize: '12px', cursor: 'pointer' }}>
                      Cancelar Lote
                    </button>
                 </div>
              )}

              {/* Process button */}
              {file && !result && !processing && (
                <>
                  <button className="process-btn" onClick={process}>
                    {aiMode ? "🧠 Extrair Inteligente" : "🔍 Extrair Texto (Bruto)"}
                  </button>
                  <button className="process-btn" onClick={saveWithoutOCR} style={{ background: G.surface, color: G.text, border: `1px solid ${G.border}`, marginTop: '8px' }}>
                    ☁️ Apenas Salvar na Pasta (Sem OCR)
                  </button>
                </>
              )}

              {/* Result */}
              {result && (
                <>
                  <div className="result-card">
                    <div className="result-header">
                      <span className="result-title">Texto Extraído</span>
                      <span className="result-meta">{result.words} palavras · {result.chars} chars · Suporte Ilimitado (+500k)</span>
                    </div>

                    {/* Alerta inteligente de páginas puladas ou com erro */}
                    {(() => {
                      const failedPages = [];
                      const text = result.text || "";
                      const regex1 = /\[ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
                      let match;
                      while ((match = regex1.exec(text)) !== null) {
                        failedPages.push(parseInt(match[1], 10));
                      }
                      const regex2 = /\[P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO\s+\(FALHA\s+IA/gi;
                      while ((match = regex2.exec(text)) !== null) {
                        failedPages.push(parseInt(match[1], 10));
                      }
                      const pagesToProcess = [...new Set(failedPages)].sort((a, b) => a - b);
                      
                      if (pagesToProcess.length === 0) return null;
                      
                      return (
                        <div 
                          style={{
                            margin: '8px 0 16px 0',
                            padding: '12px 14px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '12px', fontWeight: 600 }}>
                            <span style={{ fontSize: '16px' }}>⚠️</span>
                            <span>Atenção: Página(s) com erro ou pulada(s) detectada(s)!</span>
                          </div>
                          <p style={{ fontSize: '11px', color: G.text, opacity: 0.85, lineHeight: '1.4' }}>
                            Página(s) afetada(s): <strong style={{ color: G.accent }}>{pagesToProcess.join(', ')}</strong>. 
                            Você não precisa reprocessar o documento inteiro! Use nosso reparo cirúrgico "Padrão Ouro" para ler apenas essas páginas e inseri-las no local correto.
                          </p>
                          <button
                            onClick={() => recoverFailedPages(result)}
                            disabled={processing}
                            style={{
                              alignSelf: 'flex-start',
                              background: G.accent,
                              color: '#0d0f14',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                            onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
                          >
                            <span>🪄</span> Recuperar Páginas Falhas / Puladas
                          </button>
                        </div>
                      );
                    })()}

                    <div className="result-text">{result.text || "(nenhum texto reconhecido)"}</div>
                    <div className="confidence-bar">
                      <span>Confiança OCR</span>
                      <div className="conf-fill">
                        <div className="conf-inner" style={{ width: getRealConfidence(result.text, result.confidence) + "%", background: confColor(getRealConfidence(result.text, result.confidence)) }} />
                      </div>
                      <span style={{ color: confColor(getRealConfidence(result.text, result.confidence)) }}>{getRealConfidence(result.text, result.confidence)}%</span>
                    </div>
                    <div className="result-actions">
                      <button className="dl-btn" onClick={() => downloadTXT(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                        📝 .TXT
                      </button>
                      <button className="dl-btn primary" onClick={() => downloadPDF(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                        📄 Exportar OCR (PDF)
                      </button>
                      {(result.fileUrl || result.localBlobUrl) && (
                         <button 
                           onClick={(e) => { e.preventDefault(); forceDownload(result.fileUrl || result.localBlobUrl, result.name); }}
                           className="dl-btn" 
                           style={{ background: G.success, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         >
                           ⬇️ Baixar Original 
                         </button>
                      )}
                      <button className="dl-btn" onClick={() => setMovingItem(result)} style={{ background: G.surface, border: `1px solid ${G.border}`, color: G.text }}>
                        📂 Mover Pasta
                      </button>
                    </div>

                    {file && file.type.startsWith('image/') && (
                      <div style={{ marginTop: '12px', padding: '12px', background: G.bg, borderRadius: '12px', border: `1px solid ${G.border}` }}>
                         <div style={{ fontSize: '11px', color: G.muted, marginBottom: '8px', textAlign: 'center' }}>⚙️ OPÇÕES DE COMPRESSÃO (ECONOMIA DE ESPAÇO)</div>
                         <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => handleCompressAndDownload(result, 'Pouca')} style={{ flex: 1, fontSize: '10px', padding: '6px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer' }}>Leve</button>
                            <button onClick={() => handleCompressAndDownload(result, 'Média')} style={{ flex: 1, fontSize: '10px', padding: '6px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer' }}>Média</button>
                            <button onClick={() => handleCompressAndDownload(result, 'Máxima')} style={{ flex: 1, fontSize: '10px', padding: '6px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer' }}>Máxima</button>
                         </div>
                      </div>
                    )}
                  </div>
                  <button className="cam-btn" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
                    ＋ Novo documento
                  </button>
                </>
              )}

              <input ref={fileRefImg} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => handleFiles(e.target.files)} />
              <input ref={fileRefPdf} type="file" accept="application/pdf" multiple style={{ display: "none" }}
                onChange={e => handleFiles(e.target.files)} />
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

                    {clients.filter(c => !c.parentId).map(c => {
                      const docsCount = history.filter(h => h.clientId === c.id).length;
                      const subfoldersCount = clients.filter(sub => sub.parentId === c.id).length;
                      return (
                        <div 
                          key={c.id}
                          className="folder-card"
                          onClick={() => setViewingClient(c.id)}
                          style={{ background: G.card, padding: '16px', borderRadius: '12px', border: `1px solid ${G.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .2s' }}
                        >
                          <div style={{ fontSize: '24px' }}>📂</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500, color: G.text }}>{c.name}</div>
                            <div style={{ fontSize: '12px', color: G.muted }}>
                              {docsCount} documentos {subfoldersCount > 0 ? `• ${subfoldersCount} subpasta${subfoldersCount>1?'s':''}` : ''}
                            </div>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: G.surface, padding: '16px', borderRadius: '16px', border: `1px solid ${G.border}`, marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <button 
                        onClick={() => {
                          const currentClient = clients.find(c => c.id === viewingClient);
                          setViewingClient(currentClient?.parentId || null);
                        }}
                        style={{ background: G.card, border: `1px solid ${G.border}`, color: G.muted, cursor: 'pointer', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <span>←</span> Voltar
                      </button>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: G.accent, flex: 1 }}>
                        {viewingClient === 'unassigned' ? "Geral (Sem pasta)" : clients.find(c => c.id === viewingClient)?.name}
                      </h3>
                      {viewingClient !== 'unassigned' && (
                        <button 
                          onClick={() => setIsCreatingClient(true)}
                          style={{ background: G.accent, color: '#000', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                        >
                          + Nova Subpasta
                        </button>
                      )}
                    </div>

                    {isCreatingClient && viewingClient !== 'unassigned' && (
                      <div style={{ background: G.card, padding: '16px', borderRadius: '12px', marginBottom: '16px', border: `1px solid ${G.border}` }}>
                        <input 
                          type="text" 
                          autoFocus
                          placeholder="Nome da Subpasta..."
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
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '10px', color: G.muted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Organizar por:</label>
                        <select 
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value)}
                          style={{ width: '100%', background: G.bg, color: G.text, border: `1px solid ${G.border}`, padding: '8px', borderRadius: '8px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="date-desc">🕒 Mais Recentes</option>
                          <option value="date-asc">🕒 Mais Antigos</option>
                          <option value="name-asc">🔤 Nome (1, 2, 10...)</option>
                          <option value="name-desc">🔤 Nome (Z-A)</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                        {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length > 0 && (
                          <button 
                            onClick={processFolderOCR}
                            style={{ background: G.accent, color: '#000', border: 'none', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            title="Gerar OCR para documentos sem texto ou falhos"
                          >
                            <span>🧠</span> Lote de OCR
                          </button>
                        )}
                        {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length > 0 && (
                          <button 
                            onClick={compileFolderTXT}
                            style={{ background: G.surface, color: G.text, border: `1px solid ${G.border}`, padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            title="Baixar Texto Compilado de toda a pasta"
                          >
                            <span>📑</span> Compilar
                          </button>
                        )}
                        {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length > 0 && (
                          <button 
                            onClick={downloadFolderPDFsZip}
                            style={{ background: G.success, color: '#fff', border: 'none', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            title="Baixar todos os arquivos originais em um ZIP"
                          >
                            <span>📦</span> Download Todos
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {clients.filter(c => c.parentId === viewingClient).length > 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: G.muted, padding: '0 8px', marginBottom: '8px', textTransform: 'uppercase' }}>Subpastas</div>
                      <div className="folders-grid" style={{ display: 'grid', gap: '8px' }}>
                        {clients.filter(c => c.parentId === viewingClient).map(c => {
                          const docsCount = history.filter(h => h.clientId === c.id).length;
                          const subfoldersCount = clients.filter(sub => sub.parentId === c.id).length;
                          return (
                            <div 
                              key={c.id}
                              className="folder-card"
                              onClick={() => setViewingClient(c.id)}
                              style={{ background: G.card, padding: '12px', borderRadius: '12px', border: `1px solid ${G.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .2s' }}
                            >
                              <div style={{ fontSize: '20px' }}>📂</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, color: G.text, fontSize: '14px' }}>{c.name}</div>
                                <div style={{ fontSize: '11px', color: G.muted }}>
                                  {docsCount} documentos {subfoldersCount > 0 ? `• ${subfoldersCount} subpasta${subfoldersCount>1?'s':''}` : ''}
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteClientHandler(c.id, c.name); }}
                                style={{ background: 'none', border: 'none', color: G.error, cursor: 'pointer', padding: '4px', fontSize: '14px' }}
                              >🗑</button>
                              <div style={{ color: G.muted, fontSize: '14px' }}>→</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length === 0 ? (
                    <div className="history-empty">
                      <div className="history-empty-icon">📭</div>
                      <p>{clients.filter(c => c.parentId === viewingClient).length > 0 ? "Pasta não possui arquivos (apenas subpastas)." : "Pasta vazia."}</p>
                    </div>
                  ) : (
                    history
                      .filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient))
                      .sort((a, b) => {
                        if (sortOrder === "date-desc") return new Date(b.ts).getTime() - new Date(a.ts).getTime();
                        if (sortOrder === "date-asc") return new Date(a.ts).getTime() - new Date(b.ts).getTime();
                        if (sortOrder === "name-asc") return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                        if (sortOrder === "name-desc") return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
                        return 0;
                      })
                      .map(item => (
                      <div key={item.id} className="hist-card" onClick={() => loadFromHistory(item)}>
                        <div className="hist-header">
                          {item.preview && item.type && item.type.startsWith("image/")
                            ? <img src={item.preview} alt="" className="hist-thumb" />
                            : <div className="hist-thumb-placeholder" style={{ 
                                background: (item.type && item.type.includes('pdf')) || item.name.toLowerCase().endsWith('.pdf') ? 'rgba(239, 68, 68, 0.08)' : `${G.bg}`, 
                                borderColor: (item.type && item.type.includes('pdf')) || item.name.toLowerCase().endsWith('.pdf') ? 'rgba(239, 68, 68, 0.25)' : `${G.border}`,
                                color: (item.type && item.type.includes('pdf')) || item.name.toLowerCase().endsWith('.pdf') ? '#ef4444' : `${G.text}`,
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                {(item.type && item.type.includes('pdf')) || item.name.toLowerCase().endsWith('.pdf') ? 'PDF' : '📄'}
                              </div>
                          }
                          <div className="hist-info">
                            {renamingItem?.id === item.id ? (
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', width: '100%' }}>
                                <input 
                                  autoFocus
                                  type="text" 
                                  value={newDocumentName}
                                  onChange={e => setNewDocumentName(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleRenameDocument()}
                                  style={{ background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '4px 8px', borderRadius: '4px', color: G.text, width: '100%', fontSize: '12px' }}
                                />
                                <button onClick={handleRenameDocument} style={{ background: G.success, border: 'none', borderRadius: '4px', padding: '4px 8px', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>Salvar</button>
                                <button onClick={() => setRenamingItem(null)} style={{ background: 'transparent', border: `1px solid ${G.border}`, borderRadius: '4px', padding: '4px 8px', color: G.text, cursor: 'pointer', fontSize: '10px' }}>Cancelar</button>
                              </div>
                            ) : (
                              <div className="hist-name">
                                 <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1}}>{item.name}</span>
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); setRenamingItem(item); setNewDocumentName(item.name.replace(/\.[^/.]+$/, "")); }}
                                   style={{ padding: '4px', marginLeft: '4px', background: 'transparent', border: 'none', color: G.muted, cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
                                   title="Renomear"
                                 >
                                   ✏️
                                 </button>
                              </div>
                            )}
                            <div className="hist-date">{formatDate(item.ts)}</div>
                            <div className="hist-chars">{item.words} palavras · {getRealConfidence(item.text, item.confidence)}% OCR</div>

                            {/* Alerta inteligente de páginas puladas e botão de reparação automática */}
                            {(() => {
                              const text = item.text || "";
                              const failedPages = [];
                              const r1 = /\[ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
                              let m;
                              while ((m = r1.exec(text)) !== null) {
                                failedPages.push(parseInt(m[1], 10));
                              }
                              const r2 = /\[P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO\s+\(FALHA\s+IA/gi;
                              while ((m = r2.exec(text)) !== null) {
                                failedPages.push(parseInt(m[1], 10));
                              }
                              const uniqFailed = [...new Set(failedPages)].sort((a, b) => a - b);
                              if (uniqFailed.length > 0) {
                                return (
                                  <div 
                                    style={{ 
                                      display: 'flex', 
                                      flexDirection: 'column',
                                      gap: '5px',
                                      marginTop: '8px', 
                                      padding: '8px 10px', 
                                      background: 'rgba(239, 68, 68, 0.08)', 
                                      border: '1px solid rgba(239, 68, 68, 0.22)', 
                                      borderRadius: '8px',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', fontSize: '10px', fontWeight: 'bold' }}>
                                      <span>⚠️</span> <span>Pág(s) pulada(s): {uniqFailed.join(', ')}</span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        loadFromHistory(item);
                                        // Executa a recuperação automática ao transicionar de aba!
                                        setTimeout(() => {
                                          const btn = document.querySelector(".result-card button"); 
                                          if (btn) (btn as HTMLButtonElement).click();
                                        }, 450);
                                      }}
                                      style={{
                                        alignSelf: 'flex-start',
                                        background: G.accent,
                                        color: '#0d0f14',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '9px',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        marginTop: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'opacity 0.2s',
                                      }}
                                      onMouseOver={(ev) => { ev.currentTarget.style.opacity = '0.9'; }}
                                      onMouseOut={(ev) => { ev.currentTarget.style.opacity = '1'; }}
                                    >
                                      <span>🪄</span> Reparar Páginas
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="hist-actions">
                            {item.type && item.type.startsWith('image/') && (
                               <button className="icon-btn" title="Comprimir (Média)" onClick={(e) => { e.stopPropagation(); handleCompressAndDownload(item, 'Média'); }}>📉</button>
                            )}
                            <button className="icon-btn" title="Mover Pasta" onClick={(e) => { e.stopPropagation(); setMovingItem(item); }}>📂</button>
                            {(item.fileUrl || item.localBlobUrl) && (
                               <button onClick={(e) => { e.stopPropagation(); forceDownload(item.fileUrl || item.localBlobUrl, item.name); }} className="icon-btn" title="Baixar Original" style={{border: 'none', background: 'transparent', cursor: 'pointer', padding: 0}}>⬇️</button>
                            )}
                            {/* Botão de Refazer OCR (Sempre disponível para correção manual) */}
                            <button 
                              className="icon-btn" 
                              style={{
                                background: (!item.text || getRealConfidence(item.text, item.confidence) === 0) ? G.accent : 'transparent', 
                                color: (!item.text || getRealConfidence(item.text, item.confidence) === 0) ? '#000' : G.muted,
                                border: (!item.text || getRealConfidence(item.text, item.confidence) === 0) ? 'none' : `1px solid ${G.border}`,
                                fontWeight: 'bold'
                              }} 
                              title="Refazer OCR via IA Jurídica (Correção)" 
                              onClick={(e) => { e.stopPropagation(); processHistoryItem(item); }}
                            >
                              {(!item.text || getRealConfidence(item.text, item.confidence) === 0) ? '🔍 OCR' : '🔄'}
                            </button>

                            {item.text && (
                               <>
                                 <button className="icon-btn" title="Abrir Extração" onClick={() => loadFromHistory(item)}>↗</button>
                                 <button className="icon-btn" title="Baixar TXT" onClick={() => downloadTXT(item.text, item.name.replace(/\.[^.]+$/, ""))}>📝</button>
                               </>
                            )}
                            <button className="icon-btn danger" title="Remover" onClick={() => deleteFromHistory(item.id)}>🗑</button>
                          </div>
                        </div>
                        <div className="hist-preview">{item.text.slice(0, 120)}...</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
