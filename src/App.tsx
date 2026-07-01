// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { GoogleGenAI } from "@google/genai";

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
    flex-wrap: wrap;
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

async function forceDownload(url, filename, supabaseContext = null) {
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
      i.onerror = () => { URL.revokeObjectURL(url); res(null); };
      i.src = url;
    });
    if (!img) return imageBlob;

    const canvas = document.createElement("canvas");
    let { width, height } = img;
    
    // Resize adaptativo para não explodir tokens e acelerar a base64 (Max 1600px na maior dimensão)
    const MAX_DIMENSION = 1600;
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
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Filtro profissional inteligente...
      ctx.filter = 'contrast(120%) brightness(102%) saturate(110%)';
      ctx.drawImage(img, 0, 0, width, height);
    }
    const resBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85)); // 0.85 para mais velocidade sem perda grave de IA
    canvas.width = 0; canvas.height = 0;
    return resBlob || imageBlob;
  } catch (e) {
    console.warn("Falha ao otimizar imagem para a IA, usando original:", e);
    return imageBlob;
  }
}

// ── Extrai texto de PDF e Imagem (Sistema Híbrido) ──────────────────────────
async function extractPageWithGemini(blob, onProgress, goldStandard = true) {
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
  
  const prompt = `Você é o Transcritor e Reconstituidor de Documentos Jurídicos Oficial de Elite (PADRÃO GOD / PADRÃO OURO) do escritório Felix & Castro Advocacia. Sua missão de altíssima relevância e responsabilidade é produzir uma transcrição 100% IDÊNTICA, VERBATIM E LITERAL de todas as páginas do documento fornecido.

Nenhuma palavra, número, sigla, cabeçalho, rodapé, CNPJ, nota marginal, data ou elemento de tabela do documento original deve ser omitido, ignorado, filtrado ou resumido. Qualquer desvio ou omissão comprometerá a integridade do processo judicial.

Este documento será analisado por sistemas internos e pelo poder judiciário, portanto o texto gerado precisa ser EXATAMENTE igual ao PDF.

══════════════════════════════════════════════════
REGRAS ABSOLUTAS DE TRANSCRIÇÃO (PADRÃO OURO)
══════════════════════════════════════════════════

1. TRANSCRIÇÃO INTEGRAL E LITERAL: 
   - Transcreva TODO e qualquer texto visível na imagem, exatamente na ordem em que aparece, de cima para baixo.
   - NÃO ignore cabeçalhos institucionais, logotipos descritos por extenso, brasões, rodapés, números de página, notas marginais, selos, marcas d'água, assinaturas, certidões ou termos formais do Diário Oficial.
   - Se o diário oficial ou documento contiver certidões, portarias de aposentadoria de terceiros, exonerações, atos ou decisões, transcreva TUDO do início ao fim da página sem omitir nada.
   - NÃO faça resumos, sinopses ou simplificações ("extrair apenas o que o advogado precisa" está PROIBIDO). O advogado precisa do texto INTEGRAL exatamente como está no original.

2. PRESERVAÇÃO DE TABELAS E COLUNAS (DIÁRIO OFICIAL / CNIS / HOLERITES):
   - Se o documento contiver dados tabulares (como listas de trâmites, tabelas financeiras, CNIS, holerites, faturas, folhas de ponto ou portarias de Diários Oficiais organizada em colunas):
     - Reconstitua a tabela fielmente em tabelas Markdown para manter a estrutura original perfeitamente legível e idêntica para o judiciário.
     - Se o documento tiver múltiplas colunas de texto (como em Diários Oficiais), leia as colunas na ordem lógica correta (coluna 1 completa, depois coluna 2, por exemplo, ou preserve a divisão lógica correta das portarias). Nunca misture o texto de colunas paralelas.

3. ZERO OMISSÃO E ZERO ALUCINAÇÃO:
   - Jamais invente ou modifique nomes, números, CPFs, datas ou valores.
   - Para caracteres de fato ilegíveis por rasuras ou má qualidade extrema do scanner, use '[ILEGÍVEL]'.
   - Para caligrafias médicas ou manuscritos complexos, esforce-se ao limite máximo para transcrever palavra por palavra com exatidão, deduzindo pelo contexto clínico quando possível, evitando o uso fácil de '[ILEGÍVEL]'.

4. TRATAMENTO DE ASSINATURAS, RUBRICAS E ELEMENTOS VISUAIS:
   - Nunca use [ILEGÍVEL] para assinaturas ou rubricas.
   - Se houver assinatura visível, transcreva como: [Assinatura Manuscrita: Nome] ou [Assinatura Digital Detectada].
   - Se houver fotos/selfies de validação biométrica, transcreva apenas como [Foto de Validação Biométrica]. Evite descrever pessoas ou cenários.

5. PÁGINAS VAZIAS E ESPAÇOS EM BRANCO (CRÍTICO):
   - NUNCA, em hipótese alguma, preencha espaços visuais vazios ou entrelinhas com "&nbsp;".
   - NÃO tente "desenhar" a formatação visual do documento usando espaços e quebras de linha excessivas.
   - Se uma página estiver em branco ou contiver apenas elementos gráficos decorativos e notas de rodapé, transcreva apenas o rodapé e encerre a página imediatamente. Jamais crie loops infinitos de textos vazios.

6. ESTRUTURAÇÃO DE SAÍDA:
   - No início de sua resposta, forneça os metadados identificados do documento para controle:
     - TÍTULO: [Título principal exato, ex: PORTARIA Nº 198/2026-MD ou DIÁRIO OFICIAL DA CIDADE DE SÃO JOÃO DE MERITI]
     - TIPO: [Classificação precisa do documento]
     - ÁREA: [Previdenciário / Trabalhista / Consumidor / Cível / Múltiplas]
     - OBS: [Observações importantes se houver, ou omita]
   - Em seguida, insira obrigatoriamente uma linha divisória: ══════════════════════════════════════════════════
   - E então forneça a **TRANSCRIÇÃO LITERAL E INTEGRAL DO TEXTO DO DOCUMENTO**:
     (Insira aqui o texto integral e literal da imagem, sem cortes, sem omissões e sem resumos, com tabelas em markdown completas).`;

  // Lista de modelos do Google em ordem de preferência para o sistema jurídico
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3.5-flash"];

  // Matriz de Auto-Failover Duplo: Roda as Chaves Híbridas cruzando com Modelos!
  for (let i = 0; i < finalSortedKeys.length; i++) {
    const apiKey = finalSortedKeys[i];
    const keyHash = apiKey.slice(-6);
    
    for (let m = 0; m < modelsToTry.length; m++) {
      const modelName = modelsToTry[m];
      try {
        console.log(`[Auto-Failover Matrix] Chave ${i + 1}/${finalSortedKeys.length} (..${keyHash}) | Tentando modelo: ${modelName}`);
        const ai = new GoogleGenAI({ apiKey });
        
        // 120-second timeout para modelos avançados que demoram mais para processar OCR de alta densidade
        const fetchPromise = (async () => {
          const responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: {
              parts: [
                { text: "Leia a imagem e realize a transcrição literal, verbatim, 100% integral sob a orientação do Transcritor de Elite configurado no sistema." },
                { inlineData: { data: base64, mimeType: blob.type } }
              ]
            },
            config: {
              systemInstruction: prompt,
              temperature: 0.1,
            }
          });

          let fullText = "";
          let chunksReceived = 0;
          
          for await (const chunk of responseStream) {
            fullText += chunk.text;
            chunksReceived++;
            if (onProgress) {
              const fakePercent = Math.min(95, 70 + (chunksReceived * 2)); 
              onProgress(fakePercent, `IA Lendo e Transcrevendo... (Gerado ${chunksReceived} fragmentos)`);
            }
          }
          return fullText;
        })();

        let fullText;
        try {
          fullText = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: A API do Gemini demorou muito para responder (120s).")), 120000))
          ]);
        } catch (fetchErr) {
          throw fetchErr;
        }

        // Registrar sucesso no uso da chave para o dashboard
        if (window.updateKeyUsage) window.updateKeyUsage(keyHash);

        return fullText.trim();
        
      } catch (e) {
        console.warn(`[Matriz Falha] Chave ${i + 1} (..${keyHash}) - Modelo ${modelName}:`, e.message || e);
        lastError = e;
        
        const errorStr = (e.message || "").toLowerCase();
        
        // Identificar tipo exato do erro para atualizar o dashboard
        let errorType = null;
        if (errorStr.includes("403") || errorStr.includes("denied") || errorStr.includes("forbidden") || errorStr.includes("permission")) {
          errorType = 'blocked'; 
        } else if (errorStr.includes("api key not valid") || errorStr.includes("api_key_invalid") || errorStr.includes("key is invalid")) {
          errorType = 'invalid';
        } else if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("exhausted") || errorStr.includes("rate limit")) {
          errorType = 'quota_exceeded';
          // Espera 5 segundos se bater na cota antes de tentar a próxima chave/modelo (RPM de 15 por min requer pausas)
          console.warn(`⏳ Rate limit atingido. Pausando 5s para proteção...`);
          await new Promise(r => setTimeout(r, 5000)); 
        } else if (errorStr.includes("503") || errorStr.includes("500") || errorStr.includes("404") || errorStr.includes("400") || errorStr.includes("unavailable") || errorStr.includes("not found") || errorStr.includes("timeout")) {
          errorType = 'server_error';
        } else {
          errorType = 'error';
        }

        console.warn(`👉 [Auto-Failover] Chave ${i + 1} (..${keyHash}) falhou com tipo (${errorType}).`);
        
        // MARCAMOS A CHAVE APENAS SE FOR ERRO PERMANENTE (Inválida ou Bloqueada) ou se estourar cota total repetidamente
        // Para cota temporária ou erro 503 de servidor, não queremos "banir" a chave do dashboard para sempre.
        if (errorType === 'blocked' || errorType === 'invalid' || errorType === 'error') {
           if (window.setKeyError) window.setKeyError(keyHash, errorType);
        } else if (errorType === 'quota_exceeded') {
           // Marca visualmente como cota mas não banida no loop ativo (pode ser temporaria)
           if (window.setKeyError) window.setKeyError(keyHash, 'quota_exceeded');
        } else if (errorType === 'server_error') {
           // Erro nos servidores do Google, mantemos a chave ativa
           if (window.setKeyError) window.setKeyError(keyHash, 'active');
        }
        
        // Se for erro de servidor, pode ser apenas no "modelo" específico. Tentar o próximo modelo.
        if (errorType === 'server_error') {
          console.warn(`⏳ Falha temporária da API (503/Timeout). Tentando próximo modelo com a mesma chave...`);
          continue; 
        }

        break; // Sai do loop "m" (modelos) e vai pro loop "i" (próxima chave) para cota ou chave inválida
      }
    }
  }

  // Se esgotar tudo (Todos Modelos x Todas Chaves)
  throw new Error("❌ Esgotamento Total: " + (lastError?.message || "Servidores do Google indisponíveis."));
}

