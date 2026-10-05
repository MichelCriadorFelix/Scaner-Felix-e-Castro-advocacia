// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';
import { formatDate, forceDownload } from '../lib/browserHelpers';
import { getRealConfidence, detectFailedPages } from '../lib/textQuality';
import { supabase } from '../lib/supabaseClient';

export default function HistoryTab() {
  const { clientSearch, clients, compileFolderTXT, deleteBatchDocumentsHandler, deleteClientHandler, deleteFromHistory, docSearch, downloadFolderPDFsZip, effectiveFolderTab, handleCreateClient, handleDownloadLite, handleDownloadTXTFromHistory, handleRenameClient, handleRenameDocument, history, isCreatingClient, isFolderArchived, loadFromHistory, newClientName, newClientRenameValue, newDocumentName, processFolderOCR, processHistoryItem, renamingClient, renamingItem, selectedDocIds, setClientSearch, setDocSearch, setFolderTab, setIsCreatingClient, setIsMovingBatch, setMovingItem, setNewClientName, setNewClientRenameValue, setNewDocumentName, setRenamingClient, setRenamingItem, setSelectedDocIds, setSortOrder, setViewingClient, sortOrder, tab, toggleArchiveClient, viewingClient } = useApp();
  return (
    <>
{tab === "history" && (
            <div className="history-panel">
              {viewingClient === null ? (
                // View: Lista de Pastas
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Pastas de Clientes</h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      onClick={() => setIsCreatingClient(true)}
                      style={{ background: G.accent, color: '#000', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                    >
                      + Nova Pasta
                    </button>
                    </div>
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

                  {(() => {
                    const archivedTotal = clients.filter(c => !c.parentId && c.archived).length;
                    if (archivedTotal === 0) return null;
                    const activeTotal = clients.filter(c => !c.parentId && !c.archived).length;
                    const tabStyle = (on: boolean) => ({
                      flex: 1, padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 as const,
                      border: `1px solid ${on ? G.accent : G.border}`,
                      background: on ? 'rgba(212, 175, 55, 0.12)' : G.card,
                      color: on ? G.accent : G.muted,
                    });
                    return (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <button onClick={() => setFolderTab('active')} style={tabStyle(effectiveFolderTab === 'active')}>📂 Ativas ({activeTotal})</button>
                        <button onClick={() => setFolderTab('archived')} style={tabStyle(effectiveFolderTab === 'archived')}>📦 Arquivadas ({archivedTotal})</button>
                      </div>
                    );
                  })()}

                  {clientSearch.trim() !== "" && (() => {
                    const q = clientSearch.toLowerCase();
                    const inOtherTab = clients.filter(c => c.name.toLowerCase().includes(q) && isFolderArchived(c) !== (effectiveFolderTab === 'archived')).length;
                    return inOtherTab > 0 ? (
                      <div style={{ fontSize: '12px', color: G.muted, marginBottom: '12px' }}>
                        {inOtherTab} resultado(s) na aba {effectiveFolderTab === 'archived' ? 'Ativas' : 'Arquivadas'}.
                      </div>
                    ) : null;
                  })()}

                  <div className="folders-grid">
                    {clientSearch.trim() === "" && effectiveFolderTab === 'active' && (
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
                      ? clients.filter(c => !c.parentId && isFolderArchived(c) === (effectiveFolderTab === 'archived'))
                      : clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) && isFolderArchived(c) === (effectiveFolderTab === 'archived'))
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
                          <div style={{ fontSize: '24px' }}>{c.archived ? '📦' : '📂'}</div>
                          <div style={{ flex: 1 }}>
                            {renamingClient?.id === c.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                <input 
                                  autoFocus
                                  type="text"
                                  value={newClientRenameValue}
                                  onChange={e => setNewClientRenameValue(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleRenameClient()}
                                  style={{ background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '6px 8px', borderRadius: '6px', color: G.text, width: '100%', fontSize: '13px' }}
                                />
                                <button onClick={(e) => { e.stopPropagation(); handleRenameClient(); }} style={{ background: G.success, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
                                <button onClick={(e) => { e.stopPropagation(); setRenamingClient(null); }} style={{ background: 'transparent', border: `1px solid ${G.border}`, color: G.muted, borderRadius: '6px', padding: '6px 8px', fontSize: '11px', cursor: 'pointer' }}>Cancelar</button>
                              </div>
                            ) : (
                              <div style={{ fontWeight: 500, color: G.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{c.name}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingClient(c);
                                    setNewClientRenameValue(c.name);
                                  }}
                                  style={{ background: 'none', border: 'none', color: G.muted, cursor: 'pointer', padding: '2px 4px', fontSize: '13px' }}
                                  title="Renomear Pasta"
                                >✏️</button>
                              </div>
                            )}
                            {parent && (
                              <div style={{ fontSize: '11px', color: G.accent, marginTop: '2px' }}>
                                ↳ Subpasta de: {parent.name}
                              </div>
                            )}
                            <div style={{ fontSize: '12px', color: G.muted, marginTop: '2px' }}>
                              {docsCount} documentos {subfoldersCount > 0 ? `• ${subfoldersCount} subpasta${subfoldersCount>1?'s':''}` : ''}
                            </div>
                          </div>
                          {!c.parentId && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleArchiveClient(c); }}
                              style={{ background: 'none', border: 'none', color: G.muted, cursor: 'pointer', padding: '4px', fontSize: '16px' }}
                              title={c.archived ? "Desarquivar Pasta" : "Arquivar Pasta"}
                            >{c.archived ? '♻️' : '📦'}</button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteClientHandler(c.id, c.name); }}
                            style={{ background: 'none', border: 'none', color: G.error, cursor: 'pointer', padding: '4px', fontSize: '16px' }}
                            title="Excluir Pasta"
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
                      
                      {renamingClient?.id === viewingClient ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
                          <input 
                            autoFocus
                            type="text"
                            value={newClientRenameValue}
                            onChange={e => setNewClientRenameValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleRenameClient()}
                            style={{ background: G.bg, border: `1px solid ${G.border}`, outline: 'none', padding: '6px 10px', borderRadius: '6px', color: G.text, flex: 1, fontSize: '14px' }}
                          />
                          <button onClick={handleRenameClient} style={{ background: G.success, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
                          <button onClick={() => setRenamingClient(null)} style={{ background: 'transparent', border: `1px solid ${G.border}`, color: G.muted, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: G.accent }}>
                            {viewingClient === 'unassigned' ? "Geral (Sem pasta)" : clients.find(c => c.id === viewingClient)?.name}
                          </h3>
                          {viewingClient !== 'unassigned' && (
                            <button
                              onClick={() => {
                                const currentClient = clients.find(c => c.id === viewingClient);
                                if (currentClient) {
                                  setRenamingClient(currentClient);
                                  setNewClientRenameValue(currentClient.name);
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: G.muted, cursor: 'pointer', padding: '2px 6px', fontSize: '14px' }}
                              title="Renomear Pasta"
                            >✏️</button>
                          )}
                        </div>
                      )}

                      {viewingClient !== 'unassigned' && !renamingClient && (
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

                    {/* Barra de Busca e Ordenação Responsiva */}
                    <div className="folder-controls-bar">
                      <div className="folder-search-box">
                        <input
                          type="text"
                          placeholder="🔍 Pesquisar documento na pasta..."
                          value={docSearch}
                          onChange={e => setDocSearch(e.target.value)}
                          style={{
                            width: '100%',
                            height: '38px',
                            padding: '0 12px',
                            borderRadius: '10px',
                            border: `1px solid ${G.border}`,
                            background: G.bg,
                            color: G.text,
                            fontSize: '13px',
                            outline: 'none',
                          }}
                        />
                      </div>
                      
                      <div className="folder-sort-box">
                        <select 
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value)}
                          aria-label="Organizar documentos por"
                          style={{ 
                            width: '100%', 
                            height: '38px',
                            background: G.bg, 
                            color: G.text, 
                            border: `1px solid ${G.border}`, 
                            padding: '0 10px', 
                            borderRadius: '10px', 
                            fontSize: '13px', 
                            outline: 'none', 
                            cursor: 'pointer' 
                          }}
                        >
                          <option value="name-asc">🔤 Nome (1, 2, 10...)</option>
                          <option value="name-desc">🔤 Nome (Z-A)</option>
                          <option value="date-desc">🕒 Mais Recentes</option>
                          <option value="date-asc">🕒 Mais Antigos</option>
                        </select>
                      </div>
                    </div>

                    {/* Barra de Ações em Lote da Pasta (Clean, Simétrica & Responsiva) */}
                    {(() => {
                      const folderTotalDocs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient)).length;
                      if (folderTotalDocs === 0) return null;
                      return (
                        <div className="folder-actions-card">
                          <div className="folder-actions-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: G.text, letterSpacing: '0.04em' }}>⚡ AÇÕES DA PASTA</span>
                              <span style={{ fontSize: '11px', color: G.muted }}>({folderTotalDocs} {folderTotalDocs === 1 ? 'documento' : 'documentos'})</span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 600 }}>Otimizado para INSS &lt; 5MB • e-Proc &lt; 12MB</span>
                          </div>

                          <div className="folder-actions-grid">
                            <button 
                              onClick={() => downloadFolderPDFsZip('lite')}
                              className="folder-action-btn primary"
                              title="Baixar todos os documentos em versão Lite de alta qualidade (Arquivos <5MB para INSS e <12MB para e-Proc)"
                            >
                              <span>🪶</span>
                              <span>Baixar Todos (Lite)</span>
                            </button>
                            <button 
                              onClick={() => downloadFolderPDFsZip('original')}
                              className="folder-action-btn secondary"
                              title="Baixar todos os arquivos originais sem compressão"
                            >
                              <span>📦</span>
                              <span>Baixar Originais</span>
                            </button>
                            <button 
                              onClick={processFolderOCR}
                              className="folder-action-btn secondary"
                              title="Executar reconhecimento de texto (OCR) em lote em todos os documentos da pasta"
                            >
                              <span>🧠</span>
                              <span>Processar OCR em Lote</span>
                            </button>
                            <button 
                              onClick={compileFolderTXT}
                              className="folder-action-btn secondary"
                              title="Compilar e baixar todo o texto extraído da pasta em arquivo TXT"
                            >
                              <span>📑</span>
                              <span>Baixar Textos (TXT)</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {clients.filter(c => c.parentId === viewingClient).length > 0 && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: G.muted, padding: '0 8px', marginBottom: '8px', textTransform: 'uppercase' }}>Subpastas</div>
                      <div className="folders-grid" style={{ marginBottom: '16px' }}>
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

                    const sortedDocs = [...filteredDocs].sort((a, b) => {
                      if (sortOrder === "date-desc") return new Date(b.ts).getTime() - new Date(a.ts).getTime();
                      if (sortOrder === "date-asc") return new Date(a.ts).getTime() - new Date(b.ts).getTime();
                      if (sortOrder === "name-asc") return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                      if (sortOrder === "name-desc") return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
                      return 0;
                    });

                    const visibleDocIds = sortedDocs.map(d => d.id);
                    const selectedVisibleCount = visibleDocIds.filter(id => selectedDocIds.includes(id)).length;
                    const isAllVisibleSelected = visibleDocIds.length > 0 && selectedVisibleCount === visibleDocIds.length;

                    return (
                      <>
                        {/* Barra de Ação em Lote Flutuante / Fixada quando há seleção */}
                        {selectedDocIds.length > 0 ? (
                          <div style={{
                            background: 'linear-gradient(135deg, rgba(201, 168, 76, 0.16) 0%, rgba(201, 168, 76, 0.06) 100%)',
                            border: `1.5px solid ${G.accent}`,
                            borderRadius: '12px',
                            padding: '12px 16px',
                            marginBottom: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isAllVisibleSelected}
                                  onChange={() => {
                                    if (isAllVisibleSelected) {
                                      setSelectedDocIds(prev => prev.filter(id => !visibleDocIds.includes(id)));
                                    } else {
                                      setSelectedDocIds(prev => Array.from(new Set([...prev, ...visibleDocIds])));
                                    }
                                  }}
                                  style={{ width: '18px', height: '18px', accentColor: G.accent, cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '13px', fontWeight: 700, color: G.accent }}>
                                  {selectedDocIds.length} {selectedDocIds.length === 1 ? 'documento selecionado' : 'documentos selecionados'}
                                </span>
                              </label>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => setIsMovingBatch(true)}
                                style={{
                                  background: G.accent,
                                  color: '#0d0f14',
                                  border: 'none',
                                  borderRadius: '8px',
                                  padding: '8px 14px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 8px rgba(201, 168, 76, 0.35)',
                                  transition: 'all .2s'
                                }}
                                title="Encaminhar todos os documentos selecionados para outra pasta"
                              >
                                <span>📁</span>
                                <span>Mover para Pasta ({selectedDocIds.length})</span>
                              </button>

                              <button
                                onClick={deleteBatchDocumentsHandler}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                                title="Excluir documentos selecionados permanentemente"
                              >
                                <span>🗑️</span>
                                <span>Excluir</span>
                              </button>

                              <button
                                onClick={() => setSelectedDocIds([])}
                                style={{
                                  background: 'transparent',
                                  color: G.muted,
                                  border: `1px solid ${G.border}`,
                                  borderRadius: '8px',
                                  padding: '8px 12px',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                Desmarcar todos
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Barra Discreta de Seleção Rápida */
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 6px',
                            marginBottom: '8px'
                          }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: G.muted }}>
                              <input
                                type="checkbox"
                                checked={isAllVisibleSelected}
                                onChange={() => {
                                  if (isAllVisibleSelected) {
                                    setSelectedDocIds(prev => prev.filter(id => !visibleDocIds.includes(id)));
                                  } else {
                                    setSelectedDocIds(prev => Array.from(new Set([...prev, ...visibleDocIds])));
                                  }
                                }}
                                style={{ width: '16px', height: '16px', accentColor: G.accent, cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 500 }}>Selecionar todos os {sortedDocs.length} documentos</span>
                            </label>

                            <span style={{ fontSize: '11px', color: G.muted }}>
                              Marque os documentos que deseja encaminhar em lote
                            </span>
                          </div>
                        )}

                        {sortedDocs.map(item => {
                          const isSelected = selectedDocIds.includes(item.id);
                          return (
                            <div 
                              key={item.id} 
                              className="hist-card" 
                              onClick={() => loadFromHistory(item)}
                              style={{
                                borderColor: isSelected ? G.accent : undefined,
                                background: isSelected ? 'rgba(201, 168, 76, 0.05)' : undefined,
                                boxShadow: isSelected ? `0 0 0 1px ${G.accent}` : undefined,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div className="hist-header">
                                {/* Caixinha de Seleção em Lote */}
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDocIds(prev => 
                                      prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                                    );
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    alignSelf: 'center',
                                    padding: '6px 6px 6px 2px',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                  }}
                                  title={isSelected ? "Desmarcar este documento" : "Selecionar este documento para mover em lote"}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      accentColor: G.accent,
                                      cursor: 'pointer',
                                      borderRadius: '4px'
                                    }}
                                  />
                                </div>

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

                            {/* Alerta inteligente de páginas puladas e botão de reparação automática.
                                Se o texto do item ainda não foi carregado (lista lazy-load), usa o campo
                                has_failed_pages calculado no servidor pra mostrar o aviso mesmo sem abrir o documento. */}
                            {(() => {
                              const textLoaded = item.text !== undefined && item.text !== null && item.text !== "";
                              const uniqFailed = textLoaded ? detectFailedPages(item.text) : [];
                              const hasIssue = textLoaded ? uniqFailed.length > 0 : !!item.hasFailedPages;
                              if (hasIssue) {
                                const label = uniqFailed.length > 0
                                  ? `Pág(s) pulada(s): ${uniqFailed.join(', ')}`
                                  : `Documento com página(s) com falha — abra para ver quais`;
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
                                      <span>⚠️</span> <span>{label}</span>
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
                                {(item.fileUrl || item.localBlobUrl) && (
                                  <button 
                                    className="icon-btn" 
                                    title="Baixar Versão Lite (<5MB INSS / <12MB e-Proc com alta qualidade)" 
                                    onClick={(e) => { e.stopPropagation(); handleDownloadLite(item); }}
                                    style={{ color: '#0284c7', fontWeight: 800, fontSize: '13px' }}
                                  >
                                    🪶
                                  </button>
                                )}
                                <button className="icon-btn" title="Mover Pasta" onClick={(e) => { e.stopPropagation(); setMovingItem(item); }}>📂</button>
                                {(item.fileUrl || item.localBlobUrl) && (
                                   <button onClick={(e) => { e.stopPropagation(); forceDownload(item.fileUrl || item.localBlobUrl, item.name, supabase); }} className="icon-btn" title="Baixar Original" style={{border: 'none', background: 'transparent', cursor: 'pointer', padding: 0}}>⬇️</button>
                                )}
                                {/* Botão de Refazer OCR (Sempre força releitura direta via IA Jurídica ignorando cache) */}
                                <button 
                                  className="icon-btn" 
                                  style={{
                                    background: !hasOcr ? G.accent : 'transparent', 
                                    color: !hasOcr ? '#000' : G.muted,
                                    border: !hasOcr ? 'none' : `1px solid ${G.border}`,
                                    fontWeight: 'bold'
                                  }} 
                                  title="Refazer OCR via IA Jurídica (Forçar Releitura sem Cache)" 
                                  onClick={(e) => { e.stopPropagation(); processHistoryItem(item, true); }}
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
                    );
                  })}
                </>
              );
            })()}
                </div>
              )}
            </div>
          )}
    </>
  );
}
