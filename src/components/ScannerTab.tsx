// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';
import { detectFailedPages, getRealConfidence } from '../lib/textQuality';
import { downloadTXT, downloadPDF, forceDownload } from '../lib/browserHelpers';
import { supabase } from '../lib/supabaseClient';

export default function ScannerTab() {
  const { serverKeys, aiMode, clients, confColor, currentQueueIndex, discardDraft, drag, editedText, file, fileRefImg, fileRefPdf, goldStandard, handleCompressAndDownload, handleDownloadLite, handleDrop, handleFiles, handleNativeCameraCapture, handleRefineTextWithAI, handleSaveManualEdit, hasRecoverableBatch, isAborting, isBatchModalOpen, isEditingText, isFolderArchived, isRecovering, isRefiningText, nativeCameraRef, preview, process, processBatch, processHistoryItem, processing, progress, progressMsg, queue, recoverDraft, recoverFailedPages, result, saveWithoutOCR, selectedClient, setAiMode, setDrag, setEditedText, setFile, setGoldStandard, setIsAborting, setIsCropping, setIsEditingText, setMovingItem, setPreview, setProgressMsg, setQueue, setResult, setSelectedClient, setStartPage, startAppendingPages, startPage, storageWarning, tab, uploadBatchWithoutOCR } = useApp();
  return (
    <>
{tab === "scanner" && (
            <div className="scanner-panel">

              {hasRecoverableBatch && !isBatchModalOpen && (
                <div style={{
                  marginBottom: '16px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(212, 163, 89, 0.1)',
                  border: `1px solid ${G.accent}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <strong style={{ color: G.accent, fontSize: '14px' }}>Escaneamento Recuperado</strong>
                  </div>
                  <p style={{ color: G.text, fontSize: '12px', lineHeight: '1.4', margin: 0 }}>
                    Identificamos um conjunto de páginas em andamento (provavelmente o navegador foi recarregado para liberar memória). Deseja continuar de onde parou?
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={recoverDraft} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: G.accent, color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Recuperar</button>
                    <button onClick={discardDraft} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: 'transparent', color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer' }}>Descartar</button>
                  </div>
                </div>
              )}

              {storageWarning && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>💾</span>
                  <p style={{ color: '#f87171', fontSize: '11.5px', lineHeight: '1.5', margin: 0 }}>{storageWarning}</p>
                </div>
              )}

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
                      <div className="action-icon" style={{ color: G.accent }}>📸</div>
                      <div className="action-title" style={{ color: G.accent, fontWeight: 'bold' }}>Câmera do Celular</div>
                      <div className="action-desc" style={{ color: G.text, opacity: 0.85 }}>Alta Qualidade, Não trava o dispositivo</div>
                    </button>
                  </div>

                  {/* Alerta de Desempenho / Motorola */}
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: `${G.surface}80`,
                    border: `1px dashed ${G.border}`,
                    fontSize: '11px',
                    lineHeight: '1.5',
                    color: G.muted,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '14px' }}>💡</span>
                    <div>
                      <strong style={{ color: G.text }}>Dica para Motorola e celulares com pouca memória:</strong> Se o seu celular fechar o aplicativo ou reiniciar a página ao tirar fotos com a câmera nativa, isso ocorre porque o Android fecha o navegador para liberar espaço. 
                      <span style={{ display: 'block', marginTop: '4px' }}>
                        Para resolver isso de forma definitiva: <strong>tire as fotos das páginas antes utilizando a Câmera normal do seu celular</strong> (com o foco e qualidade originais de fábrica) e depois use a opção <strong>Upload de Imagem</strong> ou <strong>Upload de PDF</strong> para enviá-las a partir da Galeria.
                      </span>
                    </div>
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
                  <button 
                    id="btn-pause-ocr"
                    onClick={() => { 
                      window.lexscan_abort = true; 
                      setIsAborting(true);
                      setProgressMsg("⏹ Pausando processo e salvando páginas já processadas...");
                    }} 
                    disabled={isAborting}
                    style={{ 
                      marginTop: '14px', 
                      background: isAborting ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.10)', 
                      border: `1px solid ${isAborting ? '#ef4444' : 'rgba(239, 68, 68, 0.35)'}`, 
                      borderRadius: '8px', 
                      padding: '11px 16px', 
                      color: isAborting ? '#fca5a5' : '#f87171', 
                      cursor: isAborting ? 'not-allowed' : 'pointer', 
                      fontSize: '13px', 
                      width: '100%', 
                      fontWeight: 600, 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      boxShadow: isAborting ? '0 0 14px rgba(239, 68, 68, 0.4)' : 'none'
                    }}>
                     {isAborting ? "⏳ Interrompendo e Salvando Progresso..." : "⏹ Pausar / Salvar Progresso Atual"}
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
                      {clients.filter(c => !isFolderArchived(c) || c.id === selectedClient).map(c => (
                        <option key={c.id} value={c.id}>{isFolderArchived(c) ? '📦 ' : ''}{c.parentId ? '↳ ' : ''}{c.name}{isFolderArchived(c) ? ' (arquivada)' : ''}</option>
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
                           🟢 {serverKeys.filter((k) => Object.values(k.models || {}).some((v) => v === 'ok')).length} {serverKeys.filter((k) => Object.values(k.models || {}).some((v) => v === 'ok')).length === 1 ? 'API Disponível' : 'APIs Disponíveis'}
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
                        <span style={{ fontSize: '11px', color: G.muted }}>Ignora completamente o OCR local de baixo desempenho, processa na nuvem via Gemini de forma prioritária, preservando colunas de diários oficiais, assinaturas e tabelas com exatidão máxima de 100%.</span>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="result-title">Texto Extraído</span>
                        {result.fromCache && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            ⚡ Cache SHA-256 (0 tokens)
                          </span>
                        )}
                      </div>
                      <span className="result-meta">{result.words} palavras · {result.chars} chars · Suporte Ilimitado (+500k)</span>
                    </div>

                    {/* Alerta inteligente de páginas puladas ou com erro */}
                    {(() => {
                      const pagesToProcess = detectFailedPages(result.text || "");
                      
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
                          <button 
                            className="dl-btn" 
                            onClick={handleRefineTextWithAI} 
                            style={{ background: 'rgba(59, 130, 246, 0.12)', border: `1px solid #3b82f6`, color: '#3b82f6', cursor: isRefiningText ? 'not-allowed' : 'pointer' }}
                            disabled={isRefiningText}
                            title="Refinar ortografia do texto, remover ruídos de OCR e corrigir palavras em português utilizando Inteligência Artificial"
                          >
                            {isRefiningText ? "🪄 Refinando..." : "🪄 Refinar com IA"}
                          </button>
                          <button className="dl-btn" onClick={() => downloadTXT(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                            📝 .TXT
                          </button>
                          <button className="dl-btn primary" onClick={() => downloadPDF(result.text, result.name.replace(/\.[^.]+$/, ""))}>
                            📄 Exportar OCR (PDF)
                          </button>
                      {(result.fileUrl || result.localBlobUrl || file) && (
                         <>
                           <button 
                             onClick={(e) => { e.preventDefault(); handleDownloadLite(result); }}
                             className="dl-btn" 
                             style={{ background: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                             title="Baixar versão leve otimizada (alta nitidez e qualidade para anexar no INSS <5MB e e-Proc <12MB)"
                           >
                             🪶 Baixar Versão Lite (INSS/e-Proc)
                           </button>
                           <button 
                             onClick={(e) => { e.preventDefault(); forceDownload(result.fileUrl || result.localBlobUrl, result.name, supabase); }}
                             className="dl-btn" 
                             style={{ background: G.success, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                             title="Baixar arquivo original sem compressão"
                           >
                             ⬇️ Baixar Original 
                           </button>
                         </>
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
                      {(!result.text || result.text.trim() === "") && !processing ? (
                        <button 
                          className="dl-btn primary" 
                          onClick={() => processHistoryItem(result)}
                          title="Executar OCR completo do documento expandido"
                        >
                          🧠 Extrair Texto (OCR)
                        </button>
                      ) : (
                        !processing && (
                          <button
                            className="dl-btn"
                            onClick={() => {
                              if (file) {
                                process(true);
                              } else {
                                processHistoryItem(result, true);
                              }
                            }}
                            style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#eab308' }}
                            title="Refazer leitura completa do documento com Inteligência Artificial, ignorando o cache"
                          >
                            🔄 Forçar Releitura (IA)
                          </button>
                        )
                      )}
                      </>
                      )}
                    </div>

                    {(result.fileUrl || result.localBlobUrl || file) && (
                      <div style={{ marginTop: '12px', padding: '12px', background: G.bg, borderRadius: '12px', border: `1px solid ${G.border}` }}>
                         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                           <span style={{ fontSize: '11px', fontWeight: 700, color: G.text }}>🪶 OPÇÕES DE COMPRESSÃO COM QUALIDADE</span>
                           <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 600 }}>INSS &lt; 5MB • e-Proc &lt; 12MB</span>
                         </div>
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                            <button 
                              onClick={() => handleCompressAndDownload(result, 'Lite')} 
                              style={{ fontSize: '11px', fontWeight: 700, padding: '7px 4px', borderRadius: '6px', background: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer', textAlign: 'center' }}
                              title="Padrão Recomendado para INSS e e-Proc: máxima redução de tamanho com alta legibilidade"
                            >
                              🪶 Lite (INSS)
                            </button>
                            <button 
                              onClick={() => handleCompressAndDownload(result, 'Pouca')} 
                              style={{ fontSize: '11px', padding: '7px 4px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer', textAlign: 'center' }}
                              title="Compressão Leve: preserva 90%+ dos detalhes visuais originais"
                            >
                              Leve
                            </button>
                            <button 
                              onClick={() => handleCompressAndDownload(result, 'Média')} 
                              style={{ fontSize: '11px', padding: '7px 4px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer', textAlign: 'center' }}
                              title="Compressão Média: equilíbrio padrão entre tamanho e detalhes"
                            >
                              Média
                            </button>
                            <button 
                              onClick={() => handleCompressAndDownload(result, 'Máxima')} 
                              style={{ fontSize: '11px', padding: '7px 4px', borderRadius: '6px', background: G.card, color: G.text, border: `1px solid ${G.border}`, cursor: 'pointer', textAlign: 'center' }}
                              title="Compressão Máxima: para documentos muito volumosos que precisam caber em cotas restritas"
                            >
                              Máxima
                            </button>
                         </div>
                         <div style={{ fontSize: '10px', color: G.muted, marginTop: '6px', textAlign: 'center' }}>
                           Comprime PDFs e fotos reduzindo o peso em até 85%, mantendo total nitidez para carimbos e assinaturas.
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
    </>
  );
}