// Auxiliar para detectar se um texto extraído nativamente é de fato conteúdo digital legítimo
function isGenuineDigitalText(text: string): boolean {
  if (!text) return false;
  const cleaned = text.trim();
  if (cleaned.length < 100) return false;
  
  // Conta caracteres alfabéticos em português/inglês
  const letters = (cleaned.match(/[a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g) || []).length;
  if (letters / cleaned.length < 0.4) {
    // Se menos de 40% do texto são letras normais, pode ser lixo de OCR ou tabelas vazias
    return false;
  }

  // Verifica se possui pelo menos 10 palavras com 3+ caracteres para garantir que não são silabas quebradas
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
  if (words.length < 10) return false;

  return true;
}

function getRealConfidence(text, fallbackConfidence) {
  if (!text || typeof text !== 'string') return fallbackConfidence || 0;
  
  const textLower = text.toLowerCase();
  const lines = text.split('\n');
  const pageConfidences: { [key: number]: number } = {};
  let hasStructuredTags = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Detecção de erro crítico na página
      const errMatch = trimmed.match(/\[(?:ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA|ERRO\s+CR[ÍI]TICO\s+NA\s+PAGINA)\s+(\d+)\b[^\]]*\]/i);
      if (errMatch) {
        const pageNum = parseInt(errMatch[1], 10);
        pageConfidences[pageNum] = 0;
        hasStructuredTags = true;
        continue;
      }

      // Detecção de página com conteúdo
      const pMatch = trimmed.match(/\[(?:P[ÁA]GINA|PAGINA)\s+(\d+)\s*-\s*([^\]]+)\]/i);
      if (pMatch) {
        const pageNum = parseInt(pMatch[1], 10);
        const tagContent = pMatch[2].toLowerCase();
        hasStructuredTags = true;
        
        if (tagContent.includes('texto digital nativo') || tagContent.includes('digital nativo')) {
          pageConfidences[pageNum] = 100;
        } else if (tagContent.includes('ia jurídica') || tagContent.includes('ia juridica') || tagContent.includes('recuperado via ia')) {
          pageConfidences[pageNum] = 99;
        } else if (tagContent.includes('ocr bruto') || tagContent.includes('ocr local')) {
          const pctMatch = tagContent.match(/(\d+)%/);
          if (pctMatch) {
            pageConfidences[pageNum] = parseInt(pctMatch[1], 10);
          } else {
            pageConfidences[pageNum] = 75;
          }
        } else {
          pageConfidences[pageNum] = fallbackConfidence || 90;
        }
      }
    }
  }

  if (hasStructuredTags) {
    const pages = Object.keys(pageConfidences);
    if (pages.length > 0) {
      let total = 0;
      let count = 0;
      const ilegivelCount = (textLower.match(/ileg[íi]vel/g) || []).length;
      const ilegivelPenalty = Math.min(4, Math.round(ilegivelCount * 0.5));

      for (const pStr of pages) {
        const pNum = parseInt(pStr, 10);
        let conf = pageConfidences[pNum];
        
        if (conf === 99 && ilegivelCount > 0) {
          conf = Math.max(95, 99 - ilegivelPenalty);
        }
        
        total += conf;
        count++;
      }
      
      return Math.min(100, Math.max(0, Math.round(total / count)));
    }
  }

  // Fallback se não houver tags estruturadas (ex: imagem individual)
  let computedConfidence = fallbackConfidence || 99;
  const ilegivelCount = (textLower.match(/ileg[íi]vel/g) || []).length;
  
  if (textLower.includes('ia jurídica') || textLower.includes('ia juridica') || textLower.includes('recuperado via ia')) {
    if (ilegivelCount > 0) {
      const ilegivelPenalty = Math.min(4, Math.round(ilegivelCount * 0.5));
      computedConfidence = Math.max(95, computedConfidence - ilegivelPenalty);
    } else {
      computedConfidence = Math.max(99, computedConfidence);
    }
  } else {
    if (ilegivelCount > 0) {
      const ilegivelPenalty = Math.min(30, ilegivelCount * 5);
      computedConfidence = Math.max(0, computedConfidence - ilegivelPenalty);
    }
  }
  
  if (textLower.includes('erro crítico') || textLower.includes('erro critico') || textLower.includes('pagina pulada') || textLower.includes('página pulada')) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(computedConfidence)));
}

