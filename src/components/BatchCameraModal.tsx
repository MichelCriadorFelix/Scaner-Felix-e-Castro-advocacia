// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';

export default function BatchCameraModal() {
  const { appendingDoc, batchDocName, cameraPages, clearCloudBatchSession, clients, compileCameraBatch, fileRefBatchImg, getStableThumbUrl, handleBatchImageAdd, handleEditPage, isBatchModalOpen, isFolderArchived, movePage, nativeCameraRef, pdfQuality, removePageFromCloudBackup, selectedClient, setAppendingDoc, setBatchDocName, setCameraPages, setIsBatchModalOpen, setPdfQuality, setSelectedClient, setViewingBatchPage, showToast, viewingBatchPage, viewingPageLoading, viewingPageUrl } = useApp();
  return (
    <>
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
                      {getStableThumbUrl(p) ? (
                        <img src={getStableThumbUrl(p)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                      ) : (
                        <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: G.muted, fontSize: '10px'}}>...</div>
                      )}
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
                 {clients.filter(c => !isFolderArchived(c) || c.id === selectedClient).map(c => <option key={c.id} value={c.id}>{isFolderArchived(c) ? '📦 ' : ''}{c.parentId ? '↳ ' : ''}{c.name}{isFolderArchived(c) ? ' (arquivada)' : ''}</option>)}
               </select>
            </div>

            <div className="modal-actions" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', gap: '8px'}}>
                <button 
                  className="modal-btn" 
                  style={{flex: 1, background: `${G.accent}12`, color: G.accent, border: `1px solid ${G.accent}`, fontSize: '12px', fontWeight: 'bold'}} 
                  onClick={() => { setIsBatchModalOpen(false); nativeCameraRef.current?.click(); }}
                >
                  📸 Câmera do Celular
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
                  clearCloudBatchSession();
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
                   removePageFromCloudBackup(cameraPages[viewingBatchPage]);
                   setCameraPages(prev => prev.filter((_, idx) => idx !== viewingBatchPage));
                   setViewingBatchPage(null);
                   if (cameraPages.length === 1) setIsBatchModalOpen(false); // fechar se for a última
                 }} style={{background: G.error, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer'}}>🗑️ Excluir Página</button>
              </div>
              <div style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '16px', overflow: 'hidden', position: 'relative'}}>
                 {viewingPageLoading ? (
                   <div style={{color: G.text, fontSize: '13px', textAlign: 'center'}}>⏳ Baixando página da nuvem...</div>
                 ) : (
                   <img
                      src={viewingPageUrl || ""}
                      style={{maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${G.border}`}}
                      onClick={() => handleEditPage(viewingBatchPage)}
                      title="Clique na imagem para recortar/tratar"
                   />
                 )}

                 <div style={{ marginTop: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                     <button 
                        onClick={() => handleEditPage(viewingBatchPage)}
                        style={{
                          background: G.accent,
                          color: '#000',
                          border: 'none',
                          padding: '10px 24px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '13px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                        }}
                     >
                        ✂️ Recortar / Ajustar Imagem
                     </button>
                     
                     {/* Setinhas dentro do modal de visualização individual */}
                     <div style={{display: 'flex', gap: '30px'}}>
                         <button 
                            disabled={viewingBatchPage === 0} 
                            onClick={() => { movePage(viewingBatchPage, -1); setViewingBatchPage(viewingBatchPage - 1); }}
                            style={{background: viewingBatchPage === 0 ? '#444' : G.accent, color: '#000', padding: '10px 16px', borderRadius: '50%', border: 'none', cursor: viewingBatchPage === 0 ? 'not-allowed' : 'pointer', opacity: viewingBatchPage === 0 ? 0.4 : 1, fontSize: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}
                         >◀</button>
                         <button 
                            disabled={viewingBatchPage === cameraPages.length - 1} 
                            onClick={() => { movePage(viewingBatchPage, 1); setViewingBatchPage(viewingBatchPage + 1); }}
                            style={{background: viewingBatchPage === cameraPages.length - 1 ? '#444' : G.accent, color: '#000', padding: '10px 16px', borderRadius: '50%', border: 'none', cursor: viewingBatchPage === cameraPages.length - 1 ? 'not-allowed' : 'pointer', opacity: viewingBatchPage === cameraPages.length - 1 ? 0.4 : 1, fontSize: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}
                         >▶</button>
                     </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
