// @ts-nocheck
import { useApp } from '../AppContext';
import ReactCrop from 'react-image-crop';
import { G } from '../lib/theme';

export default function CropModal() {
  const { applyCrop, applyImagePreset, crop, croppedImgRef, file, imageBrightness, imageContrast, imagePreset, imageSaturation, isCropping, isFineTuningOpen, isGrayscale, preview, rotateImage90, setCompletedCrop, setCrop, setCroppingPageIndex, setImageBrightness, setImageContrast, setImagePreset, setImageSaturation, setIsBatchModalOpen, setIsCropping, setIsFineTuningOpen, setIsGrayscale, skipCropAndAddPage } = useApp();
  return (
    <>
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
            
            <div className="modal-actions" style={{marginTop: 16, display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <div style={{display: 'flex', gap: '10px', width: '100%'}}>
                <button className="modal-btn cancel" style={{flex: 1, padding: '10px 8px', fontSize: '12px'}} onClick={skipCropAndAddPage}>Utilizar Sem Cortar (Aplica Filtro)</button>
                <button className="modal-btn capture" style={{flex: 1, padding: '10px 8px', fontSize: '12px'}} onClick={applyCrop}>Confirmar e Salvar Página</button>
              </div>
              <button 
                className="modal-btn" 
                style={{
                  background: 'transparent', 
                  border: `1px solid ${G.border}`, 
                  color: G.text, 
                  fontSize: '11px', 
                  padding: '8px', 
                  width: '100%',
                  cursor: 'pointer',
                  borderRadius: '8px'
                }}
                onClick={() => {
                  setIsCropping(false);
                  setCroppingPageIndex(null);
                  setIsBatchModalOpen(true);
                }}
              >
                ← Voltar sem Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
