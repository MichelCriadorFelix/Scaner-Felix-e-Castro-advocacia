// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';

export default function CompileModal() {
  const { compilationCurrentIndex, compilationLogs, compilationLogsEndRef, compilationProgress, compilationStatusText, compilationTotal, divergenceChoices, divergenceCustomText, isCompiling, pendingStrategicReview, selectedStrategicAlerts, setDivergenceChoices, setDivergenceCustomText, setIsCompiling, setSelectedStrategicAlerts, showToast } = useApp();
  return (
    <>
{isCompiling && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(13, 15, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: G.surface,
            border: `1px solid ${G.accentDim}`,
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 15px rgba(201, 168, 76, 0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${G.border}`,
              background: 'rgba(201, 168, 76, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>📚</span>
                <div>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 600, color: G.accent, margin: 0 }}>
                    Compilador de Lote Félix & Castro
                  </h3>
                  <p style={{ fontSize: '11px', color: G.muted, margin: '2px 0 0 0' }}>
                    Processamento Inteligente & Otimização de OCR em Tempo Real
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {compilationProgress < 100 && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Status & Message */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${G.border}`,
                padding: '16px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: G.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fase Atual</span>
                  {compilationTotal > 0 && compilationCurrentIndex > 0 && (
                    <span style={{ fontSize: '11px', color: G.accent, background: 'rgba(201, 168, 76, 0.1)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                      Documento {compilationCurrentIndex} de {compilationTotal}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: G.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {compilationProgress === 100 ? '✅' : '⚡'} {compilationStatusText}
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: G.muted, fontWeight: 500 }}>Progresso Geral</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: G.accent }}>{compilationProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: G.border, borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${compilationProgress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${G.accentDim} 0%, ${G.accent} 100%)`,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-out'
                  }} />
                </div>
              </div>

              {/* Painel Interativo de Decisão Estratégica do Advogado */}
              {pendingStrategicReview && (
                <div style={{
                  background: 'linear-gradient(180deg, rgba(201, 168, 76, 0.09) 0%, rgba(201, 168, 76, 0.02) 100%)',
                  border: `1.5px solid ${G.accent}`,
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>⚖️</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: G.accent }}>
                          Decisão Estratégica do Advogado (Mérito & CNIS)
                        </h4>
                        <span style={{
                          fontSize: '10px',
                          background: 'rgba(238, 212, 159, 0.15)',
                          color: '#eed49f',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: 600,
                          border: '1px solid rgba(238, 212, 159, 0.3)'
                        }}>
                          Ação Necessária
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: G.text, lineHeight: '1.45' }}>
                        A auditoria encontrou dados divergentes (RG/CPF/CRM) entre documentos diferentes. Pra cada divergência abaixo, escolha qual valor está correto (ou digite o certo) — o app já corrige automaticamente no texto compilado. Defina também se quer manter o aviso no cabeçalho do relatório ou omiti-lo:
                      </p>
                    </div>
                  </div>

                  {/* Lista de Alertas Detectados */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {pendingStrategicReview.alerts.map((al, idx) => {
                      const isChecked = selectedStrategicAlerts.includes(idx);
                      const divergence = pendingStrategicReview.divergences[idx];
                      const choice = divergenceChoices[idx];
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedStrategicAlerts(prev =>
                              prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                            );
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: isChecked ? 'rgba(201, 168, 76, 0.12)' : 'rgba(0,0,0,0.3)',
                            border: `1px solid ${isChecked ? G.accent : G.border}`,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              style={{ marginTop: '2px', accentColor: G.accent, cursor: 'pointer' }}
                            />
                            <div style={{ fontSize: '11px', color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
                              {al}
                            </div>
                          </div>

                          {divergence && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                marginLeft: '24px',
                                paddingTop: '8px',
                                borderTop: `1px solid ${G.border}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}
                            >
                              <span style={{ fontSize: '10px', color: G.muted, fontWeight: 700 }}>QUAL VALOR ESTÁ CORRETO?</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                                {divergence.candidates.map((cand, ci) => (
                                  <label key={ci} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: G.text, cursor: 'pointer' }}>
                                    <input
                                      type="radio"
                                      name={`divergence-${idx}`}
                                      checked={choice === cand}
                                      onChange={() => setDivergenceChoices(prev => ({ ...prev, [idx]: cand }))}
                                      style={{ accentColor: G.accent, cursor: 'pointer' }}
                                    />
                                    Usar <strong>{cand}</strong>
                                  </label>
                                ))}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: G.text, cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={`divergence-${idx}`}
                                    checked={choice === '__custom__'}
                                    onChange={() => setDivergenceChoices(prev => ({ ...prev, [idx]: '__custom__' }))}
                                    style={{ accentColor: G.accent, cursor: 'pointer' }}
                                  />
                                  Outro:
                                  <input
                                    type="text"
                                    placeholder="digite o valor correto"
                                    value={divergenceCustomText[idx] || ''}
                                    onChange={(e) => {
                                      setDivergenceCustomText(prev => ({ ...prev, [idx]: e.target.value }));
                                      setDivergenceChoices(prev => ({ ...prev, [idx]: '__custom__' }));
                                    }}
                                    style={{ background: G.bg, border: `1px solid ${G.border}`, borderRadius: '4px', padding: '3px 6px', color: G.text, fontSize: '10px', width: '150px' }}
                                  />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: G.muted, cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={`divergence-${idx}`}
                                    checked={!choice}
                                    onChange={() => setDivergenceChoices(prev => { const next = { ...prev }; delete next[idx]; return next; })}
                                    style={{ accentColor: G.accent, cursor: 'pointer' }}
                                  />
                                  Não corrigir agora
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Aviso de clareza: as duas opções abaixo aplicam as correções escolhidas acima. A única diferença é
                      se o aviso da divergência também fica escrito no cabeçalho do relatório final. */}
                  <div style={{
                    fontSize: '10px',
                    color: G.muted,
                    background: 'rgba(0,0,0,0.25)',
                    border: `1px dashed ${G.border}`,
                    borderRadius: '8px',
                    padding: '8px 10px',
                    lineHeight: '1.4'
                  }}>
                    ℹ️ Os dois botões abaixo <strong style={{ color: G.text }}>aplicam as correções que você escolheu acima</strong> (o valor certo substitui o errado no texto). A única diferença é se o aviso da divergência também aparece escrito no cabeçalho do relatório final, ou não.
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
                    <button
                      onClick={() => {
                        const corrections: { candidates: string[]; chosenValue: string }[] = [];
                        pendingStrategicReview.divergences.forEach((div, idx) => {
                          const choice = divergenceChoices[idx];
                          if (!choice) return;
                          const chosenValue = (choice === '__custom__' ? (divergenceCustomText[idx] || '') : choice).trim();
                          if (!chosenValue) return;
                          corrections.push({ candidates: div.candidates, chosenValue });
                        });
                        pendingStrategicReview.resolve({ keptAlerts: [], corrections });
                      }}
                      style={{
                        flex: '1 1 240px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                        transition: 'transform 0.1s ease'
                      }}
                    >
                      <span>✅ Aplicar Correções e Ocultar Avisos (Compilado Limpo)</span>
                    </button>

                    <button
                      onClick={() => {
                        const chosen = pendingStrategicReview.alerts.filter((_, i) => selectedStrategicAlerts.includes(i));
                        const corrections: { candidates: string[]; chosenValue: string }[] = [];
                        pendingStrategicReview.divergences.forEach((div, idx) => {
                          const choice = divergenceChoices[idx];
                          if (!choice) return;
                          const chosenValue = (choice === '__custom__' ? (divergenceCustomText[idx] || '') : choice).trim();
                          if (!chosenValue) return;
                          corrections.push({ candidates: div.candidates, chosenValue });
                        });
                        pendingStrategicReview.resolve({ keptAlerts: chosen, corrections });
                      }}
                      style={{
                        flex: '1 1 180px',
                        background: 'rgba(255,255,255,0.06)',
                        border: `1px solid ${G.border}`,
                        color: G.text,
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>✅ Aplicar Correções e Manter Avisos no Cabeçalho</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Real-time terminal logs */}
              <div>
                <span style={{ fontSize: '11px', color: G.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                  Log de Processamento (Terminal de Auditoria)
                </span>
                <div style={{
                  background: '#07080a',
                  border: `1px solid ${G.border}`,
                  borderRadius: '10px',
                  padding: '12px 16px',
                  height: '200px',
                  overflowY: 'auto',
                  fontFamily: "'DM Mono', ui-monospace, monospace",
                  fontSize: '11px',
                  lineHeight: '1.6',
                  color: '#cad3f5',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {compilationLogs.map((log, index) => {
                    let color = '#cad3f5';
                    if (log.includes('✅') || log.includes('Concluído') || log.includes('sucesso')) {
                      color = '#a6da95'; // green-ish
                    } else if (log.includes('❌') || log.includes('Falha')) {
                      color = '#ed8796'; // red-ish
                    } else if (log.includes('⚠️') || log.includes('Minimizar') || log.includes('Mantendo original')) {
                      color = '#eed49f'; // amber-ish
                    } else if (log.includes('🚀') || log.includes('Iniciando')) {
                      color = G.accent; // gold-ish
                    } else if (log.includes('🪄') || log.includes('Otimizando')) {
                      color = '#f5bde6'; // purple/pink-ish
                    }

                    return (
                      <div key={index} style={{ color, wordBreak: 'break-all' }}>
                        {log}
                      </div>
                    );
                  })}
                  <div ref={compilationLogsEndRef} />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${G.border}`,
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              {compilationProgress < 100 ? (
                <button
                  onClick={() => {
                    setIsCompiling(false);
                    showToast("Compilação em segundo plano. Toasts de progresso serão exibidos.", "info");
                  }}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${G.border}`,
                    color: G.text,
                    fontSize: '13px',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Minimizar & Manter em 2° Plano
                </button>
              ) : (
                <button
                  onClick={() => setIsCompiling(false)}
                  style={{
                    background: G.accent,
                    color: '#0d0f14',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(201, 168, 76, 0.2)'
                  }}
                >
                  Fechar Visualizador
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
