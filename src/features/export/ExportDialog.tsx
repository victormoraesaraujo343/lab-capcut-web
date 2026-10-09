// Diálogo de exportação: capa e dados do projeto à esquerda, opções ou progresso à direita e botão Exportar grande.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useObjectUrl } from '../media/useObjectUrl';
import { IconButton } from '../../components/IconButton';
import { canEncodeAac } from '../../engine/export/aacSupport';
import { canFetchLocalAssets } from '../../engine/env/runtimeEnv';
import { t } from '../../i18n/pt-BR';
import { DEFAULT_EXPORT_SETTINGS, GIF_MAX_MS, estimateSizeBytes, resolveExport } from '../../engine/export/exportSettings';
import type { ExportFormat, ExportSettings, BitratePreset, ResolutionPreset } from '../../types/export';
import type { Project } from '../../types/project';
import { formatDuration } from '../../utils/time';
import { downloadBlob } from './downloadBlob';
import {
  CANCELLED_MESSAGE,
  LARGE_FILE_BYTES,
  startExport,
  type ExportHandle,
  type ExportResult,
  type ExportUpdate,
} from './exportClient';
import { ExportOptions } from './ExportOptions';
import { ExportProgress, type ProgressView } from './ExportProgress';
import styles from './ExportDialog.module.css';

/** Chave do localStorage com as últimas escolhas de exportação. */
const SETTINGS_KEY = 'capcut-web:export-settings';
/** Seletores dos elementos que podem receber o foco dentro do diálogo. */
const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
const FORMATS: readonly ExportFormat[] = ['mp4', 'webm', 'gif', 'wav', 'mp3'];
const RESOLUTIONS: readonly ResolutionPreset[] = ['720p', '1080p', '1440p', '4k'];
const FPS_VALUES: readonly ExportSettings['fps'][] = [24, 30, 60];
const BITRATES: readonly BitratePreset[] = ['low', 'medium', 'high', 'custom'];

/** Situação do diálogo: formulário, em andamento, concluído, cancelado ou com erro. */
type Status = 'form' | 'running' | 'done' | 'cancelled' | 'error';

/** Devolve o valor se ele estiver na lista permitida; senão o padrão. */
function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

/** Valida as escolhas salvas; qualquer campo inválido volta ao padrão. O nome do arquivo não é salvo. */
function readSettings(value: unknown): ExportSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_EXPORT_SETTINGS;
  const raw = value as Record<string, unknown>;
  const mbps = raw.customBitrateMbps;
  return {
    format: pick(raw.format, FORMATS, DEFAULT_EXPORT_SETTINGS.format),
    resolution: pick(raw.resolution, RESOLUTIONS, DEFAULT_EXPORT_SETTINGS.resolution),
    fps: pick(raw.fps, FPS_VALUES, DEFAULT_EXPORT_SETTINGS.fps),
    bitrate: pick(raw.bitrate, BITRATES, DEFAULT_EXPORT_SETTINGS.bitrate),
    customBitrateMbps:
      typeof mbps === 'number' && Number.isFinite(mbps) && mbps > 0 ? mbps : DEFAULT_EXPORT_SETTINGS.customBitrateMbps,
    fileName: '',
  };
}

/** Troca o MP3 por WAV quando o app foi aberto do arquivo e o conversor não pode ser carregado. */
function withoutBlockedFormat(settings: ExportSettings): ExportSettings {
  return settings.format === 'mp3' && !canFetchLocalAssets() ? { ...settings, format: 'wav' } : settings;
}

/** Lê as escolhas salvas no navegador; sem acesso ao armazenamento usa o padrão. */
function loadSettings(): ExportSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return withoutBlockedFormat(raw === null ? DEFAULT_EXPORT_SETTINGS : readSettings(JSON.parse(raw) as unknown));
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

/** Guarda as escolhas para a próxima exportação; falhas de armazenamento são ignoradas. */
function saveSettings(settings: ExportSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, fileName: '' }));
  } catch {
    // Sem armazenamento disponível a escolha vale só para esta sessão.
  }
}

/** Primeira miniatura de uma mídia visual do projeto, usada como capa. */
function findCoverPath(project: Project): string | undefined {
  const asset = project.assets.find(
    (item) => (item.kind === 'video' || item.kind === 'image') && item.thumbnails.length > 0,
  );
  return asset?.thumbnails[0];
}

/** Código do erro vindo do cliente (a mensagem da exceção). */
function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : 'generic';
}

/** Propriedades do diálogo de exportação. */
export interface ExportDialogProps {
  project: Project;
  /** Fecha o diálogo; ignorado enquanto a exportação roda. */
  onClose: () => void;
}

