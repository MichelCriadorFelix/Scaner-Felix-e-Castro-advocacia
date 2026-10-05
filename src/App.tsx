// @ts-nocheck
// Félix & Castro - Scanner e Compilador Jurídico v2.4 (Fix: buildAuditFormattedReport + Batch Select)
import { useState, useRef, useEffect, useCallback } from "react";

import 'react-image-crop/dist/ReactCrop.css';

import JSZip from 'jszip';

import { get, set, del } from 'idb-keyval';

import { checkDailyReset, setForcePaidKeyEnabled } from './lib/apiKeys';
import { fetchServerKeyStatus } from './lib/serverOcr';
import { getSelectedGeminiModel, setSelectedGeminiModel, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY } from './lib/geminiModels';
import { setHardHandwritingEnabled, setOcrContextClientName, wantsHighResImage, isHardHandwritingEnabled } from './lib/handwritingMode';
import { IdentityDivergence, generateFolderPrePetitionAudit, generateAiConsistencyAudit, pickConfidentWinner, applyValueCorrection, pickDominantValue, buildAuditFormattedReport } from './lib/audit';
import { supabase } from './lib/supabaseClient';
import { G, css } from './lib/theme';
import { compressImage, compressPDF } from './lib/pdfCompress';
import { fetchItemBlob, convertSingleImageToPDF, extractPDFHybrid, extractImageHybrid } from './lib/documentExtract';
import { calculateDocumentHash, getCachedOCR, setCachedOCR } from './lib/ocrCache';
import { detectFailedPages, extractStructuredTextFromPDFPage, isGenuineDigitalText, getRealConfidence, cleanRepeatedWordsInName } from './lib/textQuality';
import { loadPDFJS, PDFJS_BASE_OPTIONS } from './lib/loaders';
import { enhanceImageForGemini } from './lib/image';
import { extractPageWithGemini } from './lib/geminiExtract';
import { replacePageTextInDoc, refineTextWithGemini, refineCompiledTextWithGemini } from './lib/refine';
import { downloadTXT, formatDate } from './lib/browserHelpers';
import { AppContext } from './AppContext';
import CropModal from './components/CropModal';
import BatchCameraModal from './components/BatchCameraModal';
import MoveItemModal from './components/MoveItemModal';
import HeaderBar from './components/HeaderBar';
import ApiStatusPanel from './components/ApiStatusPanel';
import ScannerTab from './components/ScannerTab';
import HistoryTab from './components/HistoryTab';
import CompileModal from './components/CompileModal';


