// @ts-nocheck
import { useApp } from '../AppContext';
import { G } from '../lib/theme';

export default function MoveItemModal() {
  const { clients, isMovingBatch, moveBatchDocumentsHandler, moveDocumentHandler, moveSearch, movingItem, selectedDocIds, setIsMovingBatch, setMoveSearch, setMovingItem } = useApp();
  return (
    <>
{(movingItem || isMovingBatch) && (
        <div className="modal-overlay" style={{zIndex: 120}}>
          <div style={{background: G.card, padding: '22px', borderRadius: '16px', width: '90%', maxWidth: '400px', border: `1px solid ${G.border}`, boxShadow: '0 16px 40px rgba(0,0,0,0.5)'}}>
            <h3 style={{marginBottom: 8, fontSize: '17px', fontWeight: 600, color: G.accent, textAlign: 'center'}}>
              {isMovingBatch ? `📁 Mover ${selectedDocIds.length} Documentos em Lote` : 'Mover Documento'}
            </h3>
            <p style={{fontSize: '12px', color: G.muted, marginBottom: '16px', textAlign: 'center', lineHeight: '1.4'}}>
              {isMovingBatch ? (
                <>Selecione a pasta de destino para encaminhar os <strong>{selectedDocIds.length} documentos selecionados</strong> de uma vez só:</>
              ) : (
                <>Selecione o novo destino para: <br/> <strong>{movingItem.name}</strong></>
              )}
            </p>
            
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="🔍 Pesquisar pasta de destino..."
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

            <div style={{maxHeight: '42vh', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '18px'}}>
              <button 
                onClick={() => {
                  if (isMovingBatch) {
                    moveBatchDocumentsHandler('unassigned');
                  } else {
                    moveDocumentHandler(movingItem.id, 'unassigned');
                  }
                }}
                style={{
                  padding: '12px', borderRadius: '10px', 
                  background: (!isMovingBatch && movingItem?.clientId === 'unassigned') ? G.accent : G.surface, 
                  color: (!isMovingBatch && movingItem?.clientId === 'unassigned') ? '#000' : G.text, 
                  border: `1px solid ${G.border}`, cursor: 'pointer', textAlign: 'left', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span>📁</span>
                <span style={{ fontWeight: 500 }}>Geral (Sem pasta)</span>
              </button>
              {clients
                .filter(c => c.name.toLowerCase().includes(moveSearch.toLowerCase()))
                .map(c => (
                  <button 
                    key={c.id}
                    onClick={() => {
                      if (isMovingBatch) {
                        moveBatchDocumentsHandler(c.id);
                      } else {
                        moveDocumentHandler(movingItem.id, c.id);
                      }
                    }}
                    style={{
                      padding: '12px', 
                      paddingLeft: c.parentId ? '32px' : '12px',
                      borderRadius: '10px', 
                      background: (!isMovingBatch && movingItem?.clientId === c.id) ? G.accent : G.surface, 
                      color: (!isMovingBatch && movingItem?.clientId === c.id) ? '#000' : G.text, 
                      border: `1px solid ${G.border}`, 
                      cursor: 'pointer', 
                      textAlign: 'left', 
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>{c.parentId ? '↳ 📂' : '📂'}</span>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                  </button>
                ))}
            </div>

            <button 
              className="modal-btn cancel" 
              style={{width: '100%', padding: '10px', borderRadius: '8px', cursor: 'pointer'}} 
              onClick={() => {
                setMovingItem(null);
                setIsMovingBatch(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