/** Diálogo modal de exportação do projeto aberto. */
export function ExportDialog({ project, onClose }: ExportDialogProps) {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings);
  const [status, setStatus] = useState<Status>('form');
  const [progress, setProgress] = useState<ExportUpdate>({ phase: 'preparing', fraction: 0, etaMs: null });
  const [errorMessage, setErrorMessage] = useState('');
  const resultRef = useRef<ExportResult | null>(null);
  const handleRef = useRef<ExportHandle | null>(null);
  const runIdRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const coverPath = useMemo(() => findCoverPath(project), [project]);
  const coverUrl = useObjectUrl(coverPath);
  const estimateBytes = useMemo(
    () => estimateSizeBytes(resolveExport(project, settings)),
    [project, settings],
  );
  const showGifLimit = settings.format === 'gif' && project.durationMs > GIF_MAX_MS;
  const showLargeFile = estimateBytes > LARGE_FILE_BYTES;
  const showFallback =
    (settings.format === 'mp4' || settings.format === 'webm') && typeof VideoEncoder === 'undefined';
  const running = status === 'running';
  const [aacMissing, setAacMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    void canEncodeAac().then((ok) => {
      if (alive) setAacMissing(!ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  const showOpusNotice = settings.format === 'mp4' && aacMissing && !canFetchLocalAssets();

  // Foco vai para o diálogo ao abrir e volta para quem abriu ao fechar; cancela a exportação se o diálogo sair da tela.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      runIdRef.current += 1;
      handleRef.current?.cancel();
      previous?.focus();
    };
  }, []);

  // Ao mudar de situação, o foco vai para a ação principal da nova tela: Cancelar, Baixar ou tentar de novo.
  useEffect(() => {
    if (status === 'running') cancelRef.current?.focus();
    else if (status === 'done') downloadRef.current?.focus();
    else if (status === 'error') startRef.current?.focus();
  }, [status]);

  /** Atualiza só os campos informados nas escolhas. */
  const handleChange = useCallback((patch: Partial<ExportSettings>): void => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  /** Inicia a exportação, acompanha o progresso e baixa o arquivo quando termina. */
  const handleStart = (): void => {
    saveSettings(settings);
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    resultRef.current = null;
    setProgress({ phase: 'preparing', fraction: 0, etaMs: null });
    setStatus('running');
    const handle = startExport(project, settings, (update) => {
      if (runIdRef.current === runId) setProgress(update);
    });
    handleRef.current = handle;
    handle.result.then(
      (result) => {
        if (runIdRef.current !== runId) return;
        resultRef.current = result;
        setStatus('done');
        downloadBlob(result.blob, result.fileName);
      },
      (error: unknown) => {
        if (runIdRef.current !== runId) return;
        const code = errorCode(error);
        if (code === CANCELLED_MESSAGE) {
          setStatus('cancelled');
        } else {
          setErrorMessage(code);
          setStatus('error');
        }
      },
    );
  };

  /** Cancela a exportação em andamento. */
  const handleCancel = (): void => {
    handleRef.current?.cancel();
  };

  /** Baixa de novo o arquivo já pronto. */
  const handleDownload = (): void => {
    const result = resultRef.current;
    if (result) downloadBlob(result.blob, result.fileName);
  };

  /** Esc fecha (fora da exportação) e o Tab fica preso dentro do diálogo; as outras teclas não chegam aos atalhos do editor. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
    if (event.key === 'Escape') {
      if (running) return;
      event.preventDefault();
      onClose();
      return;
    }
    const dialog = dialogRef.current;
    if (event.key !== 'Tab' || dialog === null) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    const inside = active !== null && dialog.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  const view: ProgressView =
    status === 'running'
      ? { kind: 'running', phase: progress.phase, fraction: progress.fraction, etaMs: progress.etaMs }
      : status === 'done'
        ? { kind: 'done' }
        : status === 'cancelled'
          ? { kind: 'cancelled' }
          : { kind: 'error', message: errorMessage };

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{t.export.title}</h2>
          <IconButton icon={X} label={t.export.close} onClick={onClose} disabled={running} />
        </header>

        <div className={styles.body}>
          <aside className={styles.side}>
            <div className={styles.cover}>
              {coverUrl !== undefined && <img className={styles.coverImage} src={coverUrl} alt="" />}
            </div>
            <p className={styles.projectName}>{project.name}</p>
            <p className={styles.meta}>
              {t.export.duration}: {formatDuration(project.durationMs)}
            </p>
            <p className={styles.meta}>{t.export.noWatermark}</p>
          </aside>

          <section className={styles.main}>
            {status === 'form' ? (
              <ExportOptions
                settings={settings}
                placeholderName={project.name}
                estimateBytes={estimateBytes}
                showGifLimit={showGifLimit}
                showFallback={showFallback}
                showLargeFileWarning={showLargeFile}
                showOpusNotice={showOpusNotice}
                onChange={handleChange}
              />
            ) : (
              <ExportProgress view={view} />
            )}

            <footer className={styles.actions}>
              {status === 'form' || status === 'error' ? (
                <button ref={startRef} type="button" className={styles.primary} onClick={handleStart}>
                  {t.export.start}
                </button>
              ) : null}
              {running ? (
                <button ref={cancelRef} type="button" className={styles.secondary} onClick={handleCancel}>
                  {t.export.cancel}
                </button>
              ) : null}
              {status === 'done' ? (
                <>
                  <button ref={downloadRef} type="button" className={styles.primary} onClick={handleDownload}>
                    {t.export.download}
                  </button>
                  <button type="button" className={styles.secondary} onClick={() => setStatus('form')}>
                    {t.export.exportAgain}
                  </button>
                </>
              ) : null}
              {status === 'cancelled' ? (
                <button type="button" className={styles.primary} onClick={() => setStatus('form')}>
                  {t.export.exportAgain}
                </button>
              ) : null}
              {!running ? (
                <button type="button" className={styles.secondary} onClick={onClose}>
                  {t.export.close}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
