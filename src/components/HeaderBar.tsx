// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';
import { supabase } from '../lib/supabaseClient';

export default function HeaderBar() {
  const { history, setIsAuthSettingsOpen, setTab, setUser, showToast, tab, user } = useApp();
  return (
    <>
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
    </>
  );
}
