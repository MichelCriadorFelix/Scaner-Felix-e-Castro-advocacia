// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { G } from '../lib/theme';

interface InAppCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapturePage: (blob: Blob) => void;
  onFinishBatch: () => void;
  pageCount: number;
  onFallbackNative?: () => void;
}

export default function InAppCameraModal({
  isOpen,
  onClose,
  onCapturePage,
  onFinishBatch,
  pageCount,
  onFallbackNative,
}: InAppCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCapturing, setIsCapturing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Iniciar e parar a câmera
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isCancelled = false;

    async function startCamera() {
      try {
        setErrorMsg(null);
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Câmera no navegador não suportada neste aparelho.');
        }

        // Tenta resolução 1920x1080 (FullHD) com fallback automático
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Checar suporte a lanterna/flash
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as any;
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        }

        setHasPermission(true);
      } catch (err: any) {
        console.warn('[Camera] Falha ao iniciar câmera no navegador:', err);
        setHasPermission(false);
        setErrorMsg(err?.message || 'Permissão de câmera negada ou indisponível.');
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (lastThumb) {
      try { URL.revokeObjectURL(lastThumb); } catch (_) {}
      setLastThumb(null);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Erro ao alternar lanterna:', e);
      }
    }
  };

  const switchCamera = () => {
    stopCamera();
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleCapture = async () => {
    if (!videoRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 120);

      if (navigator?.vibrate) {
        try { navigator.vibrate(50); } catch (_) {}
      }

      const video = videoRef.current;
      const vW = video.videoWidth || 1920;
      const vH = video.videoHeight || 1080;

      // Limitar a dimensão máxima em 1600px para economizar memória e acelerar OCR
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(vW, vH));
      const targetW = Math.max(1, Math.round(vW * scale));
      const targetH = Math.max(1, Math.round(vH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao criar canvas');

      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(video, 0, 0, targetW, targetH);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
      );

      // Libera memória de imediato
      canvas.width = 0;
      canvas.height = 0;

      if (blob) {
        setLastThumb((prev) => {
          if (prev) {
            try { URL.revokeObjectURL(prev); } catch (_) {}
          }
          return URL.createObjectURL(blob);
        });
        onCapturePage(blob);
      }
    } catch (err) {
      console.error('[Camera] Erro ao capturar foto:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Efeito de Flash na Captura */}
      {shutterFlash && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.85)',
            zIndex: 100,
            pointerEvents: 'none',
            transition: 'opacity 0.12s ease-out',
          }}
        />
      )}

      {/* Topo: Controles e Indicador de Páginas */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
          zIndex: 10,
        }}
      >
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          ✕
        </button>

        {/* Badge de Páginas Capturadas */}
        <div
          style={{
            background: 'rgba(201, 168, 76, 0.2)',
            border: `1px solid ${G.accent}`,
            padding: '6px 14px',
            borderRadius: '20px',
            color: G.accent,
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span>📑</span>
          <span>{pageCount} {pageCount === 1 ? 'página' : 'páginas'}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {hasTorch && (
            <button
              onClick={toggleTorch}
              style={{
                background: torchOn ? G.accent : 'rgba(255,255,255,0.15)',
                color: torchOn ? '#000' : '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '42px',
                height: '42px',
                fontSize: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}
            >
              ⚡
            </button>
          )}

          <button
            onClick={switchCamera}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '42px',
              height: '42px',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Área Central: Viewfinder da Câmera com Guias para Documentos */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Guia Visual Retangular para Enquadramento do Documento A4 */}
        <div
          style={{
            position: 'absolute',
            width: '84%',
            maxWidth: '380px',
            aspectRatio: '1 / 1.414', // Proporção da folha A4
            borderRadius: '14px',
            border: `2px dashed rgba(201, 168, 76, 0.65)`,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.5)',
              padding: '4px 10px',
              borderRadius: '6px',
              textAlign: 'center',
            }}
          >
            Enquadre o documento aqui
          </div>
        </div>

        {/* Caso a permissão tenha falhado */}
        {hasPermission === false && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 17, 23, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              gap: '16px',
            }}
          >
            <span style={{ fontSize: '40px' }}>📷</span>
            <div style={{ color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>
              Acesso à câmera bloqueado ou indisponível
            </div>
            <p style={{ color: G.muted, fontSize: '12px', maxWidth: '300px', lineHeight: '1.4' }}>
              {errorMsg || 'Autorize a câmera nas permissões do navegador ou utilize o envio pela galeria.'}
            </p>
            {onFallbackNative && (
              <button
                onClick={() => {
                  stopCamera();
                  onClose();
                  onFallbackNative();
                }}
                style={{
                  background: G.accent,
                  color: '#000',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Tentar Câmera do Sistema / Galeria
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra Inferior: Gatilho de Disparo Contínuo e Conclusão */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px 24px 30px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          zIndex: 10,
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Miniatura da última página capturada */}
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '8px',
              background: lastThumb ? 'transparent' : 'rgba(255,255,255,0.1)',
              border: `1.5px solid ${G.border}`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {lastThumb ? (
              <img src={lastThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '18px', opacity: 0.4 }}>📄</span>
            )}
          </div>

          {/* Botão de Disparo / Captura */}
          <button
            onClick={handleCapture}
            disabled={isCapturing || hasPermission === false}
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: '#fff',
              border: `4px solid ${G.accent}`,
              boxShadow: '0 0 20px rgba(201, 168, 76, 0.4)',
              cursor: isCapturing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transform: isCapturing ? 'scale(0.92)' : 'scale(1)',
              transition: 'transform 0.1s ease',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: G.accent,
              }}
            />
          </button>

          {/* Botão de Concluir Lote */}
          {pageCount > 0 ? (
            <button
              onClick={() => {
                stopCamera();
                onClose();
                onFinishBatch();
              }}
              style={{
                background: G.accent,
                color: '#000',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>Concluir</span>
              <span>✓</span>
            </button>
          ) : (
            <div style={{ width: '52px' }} />
          )}
        </div>

        {/* Dica para escaneamento contínuo */}
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textAlign: 'center' }}>
          💡 Toque no botão dourado para capturar cada página sem sair da câmera.
        </div>
      </div>
    </div>
  );
}
