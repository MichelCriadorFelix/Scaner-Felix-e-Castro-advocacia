// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';
import { MODEL_OPTIONS } from '../lib/geminiModels';

export default function ApiStatusPanel() {
  const { serverKeys, forcePaidKey, handleForcePaidKeyChange, handleHardHandwritingChange, handleModelChange, hardHandwriting, keyErrors, keyUsage, selectedModel, setKeyErrors, setKeyUsage, setShowApiKeyDetails, showApiKeyDetails } = useApp();
  return (
    <>
<div style={{ padding: '12px 20px', background: G.bg, borderBottom: `1px solid ${G.border}` }}>
          <div onClick={() => setShowApiKeyDetails(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: '11px', color: G.muted, fontWeight: 600, letterSpacing: '0.05em' }}>{showApiKeyDetails ? '▼' : '▶'} STATUS DA INFRAESTRUTURA IA</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Deseja realmente limpar/resetar o status e contadores de todas as chaves de API?")) {
                    localStorage.removeItem('lexscan_key_errors');
                    localStorage.removeItem('lexscan_key_usage');
                    localStorage.removeItem('lexscan_key_model_quota');
                    localStorage.removeItem('lexscan_key_minute_window');
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '10px', color: G.muted, fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>MODELO GEMINI:</label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              title="Escolha qual modelo Gemini o app deve usar para transcrever e refinar os documentos. Troque para o que estiver mais livre no momento."
              style={{
                flex: 1,
                maxWidth: '220px',
                background: G.card,
                color: G.text,
                border: `1px solid ${G.border}`,
                borderRadius: '6px',
                padding: '5px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <label
              title="Força toda transcrição a chamar a chave Gemini paga primeiro, ignorando até status de erro travado — use pra confirmar na prática que ela está sendo usada."
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: forcePaidKey ? '#f0b429' : G.muted, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
            >
              <input
                type="checkbox"
                checked={forcePaidKey}
                onChange={(e) => handleForcePaidKeyChange(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              💰 Forçar chave paga
            </label>
            <label
              title="Para laudos manuscritos de letra difícil: sobe o raciocínio do modelo ao máximo (2.5 Flash: 12.288 tokens de raciocínio) e envia a imagem em resolução maior. Gasta mais tokens por página — ligue só nesses documentos, depois reprocesse (🔄). Desmarca sozinho ao recarregar a página."
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: hardHandwriting ? '#7dd3fc' : G.muted, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
            >
              <input
                type="checkbox"
                checked={hardHandwriting}
                onChange={(e) => handleHardHandwritingChange(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              ✍️ Manuscrito difícil
            </label>
          </div>
          <div style={{ display: showApiKeyDetails ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {serverKeys.length === 0 && (
              <div style={{ fontSize: '10px', color: G.muted }}>Consultando o estado das chaves no servidor...</div>
            )}
            {serverKeys.map((k, idx) => {
              // Estado como o SERVIDOR enxerga (igual pra todas as abas e sócios). Cada modelo: ok / em espera / sem cota hoje / indisponível.
              const entries = Object.entries(k.models || {}) as [string, string][];
              const short = (m: string) => m.replace('gemini-', '');
              const okModels = entries.filter(([, v]) => v === 'ok').map(([m]) => short(m));
              const bad = entries.filter(([, v]) => v !== 'ok');
              const allDown = okModels.length === 0;
              const hasDaily = bad.some(([, v]) => v === 'sem cota hoje');
              const hasWait = bad.some(([, v]) => v === 'em espera');

              let badgeText = 'OK';
              let statusText = `Disponível: ${okModels.join(', ')}`;
              let statusColor = G.muted;
              let cardBorder = G.border;
              let badgeColor = G.accent;

              if (allDown) {
                badgeText = 'INDISPONÍVEL';
                statusText = k.lastError ? String(k.lastError).replace(/\s+/g, ' ').slice(0, 90) : 'Sem acesso a nenhum modelo.';
                statusColor = '#ef4444'; cardBorder = 'rgba(239, 68, 68, 0.6)'; badgeColor = '#ef4444';
              } else if (hasDaily || hasWait || bad.length > 0) {
                badgeText = hasDaily ? 'PARCIAL' : hasWait ? 'AGUARDANDO' : 'PARCIAL';
                statusText = `Fora: ${bad.map(([m, v]) => `${short(m)} (${v})`).join(', ')}`;
                statusColor = '#f59e0b'; cardBorder = 'rgba(245, 158, 11, 0.5)'; badgeColor = '#f59e0b';
              }

              return (
                <div key={k.id} style={{
                  background: G.surface, borderRadius: '10px', padding: '8px 10px', border: `1px solid ${k.paid ? '#f0b429' : cardBorder}`,
                  display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: G.text, fontWeight: 500 }}>
                      API #{idx + 1} ({k.fim}) {k.paid && <span style={{ color: '#f0b429' }}>💰 PAGA</span>}
                    </span>
                    <span style={{ fontSize: '9px', color: badgeColor, fontWeight: '600' }}>{badgeText}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: statusColor, textAlign: 'left', marginTop: '2px' }}>{statusText}</div>
                </div>
              );
            })}
          </div>
        </div>
    </>
  );
}