// Substituição cirúrgica do texto de uma página específica
function replacePageTextInDoc(fullText: string, pageNum: number, newPageText: string, isDigital: boolean = false): string {
  // Regex altamente precisa para encontrar somente marcadores de cabeçalho de página que comecem no início do texto ou de uma linha
  const regexHeader = new RegExp(
    "(?:^|\\r?\\n)(?:\\[|\\*\\*)?(?:ERRO\\s+CR[ÍI]TICO\\s+NA\\s+|TEXTO\\s+DIGITAL\\s+NATIVO\\s+NA\\s+|RECUPERADO\\s+VIA\\s+IA\\s+JUR[ÍI]DICA\\s+NA\\s+)?(?:P[ÁA]GINA|PAGINA)\\s+" + pageNum + "\\b[^\\n\\*]*?(?:\\]|\\*\\*)?(?:\\r?\\n|$)", 
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
  // Encontra o início da PRÓXIMA página real (começando no início da linha) para fixar o limite do corte, preservando completamente as demais páginas
  const nextHeaderRegex = /(?:\r?\n)(?:\[|\*\*)?(?:ERRO\s+CR[ÍI]TICO\s+NA\s+|TEXTO\s+DIGITAL\s+NATIVO\s+NA\s+|RECUPERADO\s+VIA\s+IA\s+JURÍDICA\s+NA\s+)?(?:P[ÁA]GINA|PAGINA)\s+\d+\b/gi;
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

async function extractPDFHybrid(file, onProgress, useAi, startPage = 1, forceAi = false, goldStandard = true) {
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
      let finalCanvasToUse: any = null;
      let tempCanvas: any = null;
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
        let isDigital = false;
        if (attempt === 1) {
          try {
            const textContent = await withTimeout(page.getTextContent(), currentTimeout, `Timeout no texto nativo da pág ${i}`);
            pageText = textContent.items.map(item => item.str).join(" ").trim();
            if (isGenuineDigitalText(pageText)) {
              isDigital = true;
            }
          } catch (nativeErr) {
            console.warn(`[Pág ${i}] Não foi possível obter texto nativo (tentando OCR visual):`, nativeErr);
            pageText = "";
          }
        }

        if (isDigital) {
          onProgress(
            Math.round(((i - startIdx + 1) / (endIdx - startIdx + 1)) * 100),
            `Pág ${i}/${endIdx}: Lida instantaneamente (Texto Digital Nativo)!`
          );
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
          let renderSuccess = false;

          // Escala adaptativa progressiva para economia de heap/buffers caso esteja falhando
          const attemptScales = attempt === 1 ? (goldStandard ? [2.0, 1.5] : [1.5, 1.0]) : attempt === 2 ? [1.25, 1.0] : [0.75];
          
          for (let scaleAttempt of attemptScales) {
            let canvas = document.createElement("canvas");
            let ctx = null;
            let renderTask = null;
            try {
              viewport = page.getViewport({ scale: scaleAttempt });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              ctx = canvas.getContext("2d");
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

          // Decide previamente se vai direto para a IA (como Padrão Ouro)
          let shouldGoToAi = (useAi || forceAi) && (forceAi || goldStandard);
          let blob: Blob | null = null;

          if (!shouldGoToAi) {
            // Só gera a imagem contrastada pesada (tempCanvas e blob PNG) se for rodar o OCR local
            tempCanvas = document.createElement("canvas");
            tempCanvas.width = finalCanvasToUse.width; tempCanvas.height = finalCanvasToUse.height;
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
               tempCtx.filter = 'grayscale(100%) contrast(220%) brightness(105%)';
               tempCtx.drawImage(finalCanvasToUse, 0, 0);
            }

            blob = await new Promise<Blob | null>(r => tempCanvas.toBlob(r, "image/png", 0.9));
            // Destrói o tempCanvas IMEDIATAMENTE após gerar o blob do OCR local para liberar RAM
            tempCanvas.width = 0; tempCanvas.height = 0;
            tempCanvas = null;
            if (!blob) throw new Error("Erro de buffer ao gerar canvas otimizado para o OCR Local.");
          }

          if (useAi || forceAi) {
            let ocrRes = { text: "", confidence: 0 };

            // OCR local como teste prévio (apenas se não estiver forçando IA diretamente ou usando Padrão Ouro)
            if (!shouldGoToAi && blob) {
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
              // IMPORTANTE: Destruímos finalCanvasToUse IMEDIATAMENTE para liberar a RAM mais pesada antes de iniciar a chamada de rede à API do Gemini!
              finalCanvasToUse.width = 0; finalCanvasToUse.height = 0;

              if (!originalColorBlob) throw new Error("Falha ao exportar imagem original colorida.");
              const enhancedForAi = await enhanceImageForGemini(originalColorBlob);
              
              const aiText = await extractPageWithGemini(enhancedForAi, onProgress, goldStandard);
              fullText += `[PÁGINA ${i} - RECUPERADO VIA IA JURÍDICA]\n` + aiText + "\n\n";
              confidenceTotal += 99;
              pageSuccess = true;

              // Cleanup
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
              const res = await withTimeout(tesseractWorker.recognize(blob!), 60000, `Timeout OCR local na página ${i}`);
              ocrRes = { text: res.data.text.trim(), confidence: Math.round(res.data.confidence) };
            } catch (err) {
              ocrRes = { text: "[PÁGINA PULADA]", confidence: 0 };
              if (tesseractWorker) {
                await tesseractWorker.terminate().catch(()=>null);
                tesseractWorker = null;
              }
            }

            // Cleanup
            finalCanvasToUse.width = 0; finalCanvasToUse.height = 0;

            if (ocrRes.confidence >= 99) {
              fullText += `[PÁGINA ${i} - TEXTO DIGITAL NATIVO]\n` + ocrRes.text + "\n\n";
              confidenceTotal += 100;
            } else {
              fullText += `[PÁGINA ${i} - OCR BRUTO (${ocrRes.confidence}%)]\n` + ocrRes.text + "\n\n";
              confidenceTotal += 0;
            }
            pageSuccess = true;

            if (page && page.cleanup) page.cleanup();
            break;
          }

          // Active GC
          if (finalCanvasToUse) { finalCanvasToUse.width = 0; finalCanvasToUse.height = 0; }
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
        if (finalCanvasToUse) {
          try { finalCanvasToUse.width = 0; finalCanvasToUse.height = 0; } catch (e) {}
        }
        if (tempCanvas) {
          try { tempCanvas.width = 0; tempCanvas.height = 0; } catch (e) {}
        }
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

async function extractImageHybrid(file, onProgress, useAi, forceAi = false, goldStandard = true) {
  if (forceAi || goldStandard) {
      onProgress(20, "Forçando extração via IA Jurídica (Padrão Ouro)...");
      try {
          const enhancedForAi = await enhanceImageForGemini(file);
          const aiText = await extractPageWithGemini(enhancedForAi, onProgress, goldStandard);
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
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: 'felix_castro_scanner_app_auth_session_v3',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;

// ── Componente principal ──────────────────────────────────────────────────────
export default function ScannerJuridico() {
  const [tab, setTab] = useState("scanner");
  const [file, setFile] = useState(null);
  const [queue, setQueue] = useState([]); // Fila de arquivos para processamento em massa
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState("");
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
  const [sortOrder, setSortOrder] = useState("name-asc"); // "date-desc", "date-asc", "name-asc", "name-desc"
  
  // Novas variáveis de estado para busca de clientes e documentos (para fácil navegação com o crescimento do app)
  const [moveSearch, setMoveSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");

  useEffect(() => {
    if (!movingItem) {
      setMoveSearch("");
    }
  }, [movingItem]);

  useEffect(() => {
    setDocSearch("");
  }, [viewingClient]);

  const [toast, setToast] = useState(null);

  // ── Controle de Acesso e Perímetro de Segurança do Escritório v3 (100% Protegido via Banco) ──
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthSettingsOpen, setIsAuthSettingsOpen] = useState(false);

  // Monitora o estado de Autenticação em tempo real
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Carregar sessão recuperada inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    // Escutar alterações em tempo real de Login/Logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [aiMode, setAiMode] = useState(true);
  const [goldStandard, setGoldStandard] = useState(true);
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
  const [appendingDoc, setAppendingDoc] = useState(null); // Documento original que está sendo expandido/continuado

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
  const [completedCrop, setCompletedCrop] = useState(null);

  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [webcamFacingMode, setWebcamFacingMode] = useState("environment");
  const [webcamDevices, setWebcamDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  // Filtros de Processamento de Imagem para alta qualidade de OCR/Contraste de Fontes
  const [imagePreset, setImagePreset] = useState("nitido-cores"); // "original", "documento", "nitido-cores", "alto-contraste", "personalizado"
  const [imageContrast, setImageContrast] = useState(115); // % de contraste (suave para não estourar documentos coloridos tipo RG/CNH)
  const [imageBrightness, setImageBrightness] = useState(101); // % de brilho (quase natural de 101% para preservar fundos e fotos coloridas)
  const [isGrayscale, setIsGrayscale] = useState(false); // Padrão colorido
  const [imageSaturation, setImageSaturation] = useState(125); // Saturação suave (125%) para realçar a tinta das letras sem estourar as cores
  const [isFineTuningOpen, setIsFineTuningOpen] = useState(false); // Sanfona para controle fino

  const applyImagePreset = (preset) => {
    setImagePreset(preset);
    if (preset === "original") {
      setImageContrast(100);
      setImageBrightness(100);
      setIsGrayscale(false);
      setImageSaturation(100);
    } else if (preset === "documento") {
      setImageContrast(175);
      setImageBrightness(108);
      setIsGrayscale(true);
      setImageSaturation(0);
    } else if (preset === "nitido-cores") {
      setImageContrast(115);
      setImageBrightness(101);
      setIsGrayscale(false);
      setImageSaturation(125);
    } else if (preset === "alto-contraste") {
      setImageContrast(225);
      setImageBrightness(112);
      setIsGrayscale(true);
      setImageSaturation(0);
    }
  };

  const fileRefImg = useRef();
  const fileRefPdf = useRef();
  const fileRefBatchImg = useRef();
  const nativeCameraRef = useRef();
  const canvasRef = useRef();
  const croppedImgRef = useRef();
  const webcamVideoRef = useRef();
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

  // ── Interceptador de Botão Voltar Físico (Celular / Gestos de Navegação) ──
  useEffect(() => {
    const handlePopState = (e) => {
      let handled = false;

      if (viewingBatchPage !== null) {
        setViewingBatchPage(null);
        handled = true;
      } else if (isCropping) {
        setIsCropping(false);
        handled = true;
      } else if (isBatchModalOpen) {
        setIsBatchModalOpen(false);
        handled = true;
      } else if (isAuthSettingsOpen) {
        setIsAuthSettingsOpen(false);
        handled = true;
      } else if (viewingClient !== null) {
        setViewingClient(null);
        handled = true;
      } else if (tab !== "scanner") {
        setTab("scanner");
        handled = true;
      }

      if (handled) {
        // Empurra de volta para manter o mesmo nível de blindagem ativa enquanto houver subview
        window.history.pushState({ appActive: true }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [viewingBatchPage, isCropping, isBatchModalOpen, isAuthSettingsOpen, viewingClient, tab]);

  // Garante uma entrada extra no histórico como escudo protetor se houver subview/modal ativa
  useEffect(() => {
    const hasActiveSubview = 
      viewingBatchPage !== null || 
      isCropping || 
      isBatchModalOpen || 
      isAuthSettingsOpen || 
      viewingClient !== null || 
      tab !== "scanner";

    if (hasActiveSubview) {
      if (!window.history.state || !window.history.state.appActive) {
        window.history.pushState({ appActive: true }, "");
      }
    } else {
      if (window.history.state && window.history.state.appActive) {
        window.history.back();
      }
    }
  }, [viewingBatchPage, isCropping, isBatchModalOpen, isAuthSettingsOpen, viewingClient, tab]);

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
        
        const { data: dData } = await supabase.from('lexscan_documents').select('id, client_id, name, file_type, file_url, confidence, chars_count, words_count, created_at').order('created_at', { ascending: false });
        if (dData) {
          setHistory(dData.map(d => ({
            id: d.id,
            clientId: d.client_id || 'unassigned',
            name: d.name,
            type: d.file_type || '',
            preview: d.file_url || null,
            fileUrl: d.file_url || null,
            text: undefined, // Carregado sob demanda
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
    if (user) {
      loadData();
    }
  }, [loadData, user]);

  // Sincronização em Tempo Real (Realtime Sync) para multiplos usuários simultâneos
  useEffect(() => {
    if (!supabase || !user) return;

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
  }, [loadData, user]);

  const confColor = (c) => {
    if (c >= 90) return G.success;
    if (c >= 70) return G.warning;
    return G.error;
  };

  /**
   * Otimiza o texto bruto do OCR sem usar IA (Lógica heurística)
   * Tenta reconstruir parágrafos, remover ruídos de leitura e normalizar espaços.
   */
  const optimizeRawText = (text, isAi = false) => {
    if (!text) return "";
    
    // Se o texto vier de IA (Padrão Ouro / GOD), NÃO faça limpeza de caracteres agressiva e nem reconstrua parágrafos.
    // Isso evita remover colchetes [], asteriscos **, barras |, ou letras isoladas fundamentais em CPF/CNH e nomes.
    const textLower = text.toLowerCase();
    if (isAi || textLower.includes("ia jurídica") || textLower.includes("ia juridica") || textLower.includes("recuperado via ia")) {
      return text
        .replace(/&nbsp;/gi, ' ')     // Remove &nbsp; gerados por alucinação visual em espaços brancos (bug do Gemini em páginas vazias da TramitaSign)
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, '\n\n') // No máximo 2 quebras de linha seguidas
        .replace(/ {2,}/g, ' ')     // Remove espaços duplos
        .trim();
    }
    
    // 1. Limpeza de ruído de borda e caracteres isolados estranhos (Apenas para OCR Local Tesseract)
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
        const urlToFetch = item.fileUrl || item.preview;
        let blob;
        let sdkSuccess = false;

        if (urlToFetch.includes('.supabase.co/storage/v1/object/') && supabase) {
          const match = urlToFetch.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
          if (match) {
            const bucket = match[1];
            const filePath = match[2].split('?')[0];
            const { data: fileBlob, error } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
            if (fileBlob && !error) {
              blob = fileBlob;
              sdkSuccess = true;
            }
          }
        }

        if (!sdkSuccess) {
          const response = await fetch(urlToFetch);
          if (!response.ok) throw new Error("Falha no fetch HTTP");
          blob = await response.blob();
        }

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
        extracted = await extractPDFHybrid(f, onProgress, aiMode, startPage, aiMode, goldStandard);
      } else {
        extracted = await extractImageHybrid(f, onProgress, aiMode, aiMode, goldStandard);
      }

      // Otimização Heurística para todos os casos (limpeza final)
      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text, aiMode);
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
        extracted = await extractPDFHybrid(file, onProgress, aiMode, startPage, aiMode, goldStandard);
      } else {
        extracted = await extractImageHybrid(file, onProgress, aiMode, aiMode, goldStandard);
      }

      // Otimização Heurística para todos os casos (limpeza final)
      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text, aiMode);
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

  const startAppendingPages = async (targetResult) => {
    if (!targetResult) return;
    setProcessing(true);
    setProgress(5);
    setProgressMsg("Buscando documento para continuação...");
    
    try {
      const pdfjsLib = await loadPDFJS();
      let fileSource = null;
      
      // 1. Tentar do local state 'file' se coincidir
      if (file && file.name === targetResult.name) {
        fileSource = file;
      }
      
      // 2. Tentar local blob URL
      if (!fileSource && targetResult.localBlobUrl) {
         try {
           const res = await fetch(targetResult.localBlobUrl);
           if (res.ok) fileSource = await res.blob();
         } catch (e) {
           console.warn("Erro ao ler localBlobUrl:", e);
         }
      }
      
      // 3. Tentar baixar via Supabase Storage SDK download (evita CORS!)
      if (!fileSource && targetResult.fileUrl && supabase) {
        try {
          const match = targetResult.fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
          if (match) {
            const bucket = match[1];
            const filePath = match[2].split('?')[0];
            setProgressMsg("Baixando PDF via Supabase...");
            const { data: fileBlob, error: downloadError } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
            if (fileBlob && !downloadError) {
              fileSource = fileBlob;
            } else {
              console.warn("Falha no download via SDK:", downloadError);
            }
          }
        } catch (sdkErr) {
          console.error("Erro no download via SDK:", sdkErr);
        }
      }
      
      // 4. Fallback final: fetch HTTP público
      if (!fileSource && targetResult.fileUrl) {
        setProgressMsg("Baixando documento da nuvem...");
        const res = await fetch(targetResult.fileUrl).catch(() => null);
        if (res && res.ok) {
          fileSource = await res.blob();
        }
      }
      
      if (!fileSource) {
        throw new Error("Não foi possível carregar as páginas do arquivo original.");
      }
      
      setProgress(20);
      setProgressMsg("Carregando páginas no visualizador...");
      const arrayBuffer = await fileSource.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const loadedPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgressMsg(`Importando página original ${i}/${pdf.numPages}...`);
        setProgress(Math.round(20 + (i / pdf.numPages) * 75));
        
        const page = await pdf.getPage(i);
        let viewport = page.getViewport({ scale: 1.5 });
        let canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        let ctx = canvas.getContext("2d");
        if (!ctx) continue;
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        const imgBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (imgBlob) {
          const fileObj = new File([imgBlob as Blob], `${targetResult.name.replace(/\.[^.]+$/, "")}_pag_${i}.jpg`, { type: "image/jpeg" });
          loadedPages.push(fileObj);
        }
      }
      
      setCameraPages(loadedPages);
      setAppendingDoc(targetResult);
      setBatchDocName(targetResult.name.replace(/\.[^.]+$/, ""));
      if (targetResult.clientId) {
        setSelectedClient(targetResult.clientId);
      } else {
        setSelectedClient("unassigned");
      }
      
      setIsBatchModalOpen(true);
      showToast(`✓ Carregadas ${loadedPages.length} páginas do documento original. Pronto para continuar!`, "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao abrir páginas: " + (err.message || "Erro desconhecido"), "error");
    } finally {
      setProcessing(false);
      setProgress(0);
      setProgressMsg("");
    }
  };

  const recoverFailedPages = async (targetResult) => {
    if (!targetResult) {
      console.warn("[Recuperar páginas] Nenhum targetResult fornecido.");
      return;
    }
    console.log("[Recuperar páginas] Iniciando recuperação para o documento:", targetResult.name, targetResult.id);
    const currentText = targetResult.text || "";
    
    // Encontra todas as páginas falhas
    const failedPages = [];
    const regex1 = /ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
    let match;
    while ((match = regex1.exec(currentText)) !== null) {
      failedPages.push(parseInt(match[1], 10));
    }
    const regex2 = /P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO/gi;
    while ((match = regex2.exec(currentText)) !== null) {
      failedPages.push(parseInt(match[1], 10));
    }
    
    const pagesToProcess = [...new Set(failedPages)].sort((a, b) => a - b);
    console.log("[Recuperar páginas] Páginas detectadas para reparo:", pagesToProcess);
    
    if (pagesToProcess.length === 0) {
      showToast("Nenhuma página com falha ou erro crítico foi encontrada neste documento!", "info");
      return;
    }
    
    setProcessing(true);
    setIsRecovering(true);
    setProgress(0);
    setProgressMsg(`Iniciando recuperação de ${pagesToProcess.length} página(s) falha(s)...`);
    
    try {
      console.log("[Recuperar páginas] Carregando biblioteca do PDFJS...");
      const pdfjsLib = await loadPDFJS();
      console.log("[Recuperar páginas] PDFJS carregado com sucesso.");
      
      // Pegando arquivo original
      let fileSource = null;
      
      // 1. Tentar ler do arquivo atualmente mantido no state do Scanner se o nome bater
      if (file && file.name === targetResult.name) {
        console.log("[Recuperar páginas] Utilizando o arquivo atualmente selecionado no state 'file'.");
        fileSource = file; 
      }
      
      // 2. Tentar ler do localBlobUrl
      if (!fileSource && targetResult.localBlobUrl) {
        console.log("[Recuperar páginas] Tentando obter o arquivo pelo blob local:", targetResult.localBlobUrl);
        const res = await fetch(targetResult.localBlobUrl).catch((err) => {
          console.warn("[Recuperar páginas] Falha ao dar fetch no localBlobUrl:", err);
          return null;
        });
        if (res) {
          fileSource = await res.blob();
        }
      }
      
      // 3. Tentar baixar diretamente do Supabase Storage usando o SDK (evita CORS do fetch público!)
      if (!fileSource && targetResult.fileUrl && supabase) {
        try {
          console.log("[Recuperar páginas] Tentando download direto via SDK Supabase para evitar erros de CORS...");
          const match = targetResult.fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
          if (match) {
            const bucket = match[1];
            const filePath = match[2].split('?')[0];
            setProgressMsg("Baixando PDF original do Supabase via SDK...");
            const { data: fileBlob, error: downloadError } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
            if (fileBlob && !downloadError) {
              fileSource = fileBlob;
              console.log("[Recuperar páginas] ✓ Download via SDK Supabase efetuado com absoluto sucesso.");
            } else {
              console.error("[Recuperar páginas] Erro de download no SDK do Supabase:", downloadError);
            }
          } else {
            console.warn("[Recuperar páginas] Não foi possível parsear o bucketPath da URL:", targetResult.fileUrl);
          }
        } catch (sdkErr) {
          console.error("[Recuperar páginas] Exceção ao rodar download via SDK:", sdkErr);
        }
      }
      
      // 4. Fallback final: fetch HTTP público
      if (!fileSource && targetResult.fileUrl) {
        console.log("[Recuperar páginas] Fallback: Tentando baixar PDF original via fetch HTTP tradicional de", targetResult.fileUrl);
        setProgressMsg("Baixando PDF original da nuvem por link público...");
        const res = await fetch(targetResult.fileUrl).catch((err) => {
          console.error("[Recuperar páginas] Erro no fetch público:", err);
          return null;
        });
        if (res) {
          fileSource = await res.blob();
        }
      }
      
      if (!fileSource) {
        console.error("[Recuperar páginas] Erro: nenhuma das fontes de arquivo PDF pôde ser resolvida.");
        throw new Error("Não foi possível acessar o PDF original para carregar as páginas. Certifique-se de que o arquivo está salvo e acessível.");
      }
      
      console.log("[Recuperar páginas] Gerando ArrayBuffer para o PDF...");
      const arrayBuffer = await fileSource.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      console.log("[Recuperar páginas] PDF carregado na biblioteca. Total de páginas:", pdf.numPages);
      
      let updatedText = currentText;
      let successCount = 0;
      
      for (let step = 0; step < pagesToProcess.length; step++) {
        const pageNum = pagesToProcess[step];
        if (pageNum > pdf.numPages) {
          console.warn(`[Recuperar páginas] Página solicitada ${pageNum} excede número total de páginas do PDF (${pdf.numPages})`);
          continue;
        }
        
        setProgressMsg(`[${step + 1}/${pagesToProcess.length}] Recuperando Pág ${pageNum}...`);
        setProgress(Math.round(((step + 1) / pagesToProcess.length) * 100));
        console.log(`[Recuperar páginas] Processando página ${pageNum}/${pdf.numPages}...`);
        
        try {
          const page = await pdf.getPage(pageNum);
          
          // Tenta extrair texto digital nativo primeiro para ver se é uma página genuinamente digital
          let isDigital = false;
          let pageText = "";
          try {
            const textContent = await page.getTextContent();
            pageText = textContent.items.map((item: any) => item.str).join(" ").trim();
            if (isGenuineDigitalText(pageText)) {
              isDigital = true;
            }
          } catch (nativeErr) {
            console.warn(`[Recuperar páginas - Pág ${pageNum}] Não obteve texto nativo:`, nativeErr);
          }

          let cleanAiText = "";
          if (isDigital) {
            setProgressMsg(`[Pág ${pageNum}] Restaurada via Texto Digital Nativo...`);
            cleanAiText = pageText;
          } else {
            let viewport = page.getViewport({ scale: goldStandard ? 2.0 : 1.5 });
            let canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            let ctx = canvas.getContext("2d");
            if (!ctx) {
              console.error(`[Recuperar páginas] Erro ao obter Context 2D para a pág ${pageNum}`);
              continue;
            }
            
            await page.render({ canvasContext: ctx, viewport }).promise;
            
            const originalColorBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
            if (!originalColorBlob) {
              console.error(`[Recuperar páginas] Erro ao converter canvas em blob para a pág ${pageNum}`);
              canvas.width = 0; canvas.height = 0;
              continue;
            }
            
            const enhancedForAi = await enhanceImageForGemini(originalColorBlob as Blob);
            
            setProgressMsg(`[Pág ${pageNum}] Consultando IA Jurídica...`);
            const aiText = await extractPageWithGemini(enhancedForAi, (p, msg) => {
              setProgressMsg(`[Pág ${pageNum}] ${msg || "Extraindo..."}`);
            }, goldStandard);
            
            cleanAiText = optimizeRawText(aiText, true);
            
            // Limpar canvas
            canvas.width = 0; canvas.height = 0;
          }
          
          // Substituição cirúrgica no texto completo!
          updatedText = replacePageTextInDoc(updatedText, pageNum, cleanAiText, isDigital);
          successCount++;
          console.log(`[Recuperar páginas] Página ${pageNum} recuperada e substituída com sucesso.`);
        } catch (pageErr) {
          console.error(`[Recuperar páginas] Erro ao tentar recuperar página individual ${pageNum}:`, pageErr);
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
          console.error("[Recuperar páginas] Erro ao persistir atualização do PDF recuperado no Supabase:", dbError);
        } else {
          console.log("[Recuperar páginas] Sincronização de dados feita no Supabase.");
        }
      }
      
      // Atualizar no Histórico
      setHistory(prev => prev.map(item => item.id === targetResult.id ? updatedItem : item));
      setResult(updatedItem);
      
      showToast(`✓ Sucesso! ${successCount} de ${pagesToProcess.length} páginas foram totalmente recuperadas e inseridas!`, "success");
    } catch (err) {
      console.error("[Recuperar páginas] Falha crítica no fluxo de recuperação:", err);
      showToast(`Erro na recuperação de páginas: ${err.message}`, "error");
    } finally {
      setProcessing(false);
      setIsRecovering(false);
    }
  };

  const applyCrop = () => {
    if (!completedCrop || !croppedImgRef.current || !completedCrop.width || !completedCrop.height) {
      setIsCropping(false);
      return;
    }
    
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Cortando imagem...");

    setTimeout(() => {
      try {
        const image = croppedImgRef.current;
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        let cropWidth = completedCrop.width * scaleX;
        let cropHeight = completedCrop.height * scaleY;

        // Limitar o tamanho final para não crashar a memória (max 3000px na maior dimensão para altíssima qualidade) no celular
        const MAX_DIM = 3000;
        let scaleOutput = 1;
        if (cropWidth > MAX_DIM || cropHeight > MAX_DIM) {
          scaleOutput = Math.min(MAX_DIM / cropWidth, MAX_DIM / cropHeight);
        }

        canvas.width = Math.floor(cropWidth * scaleOutput);
        canvas.height = Math.floor(cropHeight * scaleOutput);

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';

          // Aplicar filtros de processamento de imagem para otimizar contrastes e fontes
          ctx.filter = `contrast(${imageContrast}%) brightness(${imageBrightness}%) grayscale(${isGrayscale ? 100 : 0}%) saturate(${isGrayscale ? 0 : imageSaturation}%)`;

          const cropX = completedCrop.x * scaleX;
          const cropY = completedCrop.y * scaleY;

          ctx.drawImage(
            image,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            canvas.width,
            canvas.height
          );

          canvas.toBlob(blob => {
            canvas.width = 0; canvas.height = 0; // libera ram instantaneamente
            setProcessing(false);
            setProgressMsg("");
            if (!blob) return;
            setIsCropping(false);
            setCameraPages(prev => [...prev, blob]);
            setIsBatchModalOpen(true);
          }, "image/jpeg", Math.min(0.95, scaleOutput < 1 ? 0.90 : 0.95));
        } else {
          setProcessing(false);
          setIsCropping(false);
        }
      } catch (e) {
        console.error(e);
        setProcessing(false);
        setIsCropping(false);
      }
    }, 50);
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

  // Camera and Image Capture functions
  const stopWebcam = () => {
    if (webcamVideoRef.current && webcamVideoRef.current.srcObject) {
      const stream = webcamVideoRef.current.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      webcamVideoRef.current.srcObject = null;
    }
  };

  const startWebcam = async (facing = "environment", deviceId = "") => {
    setIsWebcamOpen(true);
    setWebcamFacingMode(facing);
    
    // Buscar dispositivos de câmera disponíveis para preencher o dropdown
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter(d => d.kind === 'videoinput');
      setWebcamDevices(videoDevs);
      
      if (deviceId) {
        setSelectedDeviceId(deviceId);
      } else if (videoDevs.length > 0) {
        if (!selectedDeviceId) {
          // tentar encontrar o primeiro que bate com o facingMode
          const matching = videoDevs.find(d => d.label.toLowerCase().includes(facing === 'environment' ? 'back' : 'front'));
          if (matching) {
            setSelectedDeviceId(matching.deviceId);
          } else {
            setSelectedDeviceId(videoDevs[0].deviceId);
          }
        }
      }
    } catch (e) {
      console.warn("Erro ao listar câmeras:", e);
    }

    setTimeout(async () => {
      try {
        stopWebcam(); // Liberar qualquer stream anterior
        
        const activeDeviceId = deviceId || selectedDeviceId;
        
        // Solicitar alta definição de verdade (4K ou 1080p ideal) para focar as letras perfeitamente
        let constraints = {
          video: {
            deviceId: activeDeviceId ? { exact: activeDeviceId } : undefined,
            facingMode: activeDeviceId ? undefined : facing,
            width: { ideal: 4096, max: 4096 },
            height: { ideal: 3072, max: 3072 }
          },
          audio: false
        };
        
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn("Falha ao abrir com resolução máxima, tentando Full HD...", err);
          constraints = {
            video: {
              deviceId: activeDeviceId ? { exact: activeDeviceId } : undefined,
              facingMode: activeDeviceId ? undefined : facing,
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            },
            audio: false
          };
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          } catch (err2) {
            console.warn("Falha ao abrir com Full HD, tentando resolução básica...", err2);
            constraints = {
              video: {
                deviceId: activeDeviceId ? { exact: activeDeviceId } : undefined,
                facingMode: activeDeviceId ? undefined : facing
              },
              audio: false
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          }
        }
        
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          webcamVideoRef.current.setAttribute("playsinline", "true");
          try {
            await webcamVideoRef.current.play();
          } catch (e) {
            console.warn("Erro ao reproduzir vídeo:", e);
          }
          
          // Tentar configurar autofoco contínuo nas capacidades do hardware
          const track = stream.getVideoTracks()[0];
          if (track && track.getCapabilities) {
            try {
              const capabilities = track.getCapabilities();
              const advancedConstraints = {};
              
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                advancedConstraints.focusMode = 'continuous';
              }
              if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
                advancedConstraints.whiteBalanceMode = 'continuous';
              }
              if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
                advancedConstraints.exposureMode = 'continuous';
              }
              
              if (Object.keys(advancedConstraints).length > 0) {
                await track.applyConstraints({
                  advanced: [advancedConstraints]
                });
                console.log("Foco contínuo e balanceamento ativados:", advancedConstraints);
              }
            } catch (capErr) {
              console.warn("Não foi possível configurar foco contínuo:", capErr);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao iniciar webcam:", err);
        showToast("Não foi possível acessar a câmera de alta definição.", "error");
        setIsWebcamOpen(false);
      }
    }, 150);
  };

  const toggleWebcamFacing = () => {
    const nextFacing = webcamFacingMode === "environment" ? "user" : "environment";
    setWebcamFacingMode(nextFacing);
    setSelectedDeviceId(""); // reset para buscar o outro lado
    startWebcam(nextFacing, "");
  };

  const triggerManualFocus = async () => {
    if (!webcamVideoRef.current || !webcamVideoRef.current.srcObject) return;
    const stream = webcamVideoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      try {
        const capabilities = track.getCapabilities();
        if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
          showToast("Ajustando foco das lentes...", "info");
          await track.applyConstraints({
            advanced: [{ focusMode: 'single-shot' }]
          });
          setTimeout(async () => {
            if (capabilities.focusMode.includes('continuous')) {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
            }
          }, 1000);
        } else {
          showToast("Otimizando foco automático...", "info");
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' }]
            });
          }
        }
      } catch (e) {
        console.warn("Erro ao forçar foco:", e);
      }
    } else {
      showToast("Foco automático gerenciado pelo celular", "info");
    }
  };

  const captureWebcamPhoto = async () => {
    if (!webcamVideoRef.current || !webcamVideoRef.current.srcObject) return;
    
    const stream = webcamVideoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    
    showToast("Capturando foto em alta definição...", "info");
    
    // Tenta usar a ImageCapture API (recurso nativo do Chrome Android que tira foto real no sensor, idêntico à câmera do sistema)
    if (window.ImageCapture) {
      try {
        const imageCapture = new window.ImageCapture(track);
        const blob = await imageCapture.takePhoto();
        
        stopWebcam();
        setIsWebcamOpen(false);
        
        const f = new File([blob], "camera_hw_" + Date.now() + ".jpg", { type: "image/jpeg" });
        setFile(f);
        setPreview(URL.createObjectURL(blob));
        setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
        setCompletedCrop(null);
        setIsCropping(true);
        showToast("Foto capturada em alta definição nativa!", "success");
        return;
      } catch (err) {
        console.warn("Falha ao usar ImageCapture, usando fallback de alta resolução:", err);
      }
    }
    
    // Fallback: Captura via canvas de alta resolução
    const video = webcamVideoRef.current;
    const canvas = document.createElement("canvas");
    
    const width = video.videoWidth || video.clientWidth || 1920;
    const height = video.videoHeight || video.clientHeight || 1080;
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast("Erro ao processar imagem capturada.", "error");
          return;
        }
        
        stopWebcam();
        setIsWebcamOpen(false);
        
        const f = new File([blob], "camera_web_" + Date.now() + ".jpg", { type: "image/jpeg" });
        setFile(f);
        setPreview(URL.createObjectURL(blob));
        setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
        setCompletedCrop(null);
        setIsCropping(true);
        showToast("Captura realizada com sucesso!", "success");
      }, "image/jpeg", 0.95);
    } else {
      showToast("Erro ao criar contexto de renderização.", "error");
    }
  };

  const handleNativeCameraCapture = async (files) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) return;
    
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Carregando foto...");

    try {
      // Cria a URL de preview diretamente sobre o arquivo original enviado pela câmera nativa do celular.
      // SEM decodificar em Canvas gigante e SEM alocar buffers pesados em RAM!
      // Isso evita de forma absoluta que o Chrome/Android sofra travamento de falta de memória (OutOfMemory) e reinicie o app.
      const objectUrl = URL.createObjectURL(f);
      setFile(f);
      setPreview(objectUrl);
      setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
      setCompletedCrop(null);
      setIsCropping(true);
      showToast("Foto da câmera nativa carregada com sucesso!", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao carregar a foto do celular.", "error");
    } finally {
      setProcessing(false);
      setProgressMsg("");
    }
  };

  const skipCropAndAddPage = () => {
    if (!croppedImgRef.current) {
      // Fallback se não tiver ref de crop mas tem preview
      setIsCropping(false);
      if (preview) {
         fetch(preview).then(r => r.blob()).then(blob => {
            setCameraPages(prev => [...prev, blob]);
            setIsBatchModalOpen(true);
         }).catch(e => console.error(e));
      }
      return;
    }
    
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Aplicando filtros em tela cheia...");

    setTimeout(() => {
      try {
        const image = croppedImgRef.current;
        const canvas = document.createElement('canvas');
        
        const MAX_DIM = 3000;
        let scaleOutput = 1;
        if (image.naturalWidth > MAX_DIM || image.naturalHeight > MAX_DIM) {
           scaleOutput = Math.min(MAX_DIM / image.naturalWidth, MAX_DIM / image.naturalHeight);
        }

        canvas.width = Math.floor(image.naturalWidth * scaleOutput);
        canvas.height = Math.floor(image.naturalHeight * scaleOutput);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingQuality = 'high';
          ctx.filter = `contrast(${imageContrast}%) brightness(${imageBrightness}%) grayscale(${isGrayscale ? 100 : 0}%) saturate(${isGrayscale ? 0 : imageSaturation}%)`;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            canvas.width = 0; canvas.height = 0; // Libera RAM
            setProcessing(false);
            setProgressMsg("");
            if (!blob) return;
            setIsCropping(false);
            setCameraPages(prev => [...prev, blob]);
            setIsBatchModalOpen(true);
          }, "image/jpeg", Math.min(0.95, scaleOutput < 1 ? 0.90 : 0.95));
        } else {
          setProcessing(false);
          setIsCropping(false);
        }
      } catch (e) {
        console.error(e);
        setProcessing(false);
        setIsCropping(false);
      }
    }, 50);
  };

  const handleBatchImageAdd = (files) => {
    if (!files || files.length === 0) return;
    
    if (files.length === 1) {
       const f = files[0];
       setIsBatchModalOpen(false);
       const objectUrl = URL.createObjectURL(f);
       setPreview(objectUrl); 
       setFile(f);
       setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
       setCompletedCrop(null);
       setTimeout(() => setIsCropping(true), 150);
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
      
      // Aplicando compressão no nível do PDF com limites de qualidade aprimorados para evitar letras embaçadas
      let maxW; 
      let q;
      if(pdfQuality === 'leve') { maxW = 1200; q = 0.75; }
      else if(pdfQuality === 'media') { maxW = 2048; q = 0.88; }
      else { maxW = 3200; q = 0.95; } // Alta - Extraordinariamente nítida

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
      
      // Libera ram explícito a cada página para evitar crash!
      compCanvas.width = 0; compCanvas.height = 0; 
      URL.revokeObjectURL(pageUrl);
    }
    
    setProgressMsg("Salvando PDF gerado...");
    const pdfBlob = doc.output('blob');
    const finalName = batchDocName.trim() ? batchDocName.trim() : "Documento_Escaneado";
    const sanitizedName = finalName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFile = new File([pdfBlob], `${finalName}.pdf`, { type: "application/pdf" });

    // Upload direto pro Supabase (Sem OCR) para acelerar a mesa
    showToast("PDF Otimizado e Gerado! Salvando na nuvem...");
    
    let fileUrl = null;
    let finalId = appendingDoc ? appendingDoc.id : Date.now().toString();

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
         setProcessing(false);
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

      if (appendingDoc) {
        await supabase.from('lexscan_documents').update(docRecord).eq('id', appendingDoc.id);
        finalId = appendingDoc.id;
      } else {
        const { data: dbData } = await supabase.from('lexscan_documents').insert([docRecord]).select();
        if (dbData && dbData[0]) finalId = dbData[0].id;
      }
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

    if (appendingDoc) {
      setHistory(prev => prev.map(h => h.id === appendingDoc.id ? newItem : h));
    } else {
      setHistory(prev => [newItem, ...prev]);
    }
    if (!supabase) addToHistory(newItem);

    setCameraPages([]);
    setIsBatchModalOpen(false);
    setBatchDocName("Documento_Escaneado"); // reset config
    setAppendingDoc(null); // clean up

    // Limpar o state da foto anterior e da crop session
    setFile(null);
    setPreview(null);
    setResult(newItem); // Keep the updated/compiled document loaded in the result view!
    setCroppedImage(null);

    // Joga pra aba scanner novamente para recomeçar o fluxo direto
    setTab("scanner"); 
    setProcessing(false);
    
    showToast(appendingDoc ? "✓ Documento atualizado com novas páginas!" : "✓ Salvo! Scanner liberado para seu próximo documento.");
  };

  const processHistoryItem = async (item) => {
    setProcessing(true);
    setTab("scanner");
    setProgress(0);
    setProgressMsg("Baixando arquivo do GED...");
    
    try {
      const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;
      
      let blob;
      let sdkSuccess = false;

      // Se for URL do Supabase público que pode estar privada (RLS limitando fetch normal)
      if (urlToFetch.includes('.supabase.co/storage/v1/object/') && supabase) {
        const match = urlToFetch.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
        if (match) {
          const bucket = match[1];
          const filePath = match[2].split('?')[0];
          const { data: fileBlob, error } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
          if (fileBlob && !error) {
            blob = fileBlob;
            sdkSuccess = true;
          }
        }
      }

      if (!sdkSuccess) {
        const response = await fetch(urlToFetch);
        if (!response.ok) throw new Error("Falha no fetch HTTP");
        blob = await response.blob();
      }

      const fileToProcess = new File([blob], item.name, { type: item.type });

      let extracted;
      const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

      window.lexscan_abort = false;

      if (fileToProcess.type === "application/pdf") {
        extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, true, goldStandard);
      } else {
        extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, true, goldStandard);
      }

      if (extracted && extracted.text) {
        extracted.text = optimizeRawText(extracted.text, true);
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
      showToast("Erro: " + (err.message || "processar OCR do item arquivado."), "error");
    } finally {
      setProcessing(false);
    }
  };

  const processFolderOCR = async () => {
    const docs = history.filter(h => {
       const isFolderItem = viewingClient === 'unassigned' 
         ? (!h.clientId || h.clientId === 'unassigned') 
         : h.clientId === viewingClient;
       
       const alreadyHasOcr = (h.words > 0 || h.chars > 0 || (h.text && h.text.trim() !== '')) && getRealConfidence(h.text, h.confidence) > 98;
       
       return isFolderItem && !alreadyHasOcr;
    });
    
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
        setProgressMsg(`[${i + 1}/${docs.length}] Analisando: ${item.name}...`);
        
        // Pequena pausa entre itens para respeitar RPM (1.5s)
        if (i > 0) await new Promise(r => setTimeout(r, 1500));

        try {
          const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;
          
          let blob;
          let sdkSuccess = false;

          if (urlToFetch.includes('.supabase.co/storage/v1/object/') && supabase) {
            const match = urlToFetch.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
            if (match) {
              const bucket = match[1];
              const filePath = match[2].split('?')[0];
              const { data: fileBlob, error } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
              if (fileBlob && !error) {
                blob = fileBlob;
                sdkSuccess = true;
              }
            }
          }

          if (!sdkSuccess) {
            const res = await fetch(urlToFetch);
            if (!res.ok) throw new Error("Falha no fetch HTTP");
            blob = await res.blob();
          }

          const fileToProcess = new File([blob], item.name, { type: item.type });
    
          let extracted;
          const onProgress = (p, msg) => { 
             setProgress(p); 
             setProgressMsg(`[${i + 1}/${docs.length}] ${msg || ""}`); 
          };
    
          window.lexscan_abort = false;

          if (fileToProcess.type === "application/pdf") {
            extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, true, goldStandard);
          } else {
            extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, true, goldStandard);
          }
    
          if (extracted && extracted.text) {
            extracted.text = optimizeRawText(extracted.text, true);
            
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
          }
        } catch (fileErr) {
          console.error(`Erro no arquivo ${item.name}:`, fileErr);
          if (window.lexscan_abort) break;
        }
    }
    
    setProcessing(false);
    setProgress(0);
    setProgressMsg("");
    setTab("history"); // Retorna para o histórico após processar todos
    showToast(`✓ Lote concluído! ${processedCount} documentos processados.`, "success");
    if (processedCount > 0) setTab("history");
  };

  const handleSaveManualEdit = async () => {
    if (!result) return;
    try {
      const newText = editedText;
      const newWords = newText.split(/\s+/).filter(Boolean).length;
      const newChars = newText.length;
      
      const updatedItem = {
        ...result,
        text: newText,
        words: newWords,
        chars: newChars,
      };

      setResult(updatedItem);
      setIsEditingText(false);
      setHistory((prev) => prev.map((h) => (h.id === result.id ? updatedItem : h)));

      if (supabase) {
        await supabase
          .from("lexscan_documents")
          .update({
            extracted_text: newText,
            words_count: newWords,
            chars_count: newChars,
          })
          .eq("id", result.id);
      } else {
        const localH = getHistory().map((h) => (h.id === result.id ? updatedItem : h));
        localStorage.setItem("lexscan_history", JSON.stringify(localH));
      }

      showToast("Texto atualizado com sucesso!", "success");
    } catch (e) {
      console.error("Erro ao salvar edição:", e);
      showToast("Erro ao salvar edição manual", "error");
    }
  };

  const fetchItemTextIfNeeded = async (item) => {
    if (!item.text || item.text.trim() === "") {
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('lexscan_documents')
            .select('extracted_text')
            .eq('id', item.id)
            .single();
          if (error) throw error;
          if (data && data.extracted_text) {
            const updated = { ...item, text: data.extracted_text };
            setHistory(prev => prev.map(h => h.id === item.id ? updated : h));
            return updated;
          }
        } catch (err) {
          console.error("Erro ao buscar texto do documento sob demanda:", err);
          showToast("Erro ao buscar conteúdo do documento", "error");
        }
      }
    }
    return item;
  };

  const loadFromHistory = async (item) => {
    showToast("Carregando documento...", "info");
    const loaded = await fetchItemTextIfNeeded(item);
    setResult(loaded);
    setTab("scanner");
  };

  const handleDownloadTXTFromHistory = async (item) => {
    showToast("Carregando texto para download...", "info");
    const loaded = await fetchItemTextIfNeeded(item);
    if (loaded && loaded.text) {
      downloadTXT(loaded.text, loaded.name.replace(/\.[^.]+$/, ""));
    } else {
      showToast("Não foi possível carregar o texto para download", "error");
    }
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
    if (!rawInput.match(/\.[a-zA-Z0-9]+$/)) {
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

          let blob;
          let sdkSuccess = false;

          // Se for URL do Supabase público que pode estar privada (RLS limitando fetch normal)
          if (urlToFetch.includes('.supabase.co/storage/v1/object/') && supabase) {
            const match = urlToFetch.match(/\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
            if (match) {
              const bucket = match[1];
              const filePath = match[2].split('?')[0];
              const { data: fileBlob, error } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
              if (fileBlob && !error) {
                blob = fileBlob;
                sdkSuccess = true;
              }
            }
          }

          if (!sdkSuccess) {
            const response = await fetch(urlToFetch);
            if (!response.ok) throw new Error("Falha no fetch HTTP");
            blob = await response.blob();
          }
          
          let entryName = doc.name || `Documento_${doc.id || i}`;
          
          // Garantir extensão PDF para documentos, a menos que seja imagem explícita
          const isPdf = doc.type === 'application/pdf' || (blob && blob.type === 'application/pdf');
          const isImage = (doc.type && doc.type.startsWith('image/')) || (blob && blob.type.startsWith('image/'));

          // Lógica aprimorada deextensão: Evita que "Doc. 8" vire "Doc.pdf"
          const hasExtension = entryName.match(/\.[a-z0-9]{2,4}$/i);
          
          if (isPdf) {
            if (!entryName.toLowerCase().endsWith('.pdf')) {
              if (hasExtension) {
                entryName = entryName.replace(/\.[^.]+$/, "") + ".pdf";
              } else {
                entryName += ".pdf";
              }
            }
          } else if (isImage) {
            if (!entryName.match(/\.(jpg|jpeg|png|webp)$/i)) {
              if (hasExtension) {
                entryName = entryName.replace(/\.[^.]+$/, "") + ".jpg";
              } else {
                entryName += ".jpg";
              }
            }
          } else if (!entryName.includes('.')) {
            entryName += ".pdf";
          }
          
          // Prevenção de duplicatas no ZIP (Collision detection)
          let finalEntryName = entryName;
          let counter = 1;
          while (zip.file(finalEntryName)) {
            const lastDotIndex = entryName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
              finalEntryName = `${entryName.substring(0, lastDotIndex)} (${counter})${entryName.substring(lastDotIndex)}`;
            } else {
              finalEntryName = `${entryName} (${counter})`;
            }
            counter++;
          }

          zip.file(finalEntryName, blob);
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

  if (authLoading) {
    return (
      <>
        <style>{css}</style>
        <div style={{
          background: G.bg,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          color: G.text,
          userSelect: 'none'
        }}>
          <div style={{
            fontSize: '28px',
            color: G.accent,
            fontFamily: "'Playfair Display', serif",
            letterSpacing: '1px',
            textAlign: 'center',
            fontWeight: 700
          }}>
            Félix & Castro
            <span style={{ display: 'block', fontSize: '12px', fontFamily: "'DM Sans', sans-serif", color: G.muted, marginTop: '4px', letterSpacing: '4px', textTransform: 'uppercase' }}>Advocacia Especializada</span>
          </div>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: `2px solid ${G.border}`,
            borderTopColor: G.accent,
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: G.muted }}>Carregando credenciais de acesso...</span>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <style>{css}</style>
        <AuthScreen 
          supabase={supabase} 
          onAuthSuccess={(sessionUser) => setUser(sessionUser)} 
          showToast={showToast}
          toast={toast}
        />
      </>
    );
  }

  return (
    <>
      <style>{css}</style>

      {/* Câmera em tempo real escondida no canvas e renderização */}
      <canvas ref={canvasRef} style={{ display: "none" }} />



      {/* Webcam Modal */}
      {isWebcamOpen && (
        <div className="modal-overlay" style={{ zIndex: 115 }}>
          <div style={{
            background: G.card,
            padding: '20px',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            border: `1px solid ${G.border}`,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <h3 style={{ marginBottom: 12, fontFamily: 'Playfair Display', color: G.accent, fontSize: '18px', textAlign: 'center', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              📸 Câmera HD Ultra-Foco
            </h3>
            <p style={{ fontSize: '11px', color: G.muted, textAlign: 'center', marginBottom: '14px', lineHeight: '1.4' }}>
              Usa captura de hardware nativa de alta definição com foco automático. <strong>Se as letras estiverem embaçadas, mude a câmera abaixo ou toque no vídeo para focar.</strong>
            </p>

            {/* Seletor de Câmera (Multi-Lentes Traseiras) */}
            {webcamDevices.length > 1 && (
              <div style={{ width: '100%', marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: G.muted, display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                  🎥 Selecione a Câmera:
                </label>
                <select 
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const devId = e.target.value;
                    setSelectedDeviceId(devId);
                    startWebcam(webcamFacingMode, devId);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: G.bg,
                    color: G.text,
                    border: `1px solid ${G.border}`,
                    fontSize: '12px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {webcamDevices.map((dev, idx) => {
                    let name = dev.label || `Câmera ${idx + 1}`;
                    if (name.toLowerCase().includes('back') || name.toLowerCase().includes('traseira') || name.toLowerCase().includes('facing back')) {
                      name = `📷 Câmera Traseira - Lente ${idx + 1} (${name.replace(/facing back/gi, '')})`;
                    } else if (name.toLowerCase().includes('front') || name.toLowerCase().includes('frontal') || name.toLowerCase().includes('facing front')) {
                      name = `🤳 Câmera Frontal (${name})`;
                    } else {
                      name = `🎥 Câmera ${idx + 1} - ${name}`;
                    }
                    return (
                      <option key={dev.deviceId || idx} value={dev.deviceId}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            
            <div 
              onClick={triggerManualFocus}
              style={{ 
                position: 'relative', 
                width: '100%', 
                borderRadius: '12px', 
                overflow: 'hidden', 
                background: '#000', 
                aspectRatio: '3/4', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer',
                border: `2px solid ${G.border}`
              }}
              title="Toque para focar"
            >
              <video 
                ref={webcamVideoRef} 
                className="modal-video" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', border: 'none', borderRadius: '12px' }}
                playsInline
                autoPlay
                muted
              />
              <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: '10px',
                padding: '4px 8px',
                borderRadius: '4px',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                zIndex: 10
              }}>
                🎯 Toque para Focar
              </div>
            </div>
            
            <div className="modal-actions" style={{ width: '100%', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button 
                onClick={triggerManualFocus} 
                className="modal-btn cancel" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', flex: 1, justifyContent: 'center', minWidth: '130px', margin: 0, fontSize: '12px' }}
                title="Ajustar o foco da câmera manualmente"
              >
                🎯 Forçar Foco
              </button>

              <button 
                onClick={toggleWebcamFacing} 
                className="modal-btn cancel" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', flex: 1, justifyContent: 'center', minWidth: '130px', margin: 0, fontSize: '12px' }}
                title="Alternar entre câmera frontal e traseira"
              >
                🔄 Inverter Lado
              </button>
              
              <button 
                onClick={captureWebcamPhoto} 
                className="modal-btn capture" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: G.accent, color: '#000', fontWeight: 'bold', padding: '12px 20px', flex: '1 1 100%', justifyContent: 'center', margin: '4px 0 0 0', fontSize: '13px' }}
              >
                📸 Bater Foto HD
              </button>
              
              <button 
                onClick={() => { stopWebcam(); setIsWebcamOpen(false); }} 
                className="modal-btn cancel"
                style={{ padding: '10px 14px', flex: '1 1 100%', justifyContent: 'center', marginTop: '4px', fontSize: '12px' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Crop Modal */}
      {isCropping && preview && file && file.type.startsWith("image/") && (
        <div className="modal-overlay" style={{zIndex: 110}}>
          <div style={{background: G.card, padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '440px', border: `1px solid ${G.border}`, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'}}>
            <h3 style={{marginBottom: 14, fontFamily: 'Playfair Display', color: G.accent, fontSize: '18px', textAlign: 'center'}}>
               ✂️ Visualização e Tratamento
            </h3>
            
            {/* Presets Rápidos de Imagem */}
            <div style={{marginBottom: '14px', background: G.surface, padding: '10px', borderRadius: '10px', border: `1px solid ${G.border}`}}>
              <div style={{fontSize: '11px', fontWeight: 'bold', color: G.accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                ⚡ Filtro Otimizador de Leitura:
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px'}}>
                <button 
                  onClick={() => applyImagePreset("documento")}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', fontSize: '11px', border: 'none', cursor: 'pointer', transition: '0.2s',
                    background: imagePreset === "documento" ? G.accent : G.border,
                    color: imagePreset === "documento" ? "#000" : G.text,
                    fontWeight: imagePreset === "documento" ? 'bold' : 'normal'
                  }}
                >
                  📄 Scanner Padrão (Cinza)
                </button>
                <button 
                  onClick={() => applyImagePreset("alto-contraste")}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', fontSize: '11px', border: 'none', cursor: 'pointer', transition: '0.2s',
                    background: imagePreset === "alto-contraste" ? G.accent : G.border,
                    color: imagePreset === "alto-contraste" ? "#000" : G.text,
                    fontWeight: imagePreset === "alto-contraste" ? 'bold' : 'normal'
                  }}
                >
                  🔍 Forte (Letras Fracas)
                </button>
               <button 
                  onClick={() => applyImagePreset("nitido-cores")}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', fontSize: '11px', border: 'none', cursor: 'pointer', transition: '0.2s',
                    background: imagePreset === "nitido-cores" ? G.accent : G.border,
                    color: imagePreset === "nitido-cores" ? "#000" : G.text,
                    fontWeight: imagePreset === "nitido-cores" ? 'bold' : 'normal'
                  }}
                >
                  🎨 Colorido Nítido (ID / CNH)
                </button>
                <button 
                  onClick={() => applyImagePreset("original")}
                  style={{
                    padding: '6px 8px', borderRadius: '6px', fontSize: '11px', border: 'none', cursor: 'pointer', transition: '0.2s',
                    background: imagePreset === "original" ? G.accent : G.border,
                    color: imagePreset === "original" ? "#000" : G.text,
                    fontWeight: imagePreset === "original" ? 'bold' : 'normal'
                  }}
                >
                  📷 Foto Original
                </button>
              </div>
            </div>

            {/* Ajuste Fino Sanfona */}
            <div style={{marginBottom: '12px'}}>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsFineTuningOpen(!isFineTuningOpen); }}
                style={{
                  background: 'transparent', color: G.text, border: 'none', width: '100%', padding: '4px 0',
                  textAlign: 'left', fontSize: '11px', cursor: 'pointer', outline: 'none', display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', opacity: 0.85
                }}
              >
                <span>{isFineTuningOpen ? "▼ Ocultar ajuste fino manual" : "▶ Ajuste Fino de Contraste Manual"}</span>
                <span style={{color: G.accent, fontSize: '10px'}}>{isFineTuningOpen ? "Fácil" : "Ajustar Sliders ⚙️"}</span>
              </button>
              
              {isFineTuningOpen && (
                <div style={{background: G.surface, padding: '10px', borderRadius: '8px', marginTop: '6px', border: `1px solid ${G.border}`, display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px'}}>
                      <span>Contraste</span>
                      <span style={{color: G.accent}}>{imageContrast}%</span>
                    </div>
                    <input 
                      type="range" min="100" max="300" step="5" value={imageContrast} 
                      onChange={(e) => { setImageContrast(Number(e.target.value)); setImagePreset("personalizado"); }}
                      style={{width: '100%', accentColor: G.accent}}
                    />
                  </div>

                  <div>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px'}}>
                      <span>Brilho (Limpa Sombras/Fundo)</span>
                      <span style={{color: G.accent}}>{imageBrightness}%</span>
                    </div>
                    <input 
                      type="range" min="80" max="180" step="2" value={imageBrightness} 
                      onChange={(e) => { setImageBrightness(Number(e.target.value)); setImagePreset("personalizado"); }}
                      style={{width: '100%', accentColor: G.accent}}
                    />
                  </div>

                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0'}}>
                    <input 
                      type="checkbox" id="grayscale-check" checked={isGrayscale}
                      onChange={(e) => { setIsGrayscale(e.target.checked); setImagePreset("personalizado"); }}
                      style={{accentColor: G.accent, cursor: 'pointer'}}
                    />
                    <label htmlFor="grayscale-check" style={{fontSize: '11px', cursor: 'pointer', userSelect: 'none'}}>Converter para Escala de Cinza (Filtro Anti-Manchas)</label>
                  </div>

                  {!isGrayscale && (
                    <div>
                      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px'}}>
                        <span>Saturação de Cores</span>
                        <span style={{color: G.accent}}>{imageSaturation}%</span>
                      </div>
                      <input 
                        type="range" min="50" max="250" step="5" value={imageSaturation} 
                        onChange={(e) => { setImageSaturation(Number(e.target.value)); setImagePreset("personalizado"); }}
                        style={{width: '100%', accentColor: G.accent}}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px'}}>
              <span style={{fontSize: '10px', color: G.muted}}>Girar documento correspondente se necessário:</span>
              <button 
                onClick={rotateImage90}
                style={{ background: G.border, color: G.text, border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                🔄 Girar 90°
              </button>
            </div>

            <div style={{maxHeight: '38vh', overflow: 'auto', textAlign: 'center', background: '#000', borderRadius: '8px', padding: '4px', border: `1px solid ${G.border}`}}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                <img 
                  ref={croppedImgRef} 
                  src={preview} 
                  alt="Crop" 
                  style={{
                    maxHeight: '35vh', 
                    width: 'auto',
                    objectFit: 'contain',
                    filter: `contrast(${imageContrast}%) brightness(${imageBrightness}%) grayscale(${isGrayscale ? '100%' : '0%'}) saturate(${isGrayscale ? '0%' : `${imageSaturation}%`})`
                  }} 
                />
              </ReactCrop>
            </div>
            
            <div className="modal-actions" style={{marginTop: 16, display: 'flex', gap: '10px'}}>
              <button className="modal-btn cancel" style={{flex: 1, padding: '10px 8px', fontSize: '12px'}} onClick={skipCropAndAddPage}>Utilizar Sem Cortar (Aplica Filtro)</button>
              <button className="modal-btn capture" style={{flex: 1, padding: '10px 8px', fontSize: '12px'}} onClick={applyCrop}>Confirmar e Salvar Página</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Compile Modal */}
      {isBatchModalOpen && (
        <div className="modal-overlay" style={{zIndex: 115}}>
          <div style={{background: G.card, padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '440px'}}>
            <h3 style={{marginBottom: 4, fontFamily: 'Playfair Display', color: G.accent, fontSize: '18px', textAlign: 'center'}}>
               {appendingDoc ? "➕ Adicionar Páginas" : "📑 Documento PDF"}
            </h3>
            {appendingDoc ? (
              <div style={{fontSize: '11px', color: G.accent, textAlign: 'center', marginBottom: 16}}>
                Expandindo: <strong>{appendingDoc.name}</strong> ({cameraPages.length} pág.)
              </div>
            ) : (
              <p style={{fontSize: '11.5px', color: G.muted, textAlign: 'center', marginBottom: 16}}>
                {cameraPages.length} página(s) carregada(s)
              </p>
            )}
            
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
                  style={{flex: 1, background: `${G.accent}12`, color: G.accent, border: `1px solid ${G.accent}`, fontSize: '12px', fontWeight: 'bold'}} 
                  onClick={() => { setIsBatchModalOpen(false); startWebcam("environment"); }}
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
              <button 
                className="modal-btn" 
                style={{ background: 'transparent', border: `1px solid ${G.border}`, color: G.text, marginTop: '2px', fontSize: '12px' }} 
                onClick={() => {
                  setIsBatchModalOpen(false);
                  setCameraPages([]);
                  setAppendingDoc(null);
                  showToast("Lote cancelado / descartado", "info");
                }}
              >
                ❌ Cancelar e Descartar
              </button>
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
            
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="🔍 Pesquisar cliente..."
                value={moveSearch}
                onChange={e => setMoveSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1px solid ${G.border}`,
                  background: G.bg,
                  color: G.text,
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

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
              {clients
                .filter(c => c.name.toLowerCase().includes(moveSearch.toLowerCase()))
                .map(c => (
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

      {/* Modal de Gestão de Acesso (Configurações Supabase / Perímetro de Segurança) */}
      {isAuthSettingsOpen && (
        <div className="modal-overlay" style={{ zIndex: 120 }}>
          <div style={{ background: G.card, padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '480px', border: `1px solid ${G.border}` }}>
            <h3 style={{ marginBottom: 12, fontFamily: 'Playfair Display', color: G.accent, fontSize: '20px', textAlign: 'center' }}>
              🛡️ Perímetro de Segurança Ativo
            </h3>
            <p style={{ fontSize: '12px', color: G.text, textAlign: 'justify', marginBottom: '16px', lineHeight: '1.5' }}>
              Este aplicativo está com o <strong>Padrão de Segurança Avançado (Perímetro Ouro)</strong> ativado.
            </p>
            <p style={{ fontSize: '11px', color: G.muted, textAlign: 'justify', marginBottom: '20px', lineHeight: '1.5' }}>
              Para evitar que pessoas mal-intencionadas ou hackers descubram os e-mails autorizados do escritório inspecionando o código do navegador (F12) ou arquivos temporários, o controle de permissões reside exclusivamente de forma oculta e criptografada dentro do seu banco de dados <strong>Supabase (Backend)</strong>.
            </p>

            <div style={{ background: 'rgba(201, 168, 76, 0.04)', border: `1px solid rgba(201, 168, 76, 0.15)`, padding: '14px', borderRadius: '10px', fontSize: '11px', color: '#e0d5ba', lineHeight: '1.5', marginBottom: '20px' }}>
              <strong>🔑 Gerenciamento de Vagas Seguras:</strong><br />
              <p style={{ marginTop: '6px' }}>
                Caso queira adicionar, remover ou reconfigurar quais e-mails institucionais pertencem ao quadro de advogados do escritório, basta alterar e reexecutar a sua função trigger diretamente no menu 
                <strong> SQL Editor</strong> com a lista desejada de e-mails em seu painel Supabase.
              </p>
              <p style={{ marginTop: '8px' }}>
                Isso garante proteção com criptografia de ponta a ponta a nível corporativo e impede qualquer tentativa de intrusão externa.
              </p>
            </div>

            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button 
                className="modal-btn cancel" 
                style={{ padding: '12px 32px', flex: 'none', minWidth: '120px' }} 
                onClick={() => setIsAuthSettingsOpen(false)}
              >
                ✓ Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app">
        {/* Header */}
        <div className="header">
          <div className="header-top">
            <div className="logo">
              Scaner Felix e Castro
              <span>ADVOCACIA ESPECIALIZADA v1.0.1</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <span className="badge accent">OCR PT</span>
              <span className="badge">PDF</span>
            </div>
          </div>

          {/* Informações da sessão autenticada Dr(a). */}
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "12px 16px 0 16px", padding: "10px 14px", background: "rgba(252, 252, 252, 0.02)", borderRadius: "10px", border: `1px solid ${G.border}`, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <span style={{ fontSize: "14px" }}>⚖️</span>
                <span style={{ fontSize: "11px", color: G.text, fontWeight: 500, fontFamily: "'DM Mono', monospace", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={user.email}>
                  Atendimento: <strong>{user.email}</strong>
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button 
                  onClick={() => setIsAuthSettingsOpen(true)}
                  title="Controle de Vagas do Escritório"
                  style={{ border: `1px solid ${G.border}`, background: G.bg, color: G.accent, borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", fontSize: "12px" }}
                >
                  ⚙️
                </button>
                <button 
                  onClick={async () => {
                    if (supabase) {
                      await supabase.auth.signOut();
                      setUser(null);
                      showToast("Sessão encerrada com sucesso.");
                    }
                  }}
                  title="Sair do Sistema"
                  style={{ border: `1px solid rgba(239, 68, 68, 0.3)`, background: "rgba(239, 68, 68, 0.05)", color: "#ef4444", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", fontSize: "12px" }}
                >
                  🚪
                </button>
              </div>
            </div>
          )}

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

                    <button className="action-card action-card-full" onClick={() => nativeCameraRef.current?.click()} style={{ border: `1.5px solid ${G.accent}`, background: `${G.accent}12` }}>
                      <div className="action-icon" style={{ color: G.accent }}>📷</div>
                      <div className="action-title" style={{ color: G.accent, fontWeight: 'bold' }}>Câmera do Celular (Recomendado)</div>
                      <div className="action-desc" style={{ color: G.text, opacity: 0.95 }}>Alta Definição e Foco Perfeito. Otimizado para não reiniciar o app</div>
                    </button>

                    <button className="action-card action-card-full" onClick={() => startWebcam("environment")} style={{ border: `1px solid ${G.border}`, background: 'transparent', padding: '12px 10px' }}>
                      <div className="action-icon" style={{ fontSize: '18px' }}>📸</div>
                      <div className="action-title" style={{ fontSize: '13px', fontWeight: 'normal' }}>Câmera Interna do App (Alternativa)</div>
                      <div className="action-desc" style={{ fontSize: '11px', color: G.muted }}>Usar webcam interna diretamente no navegador</div>
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
              {processing && !isRecovering && (
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
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

                  {aiMode && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'rgba(212, 163, 89, 0.05)', padding: '12px 14px', borderRadius: '12px', border: `1px solid rgba(212, 163, 89, 0.22)`
                    }}>
                      <input type="checkbox" checked={goldStandard} onChange={(e) => setGoldStandard(e.target.checked)} id="gold-standard" 
                        style={{ accentColor: '#fbbf24', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                      <label htmlFor="gold-standard" style={{ fontSize: '13px', color: G.text, cursor: 'pointer', display: 'flex', flexDirection: 'column', userSelect: 'none' }}>
                        <span style={{ fontWeight: 600, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ✨ Transcrição Padrão GOD / Ouro (Fidelidade Máxima)
                        </span>
                        <span style={{ fontSize: '11px', color: G.muted }}>Ignora completamente o OCR local de baixo desempenho, processa na nuvem via Gemini 3.5 Flash de forma prioritária, preservando colunas de diários oficiais, assinaturas e tabelas com exatidão máxima de 100%.</span>
                      </label>
                    </div>
                  )}
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
                      const regex1 = /ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
                      let match;
                      while ((match = regex1.exec(text)) !== null) {
                        failedPages.push(parseInt(match[1], 10));
                      }
                      const regex2 = /P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO/gi;
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
                            background: isRecovering ? 'rgba(212, 163, 89, 0.05)' : 'rgba(239, 68, 68, 0.08)',
                            border: isRecovering ? '1px solid rgba(212, 163, 89, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isRecovering ? '#fbbf24' : '#f87171', fontSize: '12px', fontWeight: 600 }}>
                            <span style={{ fontSize: '16px' }} className={isRecovering ? "animate-spin" : ""}>
                              {isRecovering ? "⚙️" : "⚠️"}
                            </span>
                            <span>{isRecovering ? "Reparando Páginas Cirurgicamente..." : "Atenção: Página(s) com erro ou pulada(s) detectada(s)!"}</span>
                          </div>
                          <p style={{ fontSize: '11px', color: G.text, opacity: 0.85, lineHeight: '1.4' }}>
                            Página(s) afetada(s): <strong style={{ color: G.accent }}>{pagesToProcess.join(', ')}</strong>. 
                            {isRecovering 
                              ? "O sistema está re-escanando cirurgicamente apenas estas páginas e as reposicionando no lugar exato do texto."
                              : "Você não precisa reprocessar o documento inteiro! Use nosso reparo cirúrgico \"Padrão Ouro\" para ler apenas essas páginas e inseri-las no local correto."
                            }
                          </p>

                          {isRecovering ? (
                            <div 
                              style={{ 
                                marginTop: '4px', 
                                padding: '12px', 
                                background: 'rgba(0, 0, 0, 0.2)', 
                                border: `1px solid ${G.border}`, 
                                borderRadius: '10px' 
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#fbbf24', marginBottom: '8px', fontWeight: 600 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="animate-pulse" style={{ width: '8px', height: '8px', background: '#fbbf24', borderRadius: '50%', display: 'inline-block' }} />
                                  Extraindo e Corrigindo no Supabase...
                                </span>
                                <span>{progress}%</span>
                              </div>
                              <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div 
                                  style={{ 
                                    height: '100%', 
                                    width: `${progress}%`, 
                                    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)', 
                                    borderRadius: '4px',
                                    transition: 'width 0.4s ease-out-in-out' 
                                  }} 
                                />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '10px' }}>
                                <span style={{ fontSize: '11px', color: G.text, opacity: 0.9, fontFamily: 'monospace', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {progressMsg}
                                </span>
                                <span style={{ fontSize: '10px', color: G.muted, flexShrink: 0 }}>
                                  Não feche o sistema
                                </span>
                              </div>
                            </div>
                          ) : (
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
                          )}
                        </div>
                      );
                    })()}

                    {isEditingText ? (
                      <div style={{ padding: '0 16px', marginTop: '12px' }}>
                        <textarea
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '320px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${G.border}`,
                            color: G.text,
                            fontFamily: "'DM Mono', monospace",
                            fontSize: '12px',
                            padding: '12px',
                            lineHeight: '1.7',
                            borderRadius: '8px',
                            resize: 'vertical',
                            outline: 'none'
                          }}
                        />
                      </div>
                    ) : (
                      <div className="result-text">{result.text || "(nenhum texto reconhecido)"}</div>
                    )}
                    <div className="confidence-bar">
                      <span>Confiança OCR</span>
                      <div className="conf-fill">
                        <div className="conf-inner" style={{ width: getRealConfidence(result.text, result.confidence) + "%", background: confColor(getRealConfidence(result.text, result.confidence)) }} />
                      </div>
                      <span style={{ color: confColor(getRealConfidence(result.text, result.confidence)) }}>{getRealConfidence(result.text, result.confidence)}%</span>
                    </div>
                    <div className="result-actions">
                      {isEditingText ? (
                        <>
                          <button className="dl-btn primary" onClick={handleSaveManualEdit} style={{ background: G.success, border: 'none', color: '#fff' }}>
                            💾 Salvar Edição
                          </button>
                          <button className="dl-btn" onClick={() => setIsEditingText(false)} style={{ background: G.surface, border: `1px solid ${G.border}`, color: G.text }}>
                            ❌ Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="dl-btn" onClick={() => { setIsEditingText(true); setEditedText(result.text || ""); }} style={{ background: G.surface, border: `1px solid ${G.border}`, color: G.text }}>
                            ✏️ Editar Texto
                          </button>
                          <button className="dl-btn" onClick={() => downloadTXT(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                            📝 .TXT
                          </button>
                          <button className="dl-btn primary" onClick={() => downloadPDF(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                            📄 Exportar OCR (PDF)
                          </button>
                      {(result.fileUrl || result.localBlobUrl) && (
                         <button 
                           onClick={(e) => { e.preventDefault(); forceDownload(result.fileUrl || result.localBlobUrl, result.name, supabase); }}
                           className="dl-btn" 
                           style={{ background: G.success, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                         >
                           ⬇️ Baixar Original 
                         </button>
                      )}
                      <button className="dl-btn" onClick={() => setMovingItem(result)} style={{ background: G.surface, border: `1px solid ${G.border}`, color: G.text }}>
                        📂 Mover Pasta
                      </button>
                      {!processing && (
                        <button 
                          className="dl-btn" 
                          onClick={() => startAppendingPages(result)} 
                          style={{ background: 'rgba(212, 163, 89, 0.12)', border: `1px solid ${G.accent}`, color: G.accent }}
                          title="Adicionar mais fotos ou páginas a este documento PDF"
                        >
                          ➕ Adicionar Páginas
                        </button>
                      )}
                      {(!result.text || result.text.trim() === "") && !processing && (
                        <button 
                          className="dl-btn primary" 
                          onClick={() => processHistoryItem(result)}
                          title="Executar OCR completo do documento expandido"
                        >
                          🧠 Extrair Texto (OCR)
                        </button>
                      )}
                      </>
                      )}
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
              <input ref={nativeCameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={e => handleNativeCameraCapture(e.target.files)} />
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

                  {/* Campo de Busca de Clientes */}
                  <div style={{ marginBottom: '16px' }}>
                    <input
                      type="text"
                      placeholder="🔍 Pesquisar pasta de cliente..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '12px',
                        border: `1px solid ${G.border}`,
                        background: G.card,
                        color: G.text,
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                    />
                  </div>

                  <div className="folders-grid" style={{ display: 'grid', gap: '12px' }}>
                    {clientSearch.trim() === "" && (
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
                    )}

                    {(clientSearch.trim() === "" 
                      ? clients.filter(c => !c.parentId)
                      : clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                    ).map(c => {
                      const docsCount = history.filter(h => h.clientId === c.id).length;
                      const subfoldersCount = clients.filter(sub => sub.parentId === c.id).length;
                      const parent = c.parentId ? clients.find(p => p.id === c.parentId) : null;
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
                            {parent && (
                              <div style={{ fontSize: '11px', color: G.accent, marginTop: '2px' }}>
                                ↳ Subpasta de: {parent.name}
                              </div>
                            )}
                            <div style={{ fontSize: '12px', color: G.muted, marginTop: '2px' }}>
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

                    <div style={{ marginBottom: '12px' }}>
                      <input
                        type="text"
                        placeholder="🔍 Pesquisar documento..."
                        value={docSearch}
                        onChange={e => setDocSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: `1px solid ${G.border}`,
                          background: G.bg,
                          color: G.text,
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                    </div>
                    
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

                  {(() => {
                    const folderDocs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
                    const filteredDocs = folderDocs.filter(h => h.name.toLowerCase().includes(docSearch.toLowerCase()));

                    if (folderDocs.length === 0) {
                      return (
                        <div className="history-empty">
                          <div className="history-empty-icon">📭</div>
                          <p>{clients.filter(c => c.parentId === viewingClient).length > 0 ? "Pasta não possui arquivos (apenas subpastas)." : "Pasta vazia."}</p>
                        </div>
                      );
                    }

                    if (filteredDocs.length === 0) {
                      return (
                        <div className="history-empty" style={{ padding: '24px 16px' }}>
                          <div className="history-empty-icon">🔍</div>
                          <p>Nenhum documento encontrado para "{docSearch}".</p>
                        </div>
                      );
                    }

                    return filteredDocs
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
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                                <input 
                                  autoFocus
                                  type="text" 
                                  value={newDocumentName}
                                  onChange={e => setNewDocumentName(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleRenameDocument()}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '4px 8px', borderRadius: '4px', color: G.text, width: '100%', fontSize: '12px' }}
                                />
                                <button onClick={(e) => { e.stopPropagation(); handleRenameDocument(); }} style={{ background: G.success, border: 'none', borderRadius: '4px', padding: '4px 8px', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>Salvar</button>
                                <button onClick={(e) => { e.stopPropagation(); setRenamingItem(null); }} style={{ background: 'transparent', border: `1px solid ${G.border}`, borderRadius: '4px', padding: '4px 8px', color: G.text, cursor: 'pointer', fontSize: '10px' }}>Cancelar</button>
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
                              const r1 = /ERRO\s+CR[ÍI]TICO\s+NA\s+P[ÁA]GINA\s+(\d+)/gi;
                              let m;
                              while ((m = r1.exec(text)) !== null) {
                                failedPages.push(parseInt(m[1], 10));
                              }
                              const r2 = /P[ÁA]GINA\s+(\d+)\s+-\s+OCR\s+BRUTO/gi;
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
                          {(() => {
                            const hasOcr = item.words > 0 || item.chars > 0 || item.confidence > 0 || (item.text && item.text.trim().length > 0);
                            return (
                              <div className="hist-actions">
                                {item.type && item.type.startsWith('image/') && (
                                   <button className="icon-btn" title="Comprimir (Média)" onClick={(e) => { e.stopPropagation(); handleCompressAndDownload(item, 'Média'); }}>📉</button>
                                )}
                                <button className="icon-btn" title="Mover Pasta" onClick={(e) => { e.stopPropagation(); setMovingItem(item); }}>📂</button>
                                {(item.fileUrl || item.localBlobUrl) && (
                                   <button onClick={(e) => { e.stopPropagation(); forceDownload(item.fileUrl || item.localBlobUrl, item.name, supabase); }} className="icon-btn" title="Baixar Original" style={{border: 'none', background: 'transparent', cursor: 'pointer', padding: 0}}>⬇️</button>
                                )}
                                {/* Botão de Refazer OCR (Sempre disponível para correção manual) */}
                                <button 
                                  className="icon-btn" 
                                  style={{
                                    background: !hasOcr ? G.accent : 'transparent', 
                                    color: !hasOcr ? '#000' : G.muted,
                                    border: !hasOcr ? 'none' : `1px solid ${G.border}`,
                                    fontWeight: 'bold'
                                  }} 
                                  title="Refazer OCR via IA Jurídica (Correção)" 
                                  onClick={(e) => { e.stopPropagation(); processHistoryItem(item); }}
                                >
                                  {!hasOcr ? '🔍 OCR' : '🔄'}
                                </button>

                                {hasOcr && (
                                   <>
                                     <button className="icon-btn" title="Abrir Extração" onClick={(e) => { e.stopPropagation(); loadFromHistory(item); }}>↗</button>
                                     <button className="icon-btn" title="Baixar TXT" onClick={(e) => { e.stopPropagation(); handleDownloadTXTFromHistory(item); }}>📝</button>
                                   </>
                                )}
                                <button className="icon-btn danger" title="Remover" onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id); }}>🗑</button>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="hist-preview">
                          {item.text 
                            ? (item.text.slice(0, 120) + (item.text.length > 120 ? '...' : '')) 
                            : `(Documento com ${item.words || 0} palavras. Clique para carregar o conteúdo)`}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Tela de Autenticação do Portal Felix & Castro Advocacia ────────────────────
function AuthScreen({ supabase, onAuthSuccess, showToast, toast }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!supabase) {
      showToast("Supabase não configurado de modo correto nas variáveis de ambiente.", "error");
      return;
    }

    if (!email.trim() || !password) {
      showToast("Por favor, preencha todos os campos.", "error");
      return;
    }

    setLoading(true);
    setInfoMsg("");

    try {
      if (isSignUp) {
        // Fluxo de Cadastro - Deixa o banco de dados invalidar se não for um e-mail permitido
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });

        if (error) throw error;

        if (data?.user) {
          if (data.session) {
            onAuthSuccess(data.user);
            showToast("✓ Conta criada e autenticada com sucesso!", "success");
          } else {
            setInfoMsg(`✓ Cadastro enviado! Um link de confirmação foi encaminhado ao e-mail ${email}. Ative seu cadastro por lá antes de entrar.`);
            showToast("Verifique seu e-mail para ativar!", "info");
          }
        }
      } else {
        // Fluxo de Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        });

        if (error) {
          if (error.message.toLowerCase().includes("email not confirmed") || error.message.toLowerCase().includes("confirm")) {
            setInfoMsg(`⚠️ Por favor, confirme seu e-mail através do link de ativação enviado para ${email} antes de efetuar o login.`);
            throw new Error("E-mail de cadastro ainda pendente de confirmação.");
          }
          throw error;
        }

        if (data?.user) {
          onAuthSuccess(data.user);
          showToast("✓ Bem-vindo de volta, Dr(a)!", "success");
        }
      }
    } catch (err) {
      showToast(err.message || "Erro de login involuntário.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: G.bg,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      color: G.text,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Toast local em tela de Auth se houver e o pai as repassar */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', padding: '14px 20px', 
          background: toast.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : toast.type === 'info' ? 'rgba(59, 130, 246, 0.95)' : 'rgba(201, 168, 76, 0.95)',
          color: toast.type === 'error' || toast.type === 'info' ? '#fff' : '#0d0f14',
          borderRadius: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 1000,
          fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span>{toast.type === 'error' ? '❌' : toast.type === 'info' ? 'ℹ️' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      {/* Background radial gold glow effect */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '500px', height: '500px', borderRadius: '50%',
        background: `radial-gradient(circle, rgba(201, 168, 76, 0.04) 0%, rgba(13, 15, 20, 0) 70%)`,
        zIndex: 0, pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%', maxWidth: '440px', background: G.surface, borderRadius: '16px',
        border: `1px solid ${G.border}`, padding: '40px 32px', zIndex: 10,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', position: 'relative'
      }}>
        {/* Logo/Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: G.accent, fontSize: '32px', fontWeight: 600, marginBottom: '6px', letterSpacing: '0.5px' }}>
            Félix & Castro
          </h1>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '3px', color: G.muted, fontWeight: 500 }}>
            Advocacia Especializada — Portal de Gestão
          </p>
          <div style={{ width: '40px', height: '1px', background: G.accentDim, margin: '16px auto 0 auto' }} />
        </div>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {isSignUp ? (
            <div style={{ textAlign: 'center', margin: '-10px 0 10px 0' }}>
              <span style={{ fontSize: '11px', background: 'rgba(201, 168, 76, 0.08)', color: G.accent, padding: '4px 12px', borderRadius: '12px', border: `1px solid rgba(201, 168, 76, 0.2)` }}>
                🛡️ Novo Cadastro de Vaga
              </span>
            </div>
          ) : null}

          {infoMsg && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.07)', border: `1px solid rgba(59, 130, 246, 0.2)`,
              padding: '12px 14px', borderRadius: '10px', fontSize: '12px', color: '#adc8fc', lineHeight: '1.5'
            }}>
              {infoMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: G.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>E-mail Institucional:</label>
            <input 
              type="email" 
              placeholder="exemplo@felixcastro.com.br"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              style={{
                background: G.bg, border: `1px solid ${G.border}`, outline: 'none',
                padding: '12px 14px', color: G.text, borderRadius: '8px', fontSize: '14px',
                transition: 'border-color 0.2s', width: '100%'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
            <label style={{ fontSize: '11px', color: G.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senha de Segurança:</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                style={{
                  background: G.bg, border: `1px solid ${G.border}`, outline: 'none',
                  padding: '12px 42px 12px 14px', color: G.text, borderRadius: '8px', fontSize: '14px',
                  transition: 'border-color 0.2s', width: '100%'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: G.muted, fontSize: '14px'
                }}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{
              background: G.accent, color: '#0d0f14', fontWeight: 600, border: 'none',
              padding: '14px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              marginTop: '8px', boxShadow: '0 4px 12px rgba(201, 168, 76, 0.15)'
            }}
          >
            {loading ? (
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%',
                border: '2px solid #0d0f14', borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite'
              }} />
            ) : isSignUp ? "✓ Enviar Cadastro" : "🔑 Acessar Portal"}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setInfoMsg("");
            }}
            disabled={loading}
            style={{
              background: 'none', border: 'none', color: G.accent, fontSize: '12px',
              cursor: 'pointer', textDecoration: 'underline'
            }}
          >
            {isSignUp ? "Já possuo credencial — Fazer Login" : "Criar nova senha para minha vaga"}
          </button>
        </div>

        {/* Info panel about authorized spaces */}
        <div style={{
          marginTop: '32px', paddingTop: '20px', borderTop: `1px solid ${G.border}`,
          fontSize: '11px', color: G.muted, display: 'flex', flexDirection: 'column', gap: '8px',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: G.text, justifyContent: 'center', marginBottom: '2px' }}>
            <span>🔒</span> PORTAL DE ACESSO RESTRITO
          </div>
          <p style={{ lineHeight: '1.4' }}>
            Este sistema possui controle de perímetro rígido integrado diretamente ao banco de dados Supabase. 
            Apenas e-mails institucionais autorizados no quadro de profissionais possuem permissão para cadastro ou login.
          </p>
        </div>
      </div>
    </div>
  );
}