// ── Componente principal ──────────────────────────────────────────────────────
export default function ScannerJuridico() {
  // Garante reset diário de cotas na inicialização do app
  checkDailyReset();
  const [tab, setTab] = useState("scanner");
  // Modelo Gemini escolhido pelo advogado (persiste no localStorage) — deixa trocar na hora
  // pra qual estiver "mais livre"/rápido no momento, sem precisar mexer em código.
  const [selectedModel, setSelectedModelState] = useState(() => getSelectedGeminiModel());
  const handleModelChange = (model: string) => {
    setSelectedGeminiModel(model);
    setSelectedModelState(model);
  };
  const [showApiKeyDetails, setShowApiKeyDetails] = useState(false);
  // Força o uso da chave paga (ignora até status de erro travado). Nasce sempre DESMARCADA
  // ao abrir/atualizar o app (nunca persiste em localStorage de propósito) — a chave paga
  // só é usada quando o advogado marca isso explicitamente na sessão atual.
  const [forcePaidKey, setForcePaidKey] = useState(false);
  const [hardHandwriting, setHardHandwriting] = useState(false);
  const handleHardHandwritingChange = (checked: boolean) => {
    setHardHandwriting(checked);
    setHardHandwritingEnabled(checked);
  };
  const handleForcePaidKeyChange = (checked: boolean) => {
    setForcePaidKey(checked);
    setForcePaidKeyEnabled(checked);
  };
  const [file, setFile] = useState(null);
  const [queue, setQueue] = useState([]); // Fila de arquivos para processamento em massa
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isRefiningText, setIsRefiningText] = useState(false);
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
  const [renamingClient, setRenamingClient] = useState<any | null>(null);
  const [newClientRenameValue, setNewClientRenameValue] = useState("");
  const [sortOrder, setSortOrder] = useState("name-asc"); // "date-desc", "date-asc", "name-asc", "name-desc"
  
  // Novas variáveis de estado para busca de clientes e documentos (para fácil navegação com o crescimento do app)
  const [moveSearch, setMoveSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [folderTab, setFolderTab] = useState<'active' | 'archived'>('active');
  const [docSearch, setDocSearch] = useState("");

  // Estados para Modal de Progresso da Compilação
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationTotal, setCompilationTotal] = useState(0);
  const [compilationCurrentIndex, setCompilationCurrentIndex] = useState(0);
  const [compilationStatusText, setCompilationStatusText] = useState("");
  const [compilationLogs, setCompilationLogs] = useState<string[]>([]);
  const [pendingStrategicReview, setPendingStrategicReview] = useState<{
    alerts: string[];
    // undefined pros alertas só informativos vindos da auditoria geral de IA (sem
    // candidatos pra corrigir automaticamente, ao contrário dos de CPF/RG/CRM)
    divergences: (IdentityDivergence | undefined)[];
    resolve: (result: { keptAlerts: string[]; corrections: { candidates: string[]; chosenValue: string }[] }) => void;
  } | null>(null);
  const [selectedStrategicAlerts, setSelectedStrategicAlerts] = useState<number[]>([]);
  // Por índice do alerta: valor escolhido pelo advogado pra corrigir a divergência ('' = não corrigir)
  const [divergenceChoices, setDivergenceChoices] = useState<Record<number, string>>({});
  // Por índice do alerta: texto digitado manualmente quando o advogado escolhe "outro valor"
  const [divergenceCustomText, setDivergenceCustomText] = useState<Record<number, string>>({});

  // Seleção e Gestão de Documentos em Lote
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isMovingBatch, setIsMovingBatch] = useState(false);

  useEffect(() => {
    if (!movingItem && !isMovingBatch) {
      setMoveSearch("");
    }
  }, [movingItem, isMovingBatch]);

  useEffect(() => {
    setDocSearch("");
    setSelectedDocIds([]);
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

  // Chaves Gemini ficam só no servidor: o painel mostra o estado que o servidor enxerga.
  const [serverKeys, setServerKeys] = useState([]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchServerKeyStatus().then((keys) => { if (!cancelled) setServerKeys(keys); });
    return () => { cancelled = true; };
  }, [user, showApiKeyDetails]);

  // Flow State para Escaneamento em Lote (Multi-Páginas)
  const [cameraPages, setCameraPages] = useState([]);

  // --- Backup em nuvem em tempo real das páginas do lote (rede de segurança extra) ---
  // IMPORTANTE: isso é só uma camada ADICIONAL de segurança. O rascunho local (IndexedDB,
  // cameraPages em memória) continua sendo a fonte principal, funcionando exatamente como
  // antes. Se o envio pra nuvem falhar (sem internet, erro, timeout), a página continua
  // garantida localmente — nada muda, nada se perde. O backup em nuvem só entra em jogo como
  // uma TERCEIRA rede de segurança, pro caso raro de perder o rascunho local por completo
  // (RAM zerada E IndexedDB evacuado pelo sistema por pouco armazenamento).
  const batchSessionIdRef = useRef<string>((() => {
    try {
      const existing = localStorage.getItem('lexscan_batch_session_id');
      if (existing) return existing;
      const fresh = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('lexscan_batch_session_id', fresh);
      return fresh;
    } catch (e) {
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  })());
  const pageCloudIdMapRef = useRef<WeakMap<any, string>>(new WeakMap());
  // Marca quais blobs já têm backup CONFIRMADO na nuvem — só esses podem ter a versão em
  // alta resolução liberada da memória depois. Nunca libera um blob sem backup confirmado.
  const uploadConfirmedRef = useRef<WeakSet<any>>(new WeakSet());
  // Cache de blobs já baixados de volta da nuvem (pra reabrir/editar/compilar uma página que
  // já teve a versão local liberada), pra não baixar a mesma página duas vezes.
  const cloudDownloadCacheRef = useRef<Map<string, any>>(new Map());

  const isCloudPageRef = (p: any) => !!(p && typeof p === "object" && p.__cloudRef);

  const getOrAssignPageCloudId = (page: any) => {
    if (isCloudPageRef(page)) return page.id;
    let id = pageCloudIdMapRef.current.get(page);
    if (!id) {
      id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      pageCloudIdMapRef.current.set(page, id);
    }
    return id;
  };

  // Baixa de volta a foto em alta resolução de uma página, se ela já tiver sido liberada da
  // memória (virou uma referência leve). Se ainda for um Blob local, devolve ele direto.
  const resolvePageBlob = async (page: any): Promise<any> => {
    if (!isCloudPageRef(page)) return page;
    const cache = cloudDownloadCacheRef.current;
    if (cache.has(page.path)) return cache.get(page.path);
    const { data, error } = await supabase.storage.from('ged-auditoria').download(page.path);
    if (error || !data) throw new Error("Não foi possível baixar esta página da nuvem: " + (error?.message || "erro desconhecido"));
    cache.set(page.path, data);
    return data;
  };

  // Envia UMA página pra nuvem em segundo plano, sem bloquear nada e sem lançar erro pra
  // fora — falha em silêncio (só loga) porque a segurança real já está garantida localmente.
  // Só ao confirmar sucesso é que essa página fica elegível pra ter a versão local liberada.
  const backupPageToCloudInBackground = (blob: any) => {
    if (!supabase) return;
    const id = getOrAssignPageCloudId(blob);
    const path = `drafts/${batchSessionIdRef.current}/${id}.jpg`;
    supabase.storage.from('ged-auditoria').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      .then(({ error }: any) => {
        if (error) { console.error("[Backup em nuvem] Falha ao enviar página (mantida local normalmente):", error); return; }
        uploadConfirmedRef.current.add(blob);
      })
      .catch((e: any) => console.error("[Backup em nuvem] Falha ao enviar página (mantida local normalmente):", e));
  };

  // Libera memória de páginas ANTIGAS do lote (todas menos as 2 mais recentes) que já têm
  // backup confirmado na nuvem — troca o Blob em alta resolução por uma referência leve com
  // só uma miniatura pequena, buscando o arquivo de volta na nuvem só se precisar editar
  // aquela página específica ou compilar o PDF final. Isso é o que impede a memória do
  // celular de crescer sem limite conforme o lote acumula páginas (o gatilho real do erro
  // "insuficiência de memória" a partir da 3ª/4ª foto em aparelhos com menos RAM disponível).
  useEffect(() => {
    if (!supabase) return;
    const KEEP_RAW_COUNT = 2;
    const releasable = cameraPages
      .slice(0, Math.max(0, cameraPages.length - KEEP_RAW_COUNT))
      .filter((p: any) => !isCloudPageRef(p) && uploadConfirmedRef.current.has(p));
    if (releasable.length === 0) return;

    (async () => {
      for (const blob of releasable) {
        try {
          const MAX_THUMB_DIM = 240;
          let thumbBlob: any = null;
          if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob, { resizeWidth: MAX_THUMB_DIM, resizeQuality: "high" });
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0);
              thumbBlob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.6));
            }
            bitmap.close();
            canvas.width = 0; canvas.height = 0;
          }
          const id = getOrAssignPageCloudId(blob);
          const path = `drafts/${batchSessionIdRef.current}/${id}.jpg`;
          const cloudRef = { __cloudRef: true, id, path, thumbBlob };
          if (thumbBlob) thumbUrlCacheRef.current.set(cloudRef, URL.createObjectURL(thumbBlob));
          setCameraPages((prev: any[]) => prev.map((p) => (p === blob ? cloudRef : p)));
        } catch (e) {
          console.error("[Backup em nuvem] Falha ao liberar página da memória (mantida local, sem risco):", e);
        }
      }
    })();
  }, [cameraPages]);

  const removePageFromCloudBackup = (page: any) => {
    if (!supabase) return;
    const path = isCloudPageRef(page) ? page.path : (() => {
      const id = pageCloudIdMapRef.current.get(page);
      return id ? `drafts/${batchSessionIdRef.current}/${id}.jpg` : null;
    })();
    if (!path) return;
    supabase.storage.from('ged-auditoria').remove([path]).catch(() => {});
  };

  // Reescreve a lista de ids na ordem atual — permite reconstruir o lote na ordem certa numa
  // recuperação via nuvem, mesmo que o advogado tenha reordenado ou apagado páginas.
  useEffect(() => {
    if (!supabase) return;
    if (cameraPages.length === 0) return;
    const ids = cameraPages.map((p: any) => getOrAssignPageCloudId(p));
    const manifestPath = `drafts/${batchSessionIdRef.current}/_manifest.json`;
    const manifestBlob = new Blob([JSON.stringify({ ids, updatedAt: Date.now() })], { type: 'application/json' });
    supabase.storage.from('ged-auditoria').upload(manifestPath, manifestBlob, { contentType: 'application/json', upsert: true }).catch(() => {});
  }, [cameraPages]);

  // Encerra a sessão de backup em nuvem do lote atual (lote finalizado ou descartado) — o
  // próximo lote começa numa pasta nova. Apaga os arquivos de rascunho já enviados, já que
  // não são mais necessários (documento finalizado já está salvo definitivamente, ou foi
  // descartado deliberadamente pelo advogado).
  const clearCloudBatchSession = async () => {
    try { localStorage.removeItem('lexscan_batch_session_id'); } catch (e) {}
    if (supabase) {
      try {
        const { data } = await supabase.storage.from('ged-auditoria').list(`drafts/${batchSessionIdRef.current}`);
        if (data && data.length > 0) {
          await supabase.storage.from('ged-auditoria').remove(data.map((f: any) => `drafts/${batchSessionIdRef.current}/${f.name}`));
        }
      } catch (e) { console.error("[Backup em nuvem] Falha ao limpar rascunho da nuvem:", e); }
    }
    batchSessionIdRef.current = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try { localStorage.setItem('lexscan_batch_session_id', batchSessionIdRef.current); } catch (e) {}
  };

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchDocName, setBatchDocName] = useState("Documento_Escaneado");
  const [pdfQuality, setPdfQuality] = useState("media"); // leve, media, alta
  const [appendingDoc, setAppendingDoc] = useState(null); // Documento original que está sendo expandido/continuado

  // --- Auto-Save & Recovery Draft for Multi-Page Scans ---
  const [hasRecoverableBatch, setHasRecoverableBatch] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    get('lexscan_camera_pages_draft').then((val) => {
      if (val && Array.isArray(val) && val.length > 0) {
        setHasRecoverableBatch(true);
      }
    }).catch(() => {});
  }, []);

  // Pede armazenamento "persistente" ao navegador: sem isso, o Android/Chrome pode apagar
  // sozinho os dados do rascunho de escaneamento (IndexedDB) quando o armazenamento INTERNO
  // do celular está quase cheio — mesmo sem o usuário mandar limpar nada, e mesmo que tudo
  // seja salvo na nuvem depois, porque o rascunho EM ANDAMENTO só existe localmente até ser
  // compilado. Também mede o quanto já falta de cota pra avisar o advogado ANTES de perder algo.
  useEffect(() => {
    if (navigator?.storage?.persist) {
      navigator.storage.persist().then((granted) => {
        console.log(`[Armazenamento] Persistência ${granted ? "concedida" : "NEGADA"} pelo navegador.`);
      }).catch(() => {});
    }
    if (navigator?.storage?.estimate) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        if (usage && quota && quota > 0 && (usage / quota) > 0.8) {
          setStorageWarning(`⚠️ O armazenamento do celular está quase cheio (${Math.round((usage / quota) * 100)}% da cota do navegador usada). Isso pode fazer o sistema apagar rascunhos de escaneamento em andamento antes de salvar. Libere espaço no aparelho (apague fotos/apps não usados) antes de escanear lotes grandes.`);
        }
      }).catch(() => {});
    }
  }, []);

  // Importante (pedido explícito do advogado): o aviso de "Escaneamento Recuperado" só pode
  // sumir se ele DESCARTAR sabendo do risco (discardDraft) ou se a recuperação REALMENTE
  // funcionar. Uma tentativa que falha (erro, travamento, ou rascunho vazio) NÃO pode fazer
  // o aviso desaparecer sozinho — senão a única cópia de segurança do lote se perde de vez.
  // Terceira rede de segurança: se o rascunho local (IndexedDB) realmente não existe mais,
  // tenta reconstruir o lote a partir do backup em nuvem (drafts/<sessão>/) antes de desistir.
  // Baixa uma página de cada vez (nunca em paralelo), do mesmo jeito seguro usado no resto do app.
  const tryRecoverFromCloud = async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const manifestPath = `drafts/${batchSessionIdRef.current}/_manifest.json`;
      const { data: manifestBlob, error: manifestErr } = await supabase.storage.from('ged-auditoria').download(manifestPath);
      if (manifestErr || !manifestBlob) return false;
      const manifest = JSON.parse(await manifestBlob.text());
      const ids: string[] = Array.isArray(manifest?.ids) ? manifest.ids : [];
      if (ids.length === 0) return false;

      setProcessing(true);
      const recovered: any[] = [];
      for (let i = 0; i < ids.length; i++) {
        setProgressMsg(`Recuperando página ${i + 1} de ${ids.length} da nuvem...`);
        const { data: pageBlob, error: pageErr } = await supabase.storage.from('ged-auditoria').download(`drafts/${batchSessionIdRef.current}/${ids[i]}.jpg`);
        if (!pageErr && pageBlob) {
          pageCloudIdMapRef.current.set(pageBlob, ids[i]);
          uploadConfirmedRef.current.add(pageBlob); // já veio da nuvem: elegível pra liberar de novo depois
          recovered.push(pageBlob);
        }
      }
      setProcessing(false);
      setProgressMsg("");

      if (recovered.length === 0) return false;

      setCameraPages(recovered);
      setIsBatchModalOpen(true);
      setHasRecoverableBatch(false);
      showToast(`✓ ${recovered.length} página(s) recuperada(s) da nuvem com sucesso!`, "success");
      return true;
    } catch (e) {
      console.error("[Backup em nuvem] Falha ao recuperar da nuvem:", e);
      setProcessing(false);
      setProgressMsg("");
      return false;
    }
  };

  const recoverDraft = async () => {
    try {
      const val = await get('lexscan_camera_pages_draft');
      if (val && Array.isArray(val) && val.length > 0) {
        setCameraPages(val);
        setIsBatchModalOpen(true);
        setHasRecoverableBatch(false); // só esconde o aviso aqui: a recuperação teve êxito de fato
        // Reenvia (idempotente) as páginas recuperadas que ainda são Blob puro — depois de um
        // crash/recarregamento, o app "esquece" quais já tinham backup confirmado, então sem
        // isso elas nunca ficariam elegíveis pra liberar da memória de novo (reintroduzindo o
        // mesmo acúmulo de RAM logo na recuperação, que é exatamente quando mais importa).
        val.forEach((p: any) => { if (!isCloudPageRef(p)) backupPageToCloudInBackground(p); });
        showToast(`✓ ${val.length} página(s) recuperada(s) com sucesso!`, "success");
        return;
      }
      // Rascunho local vazio/ausente — tenta a rede de segurança extra (backup em nuvem)
      // antes de avisar que perdeu, já que agora cada página é enviada em segundo plano.
      const recoveredFromCloud = await tryRecoverFromCloud();
      if (!recoveredFromCloud) {
        showToast("⚠️ Não foi possível recuperar: o rascunho não está mais disponível (nem localmente, nem na nuvem). Provavelmente o sistema do celular o apagou por falta de armazenamento interno. Libere espaço no aparelho.", "error");
      }
    } catch(e) {
      console.error("[Rascunho] Falha ao recuperar rascunho:", e);
      const recoveredFromCloud = await tryRecoverFromCloud();
      if (!recoveredFromCloud) {
        showToast("⚠️ Falha ao tentar recuperar. O aviso continua disponível — tente novamente, ou descarte se preferir recomeçar.", "error");
      }
    }
  };

  const discardDraft = async () => {
    try {
      await del('lexscan_camera_pages_draft');
    } catch (e) {}
    try {
      localStorage.removeItem('lexscan_camera_pages_draft');
    } catch (e) {}
    setCameraPages([]);
    setHasRecoverableBatch(false);
    clearCloudBatchSession(); // apaga também o backup em nuvem — descarte explícito e ciente do risco
    showToast("Rascunho descartado com sucesso!", "info");
  };

  const draftSaveWarnedRef = useRef(false);
  useEffect(() => {
    if (cameraPages && cameraPages.length > 0) {
      set('lexscan_camera_pages_draft', cameraPages).catch((e) => {
        console.error("[Rascunho] Falha ao salvar rascunho localmente:", e);
        if (!draftSaveWarnedRef.current) {
          draftSaveWarnedRef.current = true;
          showToast("⚠️ Armazenamento do celular cheio — o rascunho automático desta página pode não ter sido salvo. Finalize e salve o lote assim que possível.", "error");
        }
      });
    } else {
      del('lexscan_camera_pages_draft').catch(() => {});
    }
  }, [cameraPages]);

  // --- Memory Optimization & Anti-Crash Cache for Multi-Page Scans ---
  const blobUrlCacheRef = useRef<Map<any, string>>(new Map());

  const getStableBlobUrl = (blob: any) => {
    if (!blob) return "";
    let url = blobUrlCacheRef.current.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      blobUrlCacheRef.current.set(blob, url);
    }
    return url;
  };

  // Sync cache and revoke URLs of blobs that were removed/replaced in cameraPages
  useEffect(() => {
    const currentPagesSet = new Set(cameraPages);
    const cache = blobUrlCacheRef.current;
    
    for (const [blob, url] of cache.entries()) {
      if (!currentPagesSet.has(blob)) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Error revoking cached URL:", e);
        }
        cache.delete(blob);
      }
    }
  }, [cameraPages]);

  // Sync preview changes and revoke the previous preview URL if it's a blob url
  useEffect(() => {
    const oldPreview = preview;
    return () => {
      if (oldPreview && typeof oldPreview === "string" && oldPreview.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(oldPreview);
        } catch (e) {
          console.error("Error revoking preview URL:", e);
        }
      }
    };
  }, [preview]);

  // Clean up all cached URLs when the component unmounts
  useEffect(() => {
    return () => {
      const cache = blobUrlCacheRef.current;
      for (const url of cache.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Error revoking cached URL on unmount:", e);
        }
      }
      cache.clear();
    };
  }, []);

  // --- Miniaturas leves para a faixa do lote (evita OOM em celulares com pouca RAM) ---
  // A faixa de páginas do lote antes renderizava a foto em resolução ORIGINAL (até 3000px)
  // para cada página simultaneamente, só encolhida por CSS — decodificando todas de uma vez
  // na memória. Em lotes grandes (muitas páginas de um mesmo cliente) isso estoura a RAM do
  // aparelho, e como a recuperação de rascunho reabre essa mesma faixa automaticamente, o
  // travamento se repete a cada tentativa de continuar. Aqui geramos uma miniatura pequena
  // (240px) por página, UMA DE CADA VEZ (nunca em paralelo), e usamos só ela na faixa.
  const thumbUrlCacheRef = useRef<Map<any, string>>(new Map());
  const [, setThumbTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cache = thumbUrlCacheRef.current;
    const currentPagesSet = new Set(cameraPages);

    for (const [blob, url] of cache.entries()) {
      if (!currentPagesSet.has(blob)) {
        try { URL.revokeObjectURL(url); } catch (e) {}
        cache.delete(blob);
      }
    }

    const pending = cameraPages.filter((p) => p && !cache.has(p));
    if (pending.length === 0) return;

    (async () => {
      for (const blob of pending) {
        if (cancelled) break;
        try {
          // Página já liberada da memória (backup em nuvem confirmado, virou referência leve):
          // já carrega sua própria miniatura pronta, não precisa gerar de novo.
          if (isCloudPageRef(blob)) {
            if (blob.thumbBlob) cache.set(blob, URL.createObjectURL(blob.thumbBlob));
            setThumbTick((t) => t + 1);
            continue;
          }

          const MAX_THUMB_DIM = 240;
          let thumbBlob: any = null;

          // IMPORTANTE: usar createImageBitmap com resize em vez de new Image() — a versão
          // antiga decodificava a foto em resolução TOTAL antes de reduzir, o que travava o
          // celular ao recuperar um rascunho com fotos grandes (o próprio gatilho do crash
          // "insuficiência de memória" ao clicar em Recuperar). resizeWidth já entrega a
          // imagem pronta em tamanho pequeno, sem nunca alocar a versão gigante original.
          if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob, { resizeWidth: MAX_THUMB_DIM, resizeQuality: "high" });
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { bitmap.close(); throw new Error("no ctx"); }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            thumbBlob = await new Promise((resolve, reject) => {
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/jpeg", 0.6);
            });
            canvas.width = 0; canvas.height = 0;
          } else {
            // Fallback pra navegadores muito antigos sem suporte a resize no createImageBitmap.
            thumbBlob = await new Promise((resolve, reject) => {
              const sourceUrl = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                const scale = Math.min(1, MAX_THUMB_DIM / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(sourceUrl); reject(new Error("no ctx")); return; }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((b) => {
                  canvas.width = 0; canvas.height = 0;
                  URL.revokeObjectURL(sourceUrl);
                  if (!b) { reject(new Error("toBlob falhou")); return; }
                  resolve(b);
                }, "image/jpeg", 0.6);
              };
              img.onerror = (e) => { URL.revokeObjectURL(sourceUrl); reject(e); };
              img.src = sourceUrl;
            });
          }

          if (!cancelled && thumbBlob) {
            cache.set(blob, URL.createObjectURL(thumbBlob));
            setThumbTick((t) => t + 1);
          }
        } catch (e) {
          console.error("[Miniatura do lote] Falha ao gerar miniatura de uma página:", e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [cameraPages]);

  const getStableThumbUrl = (blob: any) => {
    if (!blob) return "";
    return thumbUrlCacheRef.current.get(blob) || "";
  };

  useEffect(() => {
    return () => {
      const cache = thumbUrlCacheRef.current;
      for (const url of cache.values()) {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }
      cache.clear();
    };
  }, []);

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
  const [completedCrop, setCompletedCrop] = useState(null);
  const [croppingPageIndex, setCroppingPageIndex] = useState(null);

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
  const compilationLogsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compilationLogsEndRef.current) {
      compilationLogsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [compilationLogs]);

  const [viewingBatchPage, setViewingBatchPage] = useState(null);

  // Resolve a página sendo visualizada em tela cheia — se ela já tiver sido liberada da
  // memória (backup em nuvem confirmado), baixa de volta antes de exibir.
  const [viewingPageUrl, setViewingPageUrl] = useState<string | null>(null);
  const [viewingPageLoading, setViewingPageLoading] = useState(false);
  useEffect(() => {
    if (viewingBatchPage === null) { setViewingPageUrl(null); return; }
    const page = cameraPages[viewingBatchPage];
    if (!page) { setViewingPageUrl(null); return; }
    if (!isCloudPageRef(page)) {
      setViewingPageUrl(getStableBlobUrl(page));
      setViewingPageLoading(false);
      return;
    }
    let cancelled = false;
    setViewingPageLoading(true);
    setViewingPageUrl(null);
    resolvePageBlob(page).then((blob) => {
      if (cancelled) return;
      setViewingPageUrl(getStableBlobUrl(blob));
      setViewingPageLoading(false);
    }).catch((e) => {
      console.error("[Backup em nuvem] Falha ao baixar página pra visualizar:", e);
      if (!cancelled) {
        setViewingPageLoading(false);
        showToast("Não foi possível baixar esta página da nuvem.", "error");
      }
    });
    return () => { cancelled = true; };
  }, [viewingBatchPage, cameraPages]);

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
             return { id: c.id, name, parentId, ts: c.created_at, originalName: c.name, archived: !!c.archived };
          }));
        }
        
        // O Supabase devolve no máximo 1000 linhas por consulta: sem paginar, só os 1000
        // documentos mais recentes apareciam e as pastas dos mais antigos pareciam vazias
        // (o banco já passava de 1400). Busca em páginas de 1000 até acabar; o desempate por
        // id mantém a ordem estável entre as páginas, sem repetir nem pular documentos.
        const PAGE_SIZE = 1000;
        const dData: any[] = [];
        let loadedAll = true;
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data: page, error: pageError } = await supabase
            .from('lexscan_documents')
            .select('id, client_id, name, file_type, file_url, confidence, chars_count, words_count, created_at, has_failed_pages')
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
          if (pageError || !page) {
            console.error('Erro ao carregar documentos (página a partir de ' + from + '):', pageError);
            loadedAll = false;
            break;
          }
          dData.push(...page);
          if (page.length < PAGE_SIZE) break;
        }
        if (loadedAll) {
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
            ts: d.created_at,
            hasFailedPages: !!d.has_failed_pages // Calculado no servidor, disponível sem carregar o texto inteiro
          })));
        }
      } catch(e) { console.error('Erro Supabase:', e); }
    } else {
      console.warn("Supabase não está configurado. A persistência de dados está desativada.");
    }
  }, []);

  // Usa user?.id (string estável) em vez do objeto "user" inteiro: o Supabase troca a referência do
  // objeto a cada renovação automática de token (acontece sozinho numa sessão longa, tipo escanear
  // muitos documentos seguidos), mesmo sendo o mesmo login. Se o efeito dependesse do objeto inteiro,
  // ele recarregava tudo do zero e recriava as conexões em tempo real no meio do escaneamento — a
  // causa da "tela piscando".
  const userId = user?.id;

  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [loadData, userId]);

  // Sincronização em Tempo Real (Realtime Sync) para multiplos usuários simultâneos.
  // Com debounce: escanear vários documentos em sequência gera uma rajada de INSERTs (inclusive da
  // própria aba, que o Postgres ecoa de volta), e sem debounce cada um disparava um recarregamento
  // completo da lista de documentos — mesma causa do "piscar" ao escanear muitos documentos.
  useEffect(() => {
    if (!supabase || !userId) return;

    let debounceTimer: any = null;
    const debouncedLoadData = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadData(), 1500);
    };

    const clientsChannel = supabase
      .channel('realtime-clients')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lexscan_clients' },
        debouncedLoadData
      )
      .subscribe();

    const docsChannel = supabase
      .channel('realtime-docs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lexscan_documents' },
        debouncedLoadData
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(docsChannel);
    };
  }, [loadData, userId]);

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

  const compressFile = async (blob: any, level = 0.6) => {
    return compressImage(blob, 'media');
  };

  const handleCompressAndDownload = async (item: any, levelName: string = 'Lite') => {
    if (!item) return;
    showToast(`Comprimindo versão ${levelName}...`, "info");
    
    try {
      const blob = await fetchItemBlob(item, supabase);
      const isPdf = item.type === 'application/pdf' || blob.type === 'application/pdf' || (item.name && item.name.toLowerCase().endsWith('.pdf'));
      
      let compressedBlob: Blob;
      let extension = 'pdf';

      if (isPdf) {
        compressedBlob = await compressPDF(blob, levelName);
        extension = 'pdf';
      } else {
        compressedBlob = await compressImage(blob, levelName);
        extension = 'jpg';
      }

      const origKb = Math.round(blob.size / 1024);
      const compKb = Math.round(compressedBlob.size / 1024);
      const percentRed = Math.max(0, Math.round(((blob.size - compressedBlob.size) / (blob.size || 1)) * 100));

      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = (item.name || "documento").replace(/\.[^.]+$/, "");
      a.download = `${baseName}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast(`✓ Baixado! De ${(origKb/1024).toFixed(1)}MB para ${(compKb/1024).toFixed(1)}MB (-${percentRed}%)`, "success");
    } catch (e: any) {
      console.error("Erro ao comprimir:", e);
      showToast(`Erro ao comprimir: ${e.message || "Tente novamente"}`, "error");
    }
  };

  const handleDownloadLite = async (item: any) => {
    return handleCompressAndDownload(item, 'Lite');
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
    setIsAborting(false);
    window.lexscan_abort = false;
    setCurrentQueueIndex(0);
    
    let stoppedEarly = false;
    for (let i = 0; i < queue.length; i++) {
      if (window.lexscan_abort) {
        stoppedEarly = true;
        break;
      }
      setCurrentQueueIndex(i);
      const currentFile = queue[i];
      await performSingleProcess(currentFile, i + 1, queue.length);
      if (window.lexscan_abort) {
        stoppedEarly = true;
        break;
      }
    }
    
    setProcessing(false);
    setIsAborting(false);
    setCurrentQueueIndex(-1);
    setQueue([]);
    if (stoppedEarly) {
      showToast("⏸ Processamento em lote pausado. O progresso foi salvo!", "info");
    } else {
      showToast(`✓ Lote concluído!`, "success");
    }
    setTab("history");
  };

  const uploadBatchWithoutOCR = async () => {
    if (queue.length === 0) return;
    
    setProcessing(true);
    setIsAborting(false);
    window.lexscan_abort = false;
    setCurrentQueueIndex(0);
    
    for (let i = 0; i < queue.length; i++) {
      if (window.lexscan_abort) {
        showToast("⏸ Envio em lote pausado.", "info");
        break;
      }
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

  const performSingleProcess = async (f, current, total, forceRefresh = false) => {
    if (window.lexscan_abort) return;
    setProgress(0);
    setProgressMsg(`[${current}/${total}] Analisando arquivo: ${f.name}`);

    try {
      let extracted;
      const fileHash = await calculateDocumentHash(f);
      const cached = !forceRefresh ? getCachedOCR(fileHash) : null;

      if (cached) {
        setProgress(60);
        setProgressMsg(`[${current}/${total}] ⚡ Documento em cache! Carregamento instantâneo: ${f.name}`);
        extracted = {
          text: cached.text,
          confidence: cached.confidence,
          fromCache: true
        };
        showToast(`⚡ "${f.name}" carregado instantaneamente do cache!`, "info");
      } else {
        const onProgress = (p, msg) => { 
          if (window.lexscan_abort) return;
          setProgress(p); 
          setProgressMsg(`[${current}/${total}] ${msg || "Extraindo..."}`); 
        };

        setOcrContextClientName(clientNameForOcr(selectedClient));
        if (f.type === "application/pdf") {
          extracted = await extractPDFHybrid(f, onProgress, aiMode, startPage, forceRefresh, goldStandard);
        } else {
          extracted = await extractImageHybrid(f, onProgress, aiMode, forceRefresh, goldStandard);
        }

        if (window.lexscan_abort) {
          console.log(`[performSingleProcess] Abort após extração de ${f.name}`);
        }

        // Otimização Heurística para todos os casos (limpeza final)
        if (extracted && extracted.text) {
          extracted.text = optimizeRawText(extracted.text, aiMode);
          // Grava no cache hash para reaproveitamento futuro imediato
          setCachedOCR(fileHash, extracted.text, extracted.confidence, f.name);
        }
      }

      const onProgressSave = (p, msg) => {
        if (window.lexscan_abort) return;
        setProgress(p);
        setProgressMsg(`[${current}/${total}] ${msg}`);
      };

      onProgressSave(85, "Salvando na nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString() + "_" + current;
      let finalFileForUpload = f;
      
      // Se for imagem, a pedido do usuário, converter para PDF nativamente antes de salvar
      if (f.type.startsWith("image/")) {
         onProgressSave(88, "Convertendo Imagem para PDF...");
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
          words_count: extracted.text.split(/\s+/).length,
          has_failed_pages: detectFailedPages(extracted.text).length > 0
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
        chars: extracted.text.length,
        fromCache: extracted.fromCache || false,
        fileHash,
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

  const process = async (forceRefresh = false) => {
    if (queue.length > 0) {
      processBatch();
      return;
    }
    if (!file) return;
    setProcessing(true);
    setIsAborting(false);
    setProgress(0);
    setProgressMsg("Iniciando...");

    try {
      let extracted;
      const fileHash = await calculateDocumentHash(file);
      const cached = !forceRefresh ? getCachedOCR(fileHash) : null;

      if (cached) {
        setProgress(50);
        setProgressMsg(`⚡ Arquivo reconhecido! Carregando do Cache...`);
        extracted = {
          text: cached.text,
          confidence: cached.confidence,
          fromCache: true
        };
        showToast(`⚡ Documento carregado instantaneamente do cache!`, "info");
      } else {
        const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

        window.lexscan_abort = false;

        setOcrContextClientName(clientNameForOcr(selectedClient));
        if (file.type === "application/pdf") {
          extracted = await extractPDFHybrid(file, onProgress, aiMode, startPage, forceRefresh, goldStandard);
        } else {
          extracted = await extractImageHybrid(file, onProgress, aiMode, forceRefresh, goldStandard);
        }

        // Otimização Heurística para todos os casos (limpeza final)
        if (extracted && extracted.text) {
          extracted.text = optimizeRawText(extracted.text, aiMode);
          // Grava no cache hash
          setCachedOCR(fileHash, extracted.text, extracted.confidence, file.name);
        }
      }

      const onProgressSave = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };
      onProgressSave(80, "Verificando nuvem...");

      let fileUrl = null;
      let finalId = Date.now().toString();
      let finalFileForUpload = file;

      if (file.type.startsWith("image/")) {
         onProgressSave(88, "Convertendo Imagem para PDF...");
         try {
            finalFileForUpload = await convertSingleImageToPDF(file);
         } catch(e) {
            console.error("Erro na conversão para PDF, enviando original", e);
         }
      }

      if (supabase) {
        onProgressSave(85, "Armazenando PDF na Nuvem...");
        
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

        onProgressSave(95, "Sincronizando com o banco GED...");
        const docRecord = {
           client_id: selectedClient || null,
           name: finalFileForUpload.name,
           file_type: finalFileForUpload.type,
           file_url: fileUrl,
           extracted_text: extracted.text,
           confidence: extracted.confidence,
           chars_count: extracted.text.length,
           words_count: extracted.text.split(/\s+/).filter(Boolean).length,
           has_failed_pages: detectFailedPages(extracted.text).length > 0
        };

        const { data: dbData, error: dbError } = await supabase.from('lexscan_documents').insert([docRecord]).select();
        if (dbData && dbData[0]) {
           finalId = dbData[0].id;
        } else {
           console.error("DB Error:", dbError);
        }
      }

      onProgressSave(100, "Concluído!");

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
        fromCache: extracted.fromCache || false,
        fileHash,
        ts: Date.now(),
        clientId: selectedClient || "unassigned"
      };

      if (!supabase) {
        showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
      }
      setHistory(prev => [item, ...prev]);

      setResult(item);
      if (window.lexscan_abort || (extracted && extracted.text.includes("[PROCESSO PAUSADO"))) {
        showToast("⏸ Processo pausado. O progresso foi salvo com sucesso!", "info");
      } else {
        showToast(extracted.fromCache ? "⚡ Documento carregado do cache instantâneo!" : "✓ Texto extraído com sucesso!");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao processar arquivo", "error");
    } finally {
      setProcessing(false);
      setIsAborting(false);
      window.lexscan_abort = false;
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
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_BASE_OPTIONS }).promise;
      
      const loadedPages = [];
      // Otimização de memória: se tiver muitas páginas, reduzimos a resolução de importação
      // para evitar OOM (Out of Memory) em celulares no Chrome/Safari
      let scaleToUse = 1.5;
      if (pdf.numPages > 10) scaleToUse = 1.2;
      if (pdf.numPages > 25) scaleToUse = 1.0;
      if (pdf.numPages > 50) scaleToUse = 0.8;

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgressMsg(`Importando página original ${i}/${pdf.numPages}...`);
        setProgress(Math.round(20 + (i / pdf.numPages) * 75));
        
        const page = await pdf.getPage(i);
        let viewport = page.getViewport({ scale: scaleToUse });
        let canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        let ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        
        await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
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
    
    // Encontra todas as páginas verdadeiramente falhas ou puladas
    const pagesToProcess = detectFailedPages(currentText);
    console.log("[Recuperar páginas] Páginas detectadas para reparo:", pagesToProcess);
    // Mesma dica de pasta que os outros fluxos de leitura usam (ajuda a não trocar sobrenome de manuscrito parecido).
    setOcrContextClientName(clientNameForOcr(targetResult.clientId));
    
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
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, ...PDFJS_BASE_OPTIONS }).promise;
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
            pageText = extractStructuredTextFromPDFPage(textContent);
            let hasImage = false;
            try {
              const ops = await page.getOperatorList();
              if (ops && ops.fnArray) {
                hasImage = ops.fnArray.some((fn: any) => 
                  fn === pdfjsLib.OPS.paintImageXObject || 
                  fn === pdfjsLib.OPS.paintInlineImageXObject || 
                  fn === pdfjsLib.OPS.paintImageMaskXObject
                );
              }
            } catch (opErr) {}

            if (isGenuineDigitalText(pageText, hasImage)) {
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
            const rawVp = page.getViewport({ scale: 1.0 });
            const maxDim = Math.max(rawVp.width, rawVp.height) || 800;
            const targetDim = goldStandard ? 2200 : 1800;
            const adaptiveScale = Math.min(2.5, Math.max(0.7, targetDim / maxDim));
            let viewport = page.getViewport({ scale: adaptiveScale });
            let canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            let ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
              console.error(`[Recuperar páginas] Erro ao obter Context 2D para a pág ${pageNum}`);
              continue;
            }
            
            await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
            
            const originalColorBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
            if (!originalColorBlob) {
              console.error(`[Recuperar páginas] Erro ao converter canvas em blob para a pág ${pageNum}`);
              canvas.width = 0; canvas.height = 0;
              continue;
            }
            
            const enhancedForAi = wantsHighResImage()
              ? await enhanceImageForGemini(originalColorBlob as Blob, MISTRAL_IMAGE_MAX_DIMENSION, MISTRAL_IMAGE_JPEG_QUALITY, !isHardHandwritingEnabled())
              : await enhanceImageForGemini(originalColorBlob as Blob);
            
            setProgressMsg(`[Pág ${pageNum}] Consultando IA Jurídica...`);
            const aiResult = await extractPageWithGemini(enhancedForAi, (p, msg) => {
              setProgressMsg(`[Pág ${pageNum}] ${msg || "Extraindo..."}`);
            }, goldStandard);
            // extractPageWithGemini retorna { text, usedKey }, não uma string pura — sem isso, optimizeRawText
            // recebia o objeto inteiro e quebrava em "text.toLowerCase is not a function" pra qualquer página
            // que precisasse mesmo da IA (as que já tinham texto digital nem chegavam a passar por aqui).
            const aiText = (aiResult && typeof aiResult === 'object' && 'text' in aiResult) ? aiResult.text : aiResult;
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
      const stillHasFailedPages = detectFailedPages(updatedText).length > 0;
      const updatedItem = {
        ...targetResult,
        text: updatedText,
        words: updatedText.split(/\s+/).filter(Boolean).length,
        chars: updatedText.length,
        confidence: Math.max(targetResult.confidence, 95), // Sobe a confiança já que recuperou páginas críticas!
        hasFailedPages: stillHasFailedPages
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
            words_count: updatedItem.words,
            has_failed_pages: stillHasFailedPages
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
            if (croppingPageIndex !== null) {
              setCameraPages(prev => prev.map((p, idx) => idx === croppingPageIndex ? blob : p));
              setCroppingPageIndex(null);
            } else {
              setCameraPages(prev => [...prev, blob]);
            }
            backupPageToCloudInBackground(blob);
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
    
    // Limite rígido para evitar OOM (Out Of Memory) no rotate em celulares (Tela Branca)
    const MAX_DIM = 3000;
    let scale = 1;
    if (img.naturalWidth > MAX_DIM || img.naturalHeight > MAX_DIM) {
       scale = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight);
    }
    
    const scaledWidth = Math.floor(img.naturalWidth * scale);
    const scaledHeight = Math.floor(img.naturalHeight * scale);

    // Swap dimensions for rotation (90 deg)
    canvas.width = scaledHeight;
    canvas.height = scaledWidth;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.imageSmoothingQuality = 'high';
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);

    canvas.toBlob((blob) => {
      canvas.width = 0; canvas.height = 0; // Libera RAM
      if (!blob) return;
      const newFile = new File([blob], file.name, { type: file.type });
      setFile(newFile);
      setPreview(URL.createObjectURL(blob));
      setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
      setCompletedCrop(null);
    }, file.type, Math.min(0.95, scale < 1 ? 0.90 : 1.0));
  };



  // Câmeras de celulares atuais tiram fotos de 48, 64 ou até 108 megapixels. Exibir esse arquivo
  // cru direto num <img> (mesmo só pra pré-visualização/recorte) obriga o navegador a decodificar
  // a imagem NA RESOLUÇÃO ORIGINAL inteira na memória antes de desenhar qualquer coisa na tela —
  // isso sozinho já é o suficiente pra estourar a memória do Chrome em boa parte dos celulares,
  // independente de RAM ou armazenamento livres no aparelho (o erro "insuficiência de memória"
  // é conhecidamente disparado por isso). A solução é usar createImageBitmap() com resize: o
  // PRÓPRIO decodificador do navegador já entrega a imagem reduzida, sem nunca alocar o bitmap
  // gigante original — só then desenhamos essa versão já pequena num canvas pra gerar o arquivo
  // final que efetivamente usamos daqui em diante (preview, corte, lote, compilação).
  const downscaleImageForSafeMemory = async (file, maxDim = 3000, quality = 0.92) => {
    try {
      const { width, height } = await new Promise((resolve, reject) => {
        const probeUrl = URL.createObjectURL(file);
        const probeImg = new Image();
        probeImg.onload = () => {
          const d = { width: probeImg.naturalWidth, height: probeImg.naturalHeight };
          URL.revokeObjectURL(probeUrl);
          resolve(d);
        };
        probeImg.onerror = (e) => { URL.revokeObjectURL(probeUrl); reject(e); };
        probeImg.src = probeUrl;
      });

      if (!width || !height || Math.max(width, height) <= maxDim) {
        return file; // Já está em tamanho seguro, não precisa reprocessar.
      }

      const scale = maxDim / Math.max(width, height);
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.imageSmoothingQuality = 'high';

      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(file, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "high" });
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        bitmap.close();
      } else {
        // Fallback para navegadores muito antigos sem suporte a resize no createImageBitmap.
        const img = await new Promise((resolve, reject) => {
          const url = URL.createObjectURL(file);
          const el = new Image();
          el.onload = () => { resolve(el); };
          el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
          el.src = url;
        });
        ctx.drawImage(img, 0, 0, targetW, targetH);
      }

      const blob: any = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/jpeg", quality);
      });
      canvas.width = 0; canvas.height = 0;
      return new File([blob], file.name, { type: "image/jpeg" });
    } catch (e) {
      console.error("[Downscale] Falha ao reduzir a foto com segurança, usando o arquivo original:", e);
      return file;
    }
  };

  const handleNativeCameraCapture = async (files) => {
    if (!files || files.length === 0) return;
    const rawFile = files[0];
    if (!rawFile.type.startsWith("image/")) return;

    setProcessing(true);
    setProgress(0);
    setProgressMsg("Carregando foto...");

    try {
      // Reduz a foto crua da câmera ANTES de exibi-la — evita que o navegador precise
      // decodificar a imagem em resolução total (ver comentário acima em downscaleImageForSafeMemory).
      const f = await downscaleImageForSafeMemory(rawFile);
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
            if (croppingPageIndex !== null) {
              setCameraPages(prev => prev.map((p, idx) => idx === croppingPageIndex ? blob : p));
              setCroppingPageIndex(null);
            } else {
              setCameraPages(prev => [...prev, blob]);
            }
            backupPageToCloudInBackground(blob);
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
            if (croppingPageIndex !== null) {
              setCameraPages(prev => prev.map((p, idx) => idx === croppingPageIndex ? blob : p));
              setCroppingPageIndex(null);
            } else {
              setCameraPages(prev => [...prev, blob]);
            }
            backupPageToCloudInBackground(blob);
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

  const handleEditPage = async (index) => {
    const page = cameraPages[index];
    if (isCloudPageRef(page)) {
      setProcessing(true);
      setProgressMsg("Baixando página da nuvem para editar...");
    }
    let pageBlob;
    try {
      pageBlob = await resolvePageBlob(page);
    } catch (e) {
      console.error(e);
      showToast("Não foi possível baixar esta página da nuvem para editar.", "error");
      setProcessing(false);
      setProgressMsg("");
      return;
    }
    setProcessing(false);
    setProgressMsg("");
    setCroppingPageIndex(index);
    setFile(pageBlob);
    setPreview(URL.createObjectURL(pageBlob));
    setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
    setCompletedCrop(null);
    setIsBatchModalOpen(false);
    setViewingBatchPage(null);
    setIsCropping(true);
  };

  const handleBatchImageAdd = async (files) => {
    if (!files || files.length === 0) return;

    if (files.length === 1) {
       // Reduz a foto ANTES de exibir no recorte — mesma proteção de memória da câmera nativa.
       const f = await downscaleImageForSafeMemory(files[0]);
       setIsBatchModalOpen(false);
       const objectUrl = URL.createObjectURL(f);
       setPreview(objectUrl);
       setFile(f);
       setCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 });
       setCompletedCrop(null);
       setTimeout(() => setIsCropping(true), 150);
    } else {
       const validRaw = Array.from(files).filter((f: any) => f.type.startsWith('image/'));
       setProgressMsg("Reduzindo imagens com segurança...");
       // Reduz uma imagem de cada vez (nunca em paralelo) pra nunca ter mais de uma foto em
       // resolução total decodificada na memória ao mesmo tempo durante o processamento do lote.
       const valid = [];
       for (const f of validRaw as any[]) {
         valid.push(await downscaleImageForSafeMemory(f));
       }
       setProgressMsg("");
       setCameraPages(prev => [...prev, ...valid]);
       valid.forEach((v: any) => backupPageToCloudInBackground(v));
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
    try {

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
      if (isCloudPageRef(cameraPages[i])) {
        setProgressMsg(`Baixando página ${i + 1} de volta da nuvem...`);
      }
      const pageBlob = await resolvePageBlob(cameraPages[i]);
      console.log('compiling pageBlob:', pageBlob);
      if (!(pageBlob instanceof Blob)) {
         throw new Error("Página recuperada está corrompida. Descarte e tente novamente.");
      }
      const pageUrl = URL.createObjectURL(pageBlob);
      
      const img: any = await new Promise((res, rej) => {
        const image = new Image();
        image.onload = () => res(image);
        image.onerror = (e) => rej(new Error("Erro ao carregar a imagem da página " + (i + 1)));
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
      
      // Yield to the event loop para dar chance ao Garbage Collector do navegador rodar
      // Isso evita crash/tela branca em celulares ao compilar muitos PDFs!
      await new Promise(r => setTimeout(r, 20));
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

    setCameraPages([]);
    clearCloudBatchSession(); // documento já finalizado e salvo — não precisa mais do rascunho na nuvem
    setIsBatchModalOpen(false);
    setBatchDocName("Documento_Escaneado"); // reset config
    setAppendingDoc(null); // clean up

    // Limpar o state da foto anterior e da crop session
    setFile(null);
    setPreview(null);
    setResult(newItem); // Keep the updated/compiled document loaded in the result view!
    setIsCropping(false);
    setCompletedCrop(null);
    setCroppingPageIndex(null);

    // Joga pra aba scanner novamente para recomeçar o fluxo direto
    setTab("scanner"); 
    setProcessing(false);
    
    showToast(appendingDoc ? "✓ Documento atualizado com novas páginas!" : "✓ Salvo! Scanner liberado para seu próximo documento.");
    } catch (e: any) {
      console.error(e);
      showToast("Erro ao compilar: " + e.message, "error");
      setProcessing(false);
    }
  };

  const processHistoryItem = async (item, forceRefresh = false) => {
    setProcessing(true);
    setTab("scanner");
    setProgress(0);
    setProgressMsg("Baixando arquivo do GED...");
    
    try {
      const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;

      if (!urlToFetch) {
        throw new Error("Este documento não tem um arquivo original salvo pra reprocessar (o upload/backup dele pode ter falhado na hora do scan). Escaneie a página de novo.");
      }

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
      const fileHash = await calculateDocumentHash(fileToProcess);
      const cached = !forceRefresh ? getCachedOCR(fileHash) : null;

      if (cached) {
        setProgress(60);
        setProgressMsg("⚡ Recuperado do cache de alta fidelidade!");
        extracted = {
          text: cached.text,
          confidence: cached.confidence,
          fromCache: true
        };
        showToast("⚡ Documento carregado instantaneamente do cache!", "info");
      } else {
        const onProgress = (p, msg) => { setProgress(p); setProgressMsg(msg || ""); };

        window.lexscan_abort = false;

        setOcrContextClientName(clientNameForOcr(item.clientId));
        if (fileToProcess.type === "application/pdf") {
          extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, forceRefresh, goldStandard);
        } else {
          extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, forceRefresh, goldStandard);
        }

        if (extracted && extracted.text) {
          extracted.text = optimizeRawText(extracted.text, true);
          setCachedOCR(fileHash, extracted.text, extracted.confidence, item.name);
        }
      }
      
      setProgress(90);
      setProgressMsg("Atualizando banco de dados...");
      
      if (supabase && extracted && extracted.text) {
        await supabase.from("lexscan_documents").update({
          extracted_text: extracted.text,
          confidence: extracted.confidence,
          words_count: extracted.text.split(/\s+/).filter(Boolean).length,
          chars_count: extracted.text.length,
          has_failed_pages: detectFailedPages(extracted.text).length > 0
        }).eq("id", item.id);
      }

      const updatedItem = {
        ...item,
        text: extracted.text,
        confidence: extracted.confidence,
        words: extracted.text.split(/\s+/).filter(Boolean).length,
        chars: extracted.text.length,
        fromCache: extracted.fromCache || false,
        fileHash
      };

      setHistory(prev => prev.map(h => h.id === item.id ? updatedItem : h));
      setResult(updatedItem);
      showToast(extracted.fromCache ? "⚡ OCR carregado do cache instantâneo!" : "✓ OCR processado com sucesso!");
    } catch(err) {
      console.error(err);
      showToast("Erro: " + (err.message || "processar OCR do item arquivado."), "error");
    } finally {
      setProcessing(false);
    }
  };

  const processFolderOCR = async (forceAll: boolean = false) => {
    // 1. Garante que os textos dos documentos da pasta estão carregados do banco
    const folderItems = history.filter(h => viewingClient === 'unassigned' 
      ? (!h.clientId || h.clientId === 'unassigned') 
      : h.clientId === viewingClient
    );

    if (folderItems.length === 0) {
      showToast("Nenhum documento encontrado nesta pasta.", "info");
      return;
    }

    const missingTexts = folderItems.filter(d => !d.text || d.text.trim() === "");
    if (missingTexts.length > 0 && supabase) {
      showToast("Carregando textos do banco de dados...", "info");
      try {
        const { data, error } = await supabase
          .from('lexscan_documents')
          .select('id, extracted_text')
          .in('id', missingTexts.map(d => d.id));
        
        if (!error && data) {
          const map: Record<string, string> = {};
          data.forEach(r => { map[r.id] = r.extracted_text || ""; });
          folderItems.forEach(item => {
            if (map[item.id] !== undefined) item.text = map[item.id];
          });
          setHistory(prev => prev.map(h => map[h.id] !== undefined ? { ...h, text: map[h.id] } : h));
        }
      } catch (err) {
        console.warn("Erro ao sincronizar textos para OCR em lote:", err);
      }
    }

    // 2. Filtra os documentos que realmente precisam de processamento ou reparo
    let docs = folderItems.filter(h => {
       const text = h.text || '';
       const hasCriticalError = /ERRO\s+CR[ÍI]TICO|P[ÁA]GINA\s+PULADA/i.test(text);
       const hasIncompletePages = /\[P[ÁA]GINA\s+\d+\s*-\s*[^\]]+\]\s*(?:Autenticado por:[^\n]*\s*)*(?:Anexo ID:\s*\d+\s*)*(?:P[áa]gina\s+\d+\s+de\s+\d+\s*)*(?:Emitido em:[^\n]*\s*)*\s*(?=\[P[ÁA]GINA|\s*$)/i.test(text);
       const hasOcrBruto = /\[OCR BRUTO|\[P[ÁA]GINA\s+\d+\s+-\s+OCR BRUTO/i.test(text);
       const conf = getRealConfidence(text, h.confidence);
       const isComplete = !hasCriticalError && !hasIncompletePages && !hasOcrBruto && conf >= 85 && (h.words > 30 || h.chars > 150);
       
       return !isComplete;
    });

    if (docs.length === 0) {
      const confirmReExtract = window.confirm(
        `Todos os ${folderItems.length} documentos da pasta já possuem textos extraídos no banco de dados.\n\n` +
        `• Se você deseja apenas o arquivo final com o relatório de auditoria, clique em CANCELAR e use o botão 'Baixar Textos (TXT)'.\n\n` +
        `• Deseja FORÇAR a re-extração completa de todos os ${folderItems.length} documentos via IA Jurídica?`
      );
      if (!confirmReExtract) {
        showToast("Você já pode clicar em 'Baixar Textos (TXT)' para gerar o compilado auditado!", "success");
        return;
      }
      docs = folderItems;
    }

    setTab("scanner");
    setProcessing(true);
    setIsAborting(false);
    window.lexscan_abort = false;

    let processedCount = 0;
    let stoppedEarly = false;

    for (let i = 0; i < docs.length; i++) {
        if (window.lexscan_abort) { stoppedEarly = true; break; }
        const item = docs[i];
        setProgress(0);
        setProgressMsg(`[${i + 1}/${docs.length}] Analisando: ${item.name}...`);

        try {
          const urlToFetch = item.fileUrl || item.localBlobUrl || item.preview;

          if (!urlToFetch) {
            throw new Error("Documento sem arquivo original salvo pra reprocessar (upload/backup pode ter falhado no scan).");
          }

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
          const fileHash = await calculateDocumentHash(fileToProcess);
          const cached = getCachedOCR(fileHash);
          const cachedHasOcrBruto = cached && /\[OCR BRUTO|\[P[ÁA]GINA\s+\d+\s+-\s+OCR BRUTO/i.test(cached.text);
    
          let extracted;

          if (cached && !cachedHasOcrBruto) {
            setProgress(60);
            setProgressMsg(`[${i + 1}/${docs.length}] ⚡ Em cache! ${item.name}`);
            extracted = {
              text: cached.text,
              confidence: cached.confidence,
              fromCache: true
            };
          } else {
            // Micro-pausa de 100ms apenas para manter a renderização fluida sem travamento
            if (i > 0) await new Promise(r => setTimeout(r, 100));

            const onProgress = (p, msg) => {
               setProgress(p);
               setProgressMsg(`[${i + 1}/${docs.length}] ${msg || ""}`);
            };

            setOcrContextClientName(clientNameForOcr(item.clientId));
            if (fileToProcess.type === "application/pdf") {
              extracted = await extractPDFHybrid(fileToProcess, onProgress, aiMode, startPage, false, goldStandard);
            } else {
              extracted = await extractImageHybrid(fileToProcess, onProgress, aiMode, false, goldStandard);
            }
      
            if (extracted && extracted.text) {
              extracted.text = optimizeRawText(extracted.text, true);
              setCachedOCR(fileHash, extracted.text, extracted.confidence, item.name);
            }
          }
    
          if (extracted && extracted.text) {
            if (supabase) {
              await supabase.from("lexscan_documents").update({
                extracted_text: extracted.text,
                confidence: extracted.confidence,
                words_count: extracted.text.split(/\s+/).filter(Boolean).length,
                chars_count: extracted.text.length,
                has_failed_pages: detectFailedPages(extracted.text).length > 0
              }).eq("id", item.id);
            }
      
            const updatedItem = {
              ...item,
              text: extracted.text,
              confidence: extracted.confidence,
              words: extracted.text.split(/\s+/).filter(Boolean).length,
              chars: extracted.text.length,
              fromCache: extracted.fromCache || false,
              fileHash
            };
      
            setHistory(prev => prev.map(h => h.id === item.id ? updatedItem : h));
            processedCount++;
          }
        } catch (fileErr) {
          console.error(`Erro no arquivo ${item.name}:`, fileErr);
          if (window.lexscan_abort) { stoppedEarly = true; break; }
        }
    }
    
    setProcessing(false);
    setIsAborting(false);
    window.lexscan_abort = false;
    setProgress(0);
    setProgressMsg("");
    setTab("history"); // Retorna para o histórico após processar todos
    if (stoppedEarly) {
      showToast(`⏸ Pasta pausada. ${processedCount} documentos processados e salvos até aqui!`, "info");
    } else {
      showToast(`✓ Lote concluído! ${processedCount} documentos processados.`, "success");
    }
  };

  const handleSaveManualEdit = async () => {
    if (!result) return;
    try {
      const newText = editedText;
      const newWords = newText.split(/\s+/).filter(Boolean).length;
      const newChars = newText.length;
      const editedHasFailedPages = detectFailedPages(newText).length > 0;

      const updatedItem = {
        ...result,
        text: newText,
        words: newWords,
        chars: newChars,
        hasFailedPages: editedHasFailedPages,
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
            has_failed_pages: editedHasFailedPages,
          })
          .eq("id", result.id);
      }

      showToast("Texto atualizado com sucesso!", "success");
    } catch (e) {
      console.error("Erro ao salvar edição:", e);
      showToast("Erro ao salvar edição manual", "error");
    }
  };

  const handleRefineTextWithAI = async () => {
    if (!result) return;
    if (!result.text || result.text.trim() === "") {
      showToast("Não há texto neste documento para refinar.", "info");
      return;
    }

    try {
      setIsRefiningText(true);
      showToast("Iniciando refinamento inteligente via IA Jurídica...", "info");
      
      const refined = await refineTextWithGemini(result.text);
      if (!refined) {
        throw new Error("A resposta da IA veio vazia.");
      }

      const newWords = refined.split(/\s+/).filter(Boolean).length;
      const newChars = refined.length;
      const realConf = getRealConfidence(refined, result.confidence);
      const refinedHasFailedPages = detectFailedPages(refined).length > 0;

      const updatedItem = {
        ...result,
        text: refined,
        words: newWords,
        chars: newChars,
        confidence: realConf,
        hasFailedPages: refinedHasFailedPages,
      };

      setResult(updatedItem);
      setHistory((prev) => prev.map((h) => (h.id === result.id ? updatedItem : h)));

      if (supabase) {
        await supabase
          .from("lexscan_documents")
          .update({
            extracted_text: refined,
            words_count: newWords,
            chars_count: newChars,
            confidence: realConf,
            has_failed_pages: refinedHasFailedPages,
          })
          .eq("id", result.id);
      }

      showToast("Texto refinado e otimizado com IA Jurídica com sucesso!", "success");
    } catch (e: any) {
      console.error("Erro ao refinar texto com IA:", e);
      showToast(e.message || "Não foi possível refinar o texto com IA.", "error");
    } finally {
      setIsRefiningText(false);
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

  const moveBatchDocumentsHandler = async (newClientId: string) => {
    if (!supabase) {
      showToast("Supabase não configurado", "error");
      return;
    }
    if (selectedDocIds.length === 0) {
      showToast("Nenhum documento selecionado", "error");
      return;
    }

    const targetFolderName = newClientId === 'unassigned' 
      ? 'Geral (Sem pasta)' 
      : (clients.find(c => c.id === newClientId)?.name || 'Pasta de destino');

    const totalToMove = selectedDocIds.length;
    const idsToMove = [...selectedDocIds];

    try {
      showToast(`Movendo ${totalToMove} documento(s) para "${targetFolderName}"...`);
      const { error } = await supabase
        .from('lexscan_documents')
        .update({ client_id: newClientId === 'unassigned' ? null : newClientId })
        .in('id', idsToMove);

      if (error) throw error;

      setHistory(prev => prev.map(h => idsToMove.includes(h.id) ? { ...h, clientId: newClientId } : h));
      setSelectedDocIds([]);
      setIsMovingBatch(false);
      showToast(`✓ ${totalToMove} documento(s) movido(s) com sucesso para "${targetFolderName}"!`, "success");
    } catch (e) {
      console.error("Erro ao mover documentos em lote:", e);
      showToast("Erro ao mover documentos em lote", "error");
    }
  };

  const deleteBatchDocumentsHandler = async () => {
    if (!supabase) {
      showToast("Supabase não configurado", "error");
      return;
    }
    if (selectedDocIds.length === 0) return;

    const totalToDelete = selectedDocIds.length;
    const idsToDelete = [...selectedDocIds];

    if (confirm(`Tem certeza que deseja excluir permanentemente os ${totalToDelete} documentos selecionados?`)) {
      try {
        showToast(`Excluindo ${totalToDelete} documento(s)...`);
        const { error } = await supabase
          .from('lexscan_documents')
          .delete()
          .in('id', idsToDelete);

        if (error) throw error;

        setHistory(prev => prev.filter(h => !idsToDelete.includes(h.id)));
        setSelectedDocIds([]);
        showToast(`✓ ${totalToDelete} documento(s) excluído(s) com sucesso!`, "success");
      } catch (e) {
        console.error("Erro ao excluir documentos em lote:", e);
        showToast("Erro ao excluir documentos em lote", "error");
      }
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
    const cleanedName = cleanRepeatedWordsInName(newClientName.trim());
    const finalName = isSubfolder ? `${viewingClient}::${cleanedName}` : cleanedName;
    
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
          const nc = { id: data[0].id, name, parentId, ts: data[0].created_at, originalName: data[0].name, archived: false };
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

  // Subpasta acompanha a pasta principal: está "arquivada" quando a pasta-mãe está.
  const isFolderArchived = (c) => !!(c.archived || (c.parentId && clients.find(p => p.id === c.parentId)?.archived));
  // Sem nenhuma arquivada não existem abas: evita ficar preso na aba "Arquivadas" vazia
  // depois de desarquivar a última pasta.
  const effectiveFolderTab: 'active' | 'archived' = clients.some(c => !c.parentId && c.archived) ? folderTab : 'active';

  const clientNameForOcr = (clientId) => {
    if (!clientId || clientId === 'unassigned') return '';
    return clients.find(c => c.id === clientId)?.name || '';
  };

  const toggleArchiveClient = async (client) => {
    if (!supabase) {
      showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
      return;
    }
    const nextArchived = !client.archived;
    const { error } = await supabase.from('lexscan_clients').update({ archived: nextArchived }).eq('id', client.id);
    if (error) {
      console.error("Supabase Error:", error);
      showToast("Erro ao " + (nextArchived ? "arquivar" : "desarquivar") + " pasta: " + error.message, "error");
      return;
    }
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, archived: nextArchived } : c));
    showToast(nextArchived ? `Pasta "${client.name}" arquivada.` : `Pasta "${client.name}" voltou para a lista principal.`);
  };

  const handleRenameClient = async () => {
    if (!renamingClient || !newClientRenameValue.trim()) {
      setRenamingClient(null);
      return;
    }
    const clientToUpdate = clients.find(c => c.id === renamingClient.id);
    if (!clientToUpdate) {
      setRenamingClient(null);
      return;
    }

    const isSubfolder = clientToUpdate.parentId !== null && clientToUpdate.parentId !== undefined;
    const cleanedName = cleanRepeatedWordsInName(newClientRenameValue.trim());
    const finalDbName = isSubfolder ? `${clientToUpdate.parentId}::${cleanedName}` : cleanedName;

    if (supabase) {
      showToast("Atualizando nome da pasta...");
      const { error } = await supabase.from('lexscan_clients').update({ name: finalDbName }).eq('id', renamingClient.id);
      if (error) {
        console.error("Supabase Error:", error);
        showToast("Erro ao renomear pasta: " + error.message, "error");
      } else {
        setClients(prev => prev.map(c => c.id === renamingClient.id ? { ...c, name: cleanedName, originalName: finalDbName } : c));
        showToast("Pasta renomeada com sucesso!");
      }
    } else {
      showToast("Supabase obrigatório! Erro na conexão do BD.", "error");
    }
    setRenamingClient(null);
    setNewClientRenameValue("");
  };

  const compileFolderTXT = async () => {
    const docs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
    
    if (docs.length === 0) {
      showToast("Nenhuma petição ou documento nesta pasta para compilar.", "info");
      return;
    }

    const rawFolderName = viewingClient === 'unassigned' ? 'Geral' : clients.find(c => c.id === viewingClient)?.name || 'Pasta';
    const folderName = cleanRepeatedWordsInName(rawFolderName);

    // Inicializa estados do modal de compilação
    setIsCompiling(true);
    setCompilationProgress(5);
    setCompilationTotal(0);
    setCompilationCurrentIndex(0);
    setCompilationStatusText("Iniciando compilação de documentos...");
    const initialLogs = [
      `[${new Date().toLocaleTimeString()}] 🚀 Iniciando compilação da pasta: "${folderName}"`,
      `[${new Date().toLocaleTimeString()}] 📊 Total de documentos na pasta: ${docs.length}`
    ];
    setCompilationLogs(initialLogs);

    // Clona e ordena usando Ordem Alfanumérica Natural (Natural Sort)
    // Isso garante que "Doc. 1", "Doc. 2", "Doc. 10", "Doc. 13" fiquem na ordem matemática e lógica,
    // independentemente de que horas foram escaneados ou inseridos.
    const sortedDocs = [...docs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    
    // Pequena pausa para animação do modal
    await new Promise(r => setTimeout(r, 600));

    const docsToFetch = sortedDocs.filter(d => !d.text || d.text.trim() === "");
    const textMap: { [key: string]: string } = {};

    if (docsToFetch.length > 0 && supabase) {
      setCompilationStatusText(`Carregando textos de ${docsToFetch.length} arquivos do banco...`);
      setCompilationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ☁️ Buscando ${docsToFetch.length} textos pendentes no banco de dados...`]);
      try {
        const { data, error } = await supabase
          .from('lexscan_documents')
          .select('id, extracted_text')
          .in('id', docsToFetch.map(d => d.id));
        
        if (error) throw error;
        
        if (data) {
          data.forEach(row => {
            textMap[row.id] = row.extracted_text || "";
          });

          // Atualiza o histórico em lote para persistir na interface e evitar novas buscas individuais
          setHistory(prev => prev.map(h => {
            if (textMap[h.id] !== undefined) {
              return { ...h, text: textMap[h.id] };
            }
            return h;
          }));
          setCompilationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✅ Carregados ${data.length} textos com sucesso.`]);
        }
      } catch (err: any) {
        console.error("Erro ao buscar textos em lote para a compilação:", err);
        setCompilationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Falha ao buscar textos: ${err.message || err}`]);
        showToast("Alguns documentos não puderam ter seus textos carregados do banco.", "error");
      }
    }

    setCompilationProgress(25);
    setCompilationStatusText("Montando compilado inicial estruturado...");
    setCompilationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] 📝 Agrupando textos de todos os ${sortedDocs.length} documentos da pasta...`]);

    const fullDocs = sortedDocs.map(d => {
      const text = d.text !== undefined ? d.text : (textMap[d.id] || "");
      return { ...d, text };
    });

    const clientName = viewingClient === 'unassigned' ? '' : folderName;

    // Etapa 1: Auditoria Pré-Petição e Cruzamento de Dados
    setCompilationProgress(35);
    setCompilationTotal(1);
    setCompilationCurrentIndex(1);
    setCompilationStatusText("Auditando inconsistências cadastrais e divergências probatórias...");
    setCompilationLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🔍 Iniciando auditoria e cruzamento inteligente de dados entre todos os ${sortedDocs.length} documentos...`,
      `[${new Date().toLocaleTimeString()}] 📋 Analisando consistência de RGs, CPFs, Benefícios (NBs), CRMs médicos e grupo familiar...`
    ]);
    await new Promise(r => setTimeout(r, 450));

    const auditResult = generateFolderPrePetitionAudit(fullDocs, clientName);

    // Auditoria GERAL por IA: pega qualquer divergência factual entre documentos que as
    // checagens específicas de CPF/RG/CRM acima não cobrem (data de nascimento, endereço,
    // número de benefício, CID, etc.) — sem precisar de um regex novo pra cada campo.
    setCompilationLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🧠 Rodando auditoria geral de consistência via IA (além de CPF/RG/CRM)...`
    ]);
    const aiConsistencyResults = await generateAiConsistencyAudit(fullDocs, clientName);
    if (aiConsistencyResults.length > 0) {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Auditoria geral de IA encontrou ${aiConsistencyResults.length} divergência(s) adicional(is).`
      ]);
    }
    auditResult.substantiveAlerts = [...auditResult.substantiveAlerts, ...aiConsistencyResults.map(r => r.alert)];
    // Quando a IA devolveu candidatos exatos (2+), liga o mesmo botão de correção
    // automática do CPF/CRM. Se veio só 1 candidato ou nenhum, mostra só o aviso.
    let auditResultDivergences: (IdentityDivergence | undefined)[] = [
      ...auditResult.identityDivergences,
      ...aiConsistencyResults.map(r =>
        r.candidates.length >= 2 ? { label: "Auditoria Geral IA", candidates: r.candidates } : undefined
      ),
    ];

    // Monta o corpo dos documentos
    let docsBodyText = "";
    fullDocs.forEach((doc, i) => {
      docsBodyText += `------------------------------------------------------\n`;
      docsBodyText += `DOCUMENTO ${i + 1}: ${doc.name}\n`;
      docsBodyText += `Originalmente Escaneado em: ${formatDate(doc.ts)}\n`;
      docsBodyText += `------------------------------------------------------\n\n`;
      docsBodyText += `${doc.text || ""}\n\n\n\n`;
    });

    // Etapa 2: Execução Passo a Passo do Saneamento & Curadoria Ativa
    if (auditResult.curationRules.length > 0) {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ AUDITORIA DETECTOU: ${auditResult.curationRules.length} inconsistências e ruídos de leitura no lote.`,
        `[${new Date().toLocaleTimeString()}] 🛠️ Iniciando PROTOCOLO DE SANEAMENTO & CURADORIA AUTOMÁTICA...`
      ]);
      await new Promise(r => setTimeout(r, 400));

      for (let idx = 0; idx < auditResult.curationRules.length; idx++) {
        const rule = auditResult.curationRules[idx];
        const stepProgress = 38 + Math.round(((idx + 1) / auditResult.curationRules.length) * 18);
        setCompilationProgress(stepProgress);
        setCompilationStatusText(`Saneando: ${rule.title}...`);

        // Executa a curadoria real no corpo dos documentos
        docsBodyText = rule.run(docsBodyText);

        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ↳ ✅ [SANEAMENTO APLICADO ${idx + 1}/${auditResult.curationRules.length}]: ${rule.actionLog}`
        ]);
        await new Promise(r => setTimeout(r, 350));
      }

      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚖️ Saneamento inicial concluído: Todas as divergências foram curadas no corpo de texto com 100% de integridade probatória!`
      ]);
      await new Promise(r => setTimeout(r, 300));
    } else {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✨ Nenhuma divergência cadastral conflitante encontrada no cruzamento inicial.`
      ]);
      await new Promise(r => setTimeout(r, 300));
    }

    // Resolve sozinho as divergências de leitura com vencedor claro (não trava o compilado nem
    // pede escolha). O que sobrar é ambíguo de verdade e segue pra tela de decisão do advogado.
    // A divergência "Auditoria Geral IA" (ex.: datas de nascimento diferentes) nunca é automática:
    // pode ser conflito real entre documentos, não ruído.
    const autoCorrectionLines: string[] = [];
    {
      const keepAlerts: string[] = [];
      const keepDivs: (IdentityDivergence | undefined)[] = [];
      auditResult.substantiveAlerts.forEach((al, idx) => {
        const div = auditResultDivergences[idx];
        const winner = div && !div.label.startsWith("Auditoria Geral IA") ? pickConfidentWinner(docsBodyText, div) : null;
        if (div && winner) {
          docsBodyText = applyValueCorrection(docsBodyText, div.candidates, winner);
          autoCorrectionLines.push(`• ${div.label}: ${div.candidates.filter(c => c !== winner).join(' / ')} → ${winner}`);
        } else {
          keepAlerts.push(al);
          keepDivs.push(div);
        }
      });
      auditResult.substantiveAlerts = keepAlerts;
      auditResultDivergences = keepDivs;
    }
    if (autoCorrectionLines.length > 0) {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🤖 ${autoCorrectionLines.length} divergência(s) de leitura resolvida(s) automaticamente pelo valor dominante:`,
        ...autoCorrectionLines.map(l => `[${new Date().toLocaleTimeString()}] ↳ ${l}`)
      ]);
      await new Promise(r => setTimeout(r, 300));
    }

    let activeSubstantiveAlerts = auditResult.substantiveAlerts;

    if (auditResult.substantiveAlerts.length > 0) {
      setCompilationProgress(50);
      setCompilationStatusText("Aguardando decisão estratégica do advogado (Mérito / CNIS)...");
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ DECISÃO ESTRATÉGICA DO ADVOGADO NECESSÁRIA:`,
        `[${new Date().toLocaleTimeString()}] ↳ A IA detectou ${auditResult.substantiveAlerts.length} apontamento(s) de mérito (requerimentos posteriores no CNIS / DERs).`,
        `[${new Date().toLocaleTimeString()}] ❓ Selecione no painel acima se deseja OMITIR (compilado 100% limpo para petição da DER mais vantajosa) ou MANTER no cabeçalho.`
      ]);

      setSelectedStrategicAlerts(auditResult.substantiveAlerts.map((_, i) => i));
      // Pré-marca o valor mais frequente de cada divergência (o advogado só confirma, em 1 clique).
      const defaultChoices: Record<number, string> = {};
      auditResultDivergences.forEach((div, idx) => {
        if (!div || div.label.startsWith("Auditoria Geral IA")) return;
        const suggestion = pickDominantValue(docsBodyText, div);
        if (suggestion) defaultChoices[idx] = suggestion;
      });
      setDivergenceChoices(defaultChoices);
      setDivergenceCustomText({});

      const reviewResult = await new Promise<{ keptAlerts: string[]; corrections: { candidates: string[]; chosenValue: string }[] }>((resolve) => {
        setPendingStrategicReview({
          alerts: auditResult.substantiveAlerts,
          divergences: auditResultDivergences,
          resolve
        });
      });

      setPendingStrategicReview(null);
      activeSubstantiveAlerts = reviewResult.keptAlerts;

      if (reviewResult.corrections.length > 0) {
        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🛠️ Aplicando ${reviewResult.corrections.length} correção(ões) de dado confirmada(s) pelo advogado...`
        ]);
        reviewResult.corrections.forEach(corr => {
          docsBodyText = applyValueCorrection(docsBodyText, corr.candidates, corr.chosenValue);
        });
        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ✅ Correção(ões) aplicada(s) diretamente no texto do compilado.`
        ]);
        await new Promise(r => setTimeout(r, 300));
      }

      if (activeSubstantiveAlerts.length === 0) {
        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🎯 Decisão do Advogado: Alertas de mérito OMITIDOS! Compilado será entregue 100% limpo e focado na DER selecionada pelo patrono.`
        ]);
      } else {
        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 📋 Decisão do Advogado: ${activeSubstantiveAlerts.length} alerta(s) de mérito MANTIDO(S) no cabeçalho do relatório.`
        ]);
      }
      await new Promise(r => setTimeout(r, 350));
    }

    // Monta o texto consolidado com o relatório de auditoria e o corpo já curado
    const finalHeaderReport = buildAuditFormattedReport(
      auditResult.curationRules,
      activeSubstantiveAlerts,
      auditResult.degradedOcrDocs,
      autoCorrectionLines
    );

    let rawCompiledText = `COMPILADO DE DOCUMENTOS - LEXSCAN\n`;
    rawCompiledText += `Pasta: ${folderName}\n`;
    rawCompiledText += `Data de Exportação: ${new Date().toLocaleString('pt-BR')}\n`;
    rawCompiledText += `Quantidade de Documentos: ${sortedDocs.length}\n`;
    rawCompiledText += `======================================================\n\n`;
    rawCompiledText += finalHeaderReport;
    rawCompiledText += docsBodyText;

    // Etapa 3: Harmonização Global com IA
    setCompilationProgress(60);
    setCompilationStatusText("Consultando IA para harmonização global de grafias e nomes...");

    if (clientName) {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧠 IA acionada! Buscando inconsistências no nome do cliente principal: "${clientName}"...`,
        `[${new Date().toLocaleTimeString()}] 🔍 Verificando ortografia global, removendo ruídos de OCR e unificando grafias...`
      ]);
    } else {
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧠 IA acionada! Iniciando verificação de ortografia global e remoção de ruídos de OCR...`
      ]);
    }

    let finalCompiledText = rawCompiledText;
    try {
      setCompilationProgress(70);
      setCompilationStatusText("Processando refinamento global de textos com IA...");
      
      const refinedResult = await refineCompiledTextWithGemini(
        rawCompiledText, 
        clientName, 
        (msg) => setCompilationLogs(prev => [...prev, msg]),
        (progress, text) => {
          setCompilationProgress(progress);
          if (text) setCompilationStatusText(text);
        }
      );
      if (refinedResult && refinedResult.trim() !== "") {
        finalCompiledText = refinedResult;
        setCompilationLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ✨ IA concluiu a harmonização cadastral com sucesso!`,
          `[${new Date().toLocaleTimeString()}]   ↳ ✅ Todas as variações de nomes foram padronizadas sob "${clientName || 'Padrão Geral'}".`,
          `[${new Date().toLocaleTimeString()}]   ↳ ✅ Erros ortográficos, pontuações truncadas e símbolos de OCR foram removidos.`
        ]);
      } else {
        setCompilationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ⚠️ Resposta vazia da IA. Mantendo o compilado curado estruturado original.`]);
      }
    } catch (err: any) {
      console.error("Erro ao refinar compilado de textos com Gemini:", err);
      setCompilationLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Falha na otimização de IA: ${err.message || err}`,
        `[${new Date().toLocaleTimeString()}] ℹ️ Mantendo o compilado curado original de segurança.`
      ]);
    }

    setCompilationProgress(100);
    setCompilationStatusText("Compilado 100% curado e gerado com sucesso!");
    setCompilationLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🌟 COMPILADO CURADO: Arquivo consolidado e higienizado com sucesso para uso na petição inicial!`,
      `[${new Date().toLocaleTimeString()}] 🎉 Download do arquivo COMPILADO_${folderName.replace(/\s+/g, '_')}.txt iniciado.`
    ]);

    downloadTXT(finalCompiledText, `COMPILADO_${folderName.replace(/\s+/g, '_')}`);
    showToast("Compilado gerado e curado com sucesso!", "success");
  };

  const downloadFolderPDFsZip = async (mode: 'lite' | 'original' = 'lite') => {
    const isLite = mode === 'lite';
    const docs = history.filter(h => (viewingClient === 'unassigned' ? (!h.clientId || h.clientId === 'unassigned') : h.clientId === viewingClient));
    if (docs.length === 0) {
      showToast("Nenhum documento nesta pasta.", "info");
      return;
    }

    const folderName = viewingClient === 'unassigned' ? 'Geral' : clients.find(c => c.id === viewingClient)?.name || 'Pasta';
    showToast(isLite ? "Preparando download Lite otimizado para INSS/e-Proc..." : "Preparando download dos arquivos originais...");
    
    setTab("scanner");
    setProcessing(true);
    setProgress(0);
    setProgressMsg(isLite ? "Iniciando compactação inteligente..." : "Iniciando download...");

    let totalOriginalSize = 0;
    let totalLiteSize = 0;

    try {
      const zip = new JSZip();

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        setProgress(Math.round(((i) / docs.length) * 100));
        setProgressMsg(`[${i + 1}/${docs.length}] ${isLite ? 'Otimizando (INSS/e-Proc):' : 'Buscando:'} ${doc.name}`);

        try {
          let blob = await fetchItemBlob(doc, supabase);
          totalOriginalSize += blob.size;
          
          let entryName = doc.name || `Documento_${doc.id || i}`;
          
          // Identificar tipo
          const isPdf = doc.type === 'application/pdf' || (blob && blob.type === 'application/pdf') || entryName.toLowerCase().endsWith('.pdf');
          const isImage = (doc.type && doc.type.startsWith('image/')) || (blob && blob.type.startsWith('image/'));

          let fileToAdd = blob;

          // Se for versão Lite, aplicar compressão de alta fidelidade
          if (isLite) {
            try {
              if (isPdf) {
                fileToAdd = await compressPDF(blob, 'lite', (p, msg) => {
                  setProgressMsg(`[${i + 1}/${docs.length}] ${doc.name}: ${msg}`);
                });
              } else if (isImage) {
                fileToAdd = await compressImage(blob, 'lite');
              }
            } catch (cErr) {
              console.warn(`[Download Lite] Falha ao comprimir ${entryName}, utilizando original:`, cErr);
              fileToAdd = blob;
            }
          }

          totalLiteSize += fileToAdd.size;

          // Lógica de extensão limpa
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
          
          // Prevenção de duplicatas no arquivo compactado
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

          zip.file(finalEntryName, fileToAdd);
        } catch (err) {
          console.error("Erro no item:", doc.name, err);
        }
      }

      setProgress(95);
      setProgressMsg("Finalizando e iniciando download...");
      const content = await zip.generateAsync({ type: "blob" });
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `DOCS_${folderName.replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      if (isLite && totalOriginalSize > 0) {
        const origMb = (totalOriginalSize / (1024 * 1024)).toFixed(1);
        const liteMb = (totalLiteSize / (1024 * 1024)).toFixed(1);
        const redPerc = Math.max(0, Math.round(((totalOriginalSize - totalLiteSize) / totalOriginalSize) * 100));
        showToast(`✓ Download Lite concluído! De ${origMb}MB para ${liteMb}MB (-${redPerc}%) - Apto para INSS e e-Proc`, "success");
      } else {
        showToast("✓ Download concluído com sucesso!", "success");
      }
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

  const appContextValue = { serverKeys, aiMode, appendingDoc, applyCrop, applyImagePreset, batchDocName, cameraPages, clearCloudBatchSession, clientSearch, clients, compilationCurrentIndex, compilationLogs, compilationLogsEndRef, compilationProgress, compilationStatusText, compilationTotal, compileCameraBatch, compileFolderTXT, confColor, crop, croppedImgRef, currentQueueIndex, deleteBatchDocumentsHandler, deleteClientHandler, deleteFromHistory, discardDraft, divergenceChoices, divergenceCustomText, docSearch, downloadFolderPDFsZip, drag, editedText, effectiveFolderTab, file, fileRefBatchImg, fileRefImg, fileRefPdf, forcePaidKey, getStableThumbUrl, goldStandard, handleBatchImageAdd, handleCompressAndDownload, handleCreateClient, handleDownloadLite, handleDownloadTXTFromHistory, handleDrop, handleEditPage, handleFiles, handleForcePaidKeyChange, handleHardHandwritingChange, handleModelChange, handleNativeCameraCapture, handleRefineTextWithAI, handleRenameClient, handleRenameDocument, handleSaveManualEdit, hardHandwriting, hasRecoverableBatch, history, imageBrightness, imageContrast, imagePreset, imageSaturation, isAborting, isBatchModalOpen, isCompiling, isCreatingClient, isCropping, isEditingText, isFineTuningOpen, isFolderArchived, isGrayscale, isMovingBatch, isRecovering, isRefiningText, keyErrors, keyUsage, loadFromHistory, moveBatchDocumentsHandler, moveDocumentHandler, movePage, moveSearch, movingItem, nativeCameraRef, newClientName, newClientRenameValue, newDocumentName, pdfQuality, pendingStrategicReview, preview, process, processBatch, processFolderOCR, processHistoryItem, processing, progress, progressMsg, queue, recoverDraft, recoverFailedPages, removePageFromCloudBackup, renamingClient, renamingItem, result, rotateImage90, saveWithoutOCR, selectedClient, selectedDocIds, selectedModel, selectedStrategicAlerts, setAiMode, setAppendingDoc, setBatchDocName, setCameraPages, setClientSearch, setCompletedCrop, setCrop, setCroppingPageIndex, setDivergenceChoices, setDivergenceCustomText, setDocSearch, setDrag, setEditedText, setFile, setFolderTab, setGoldStandard, setImageBrightness, setImageContrast, setImagePreset, setImageSaturation, setIsAborting, setIsAuthSettingsOpen, setIsBatchModalOpen, setIsCompiling, setIsCreatingClient, setIsCropping, setIsEditingText, setIsFineTuningOpen, setIsGrayscale, setIsMovingBatch, setKeyErrors, setKeyUsage, setMoveSearch, setMovingItem, setNewClientName, setNewClientRenameValue, setNewDocumentName, setPdfQuality, setPreview, setProgressMsg, setQueue, setRenamingClient, setRenamingItem, setResult, setSelectedClient, setSelectedDocIds, setSelectedStrategicAlerts, setShowApiKeyDetails, setSortOrder, setStartPage, setTab, setUser, setViewingBatchPage, setViewingClient, showApiKeyDetails, showToast, skipCropAndAddPage, sortOrder, startAppendingPages, startPage, storageWarning, tab, toggleArchiveClient, uploadBatchWithoutOCR, user, viewingBatchPage, viewingClient, viewingPageLoading, viewingPageUrl };

  return (
    <AppContext.Provider value={appContextValue}>
      <style>{css}</style>

      {/* Câmera em tempo real escondida no canvas e renderização */}
      <canvas ref={canvasRef} style={{ display: "none" }} />







      {/* Crop Modal */}
      <CropModal />

      {/* Batch Compile Modal */}
      <BatchCameraModal />

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Move Document Modal (Individual ou em Lote) */}
      <MoveItemModal />

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
        <HeaderBar />

        {/* API STATUS DASHBOARD (DEMONSTRADOR) */}
        <ApiStatusPanel />

        {/* Content */}
        <div className="content">

          {/* ── SCANNER TAB ── */}
          <ScannerTab />

          {/* ── HISTORY TAB ── */}
          <HistoryTab />
        </div>
      </div>

      {/* Modal de Progresso da Compilação de Lote */}
      <CompileModal />
    </AppContext.Provider>
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
