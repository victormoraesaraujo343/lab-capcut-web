// Campos de configuração da exportação: nome, formato, resolução, fps, qualidade e tamanho estimado.
import { t } from '../../i18n/pt-BR';
import type { ExportFormat, ExportSettings, ResolutionPreset, BitratePreset } from '../../types/export';
import styles from './ExportDialog.module.css';

/** Fps fixo dos GIFs. */
const GIF_FPS = 15;
/** Quilobytes por megabyte e por gigabyte, em base decimal. */
const KB = 1_000;
const MB = 1_000_000;
const GB = 1_000_000_000;

/** Formatos oferecidos no seletor, na ordem de exibição. */
const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'mp4', label: t.export.formats.mp4 },
  { value: 'webm', label: t.export.formats.webm },
  { value: 'gif', label: t.export.formats.gif },
  { value: 'wav', label: t.export.formats.wav },
  { value: 'mp3', label: t.export.formats.mp3 },
];

/** Resoluções oferecidas, do menor para o maior. */
const RESOLUTION_OPTIONS: ReadonlyArray<{ value: ResolutionPreset; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p' },
  { value: '4k', label: '4K' },
];

/** Quadros por segundo oferecidos. */
const FPS_OPTIONS: ReadonlyArray<{ value: 24 | 30 | 60; label: string }> = [
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
];

/** Qualidades oferecidas. */
const BITRATE_OPTIONS: ReadonlyArray<{ value: BitratePreset; label: string }> = [
  { value: 'low', label: t.export.bitrates.low },
  { value: 'medium', label: t.export.bitrates.medium },
  { value: 'high', label: t.export.bitrates.high },
  { value: 'custom', label: t.export.bitrates.custom },
];

const sizeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Formata um tamanho em bytes como KB, MB ou GB, com vírgula decimal pt-BR. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${sizeFormat.format(bytes / GB)} GB`;
  if (bytes >= MB) return `${sizeFormat.format(bytes / MB)} MB`;
  return `${sizeFormat.format(bytes / KB)} KB`;
}

/** Propriedades do bloco de opções. */
export interface ExportOptionsProps {
  settings: ExportSettings;
  /** Nome sugerido quando o campo está vazio (nome do projeto). */
  placeholderName: string;
  /** Tamanho estimado do arquivo final, em bytes. */
  estimateBytes: number;
  /** Mostra o aviso do limite de 15 s do GIF. */
  showGifLimit: boolean;
  /** Mostra o aviso de modo compatível (sem codificador nativo). */
  showFallback: boolean;
  /** Mostra o aviso de arquivo grande (acima de 1,5 GB estimados). */
  showLargeFileWarning: boolean;
  /** Recebe só os campos alterados. */
  onChange: (patch: Partial<ExportSettings>) => void;
}

/** Grupo de botões de escolha única (radio). */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={selected ? `${styles.segment} ${styles.segmentOn}` : styles.segment}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Opções da exportação: campos de texto, escolhas e avisos. Só mostra resolução, fps e qualidade quando fazem sentido. */
export function ExportOptions({
  settings,
  placeholderName,
  estimateBytes,
  showGifLimit,
  showFallback,
  showLargeFileWarning,
  onChange,
}: ExportOptionsProps) {
  const audioOnly = settings.format === 'wav' || settings.format === 'mp3';
  const gif = settings.format === 'gif';
  const fpsOptions: ReadonlyArray<{ value: number; label: string }> = gif
    ? [{ value: GIF_FPS, label: String(GIF_FPS) }]
    : FPS_OPTIONS;

  return (
    <div className={styles.options}>
      <label className={styles.field}>
        <span className={styles.label}>{t.export.fileName}</span>
        <span className={styles.fileRow}>
          <input
            type="text"
            className={styles.input}
            value={settings.fileName}
            placeholder={placeholderName}
            onChange={(event) => onChange({ fileName: event.target.value })}
          />
          <span className={styles.extension}>.{settings.format}</span>
        </span>
      </label>

      <div className={styles.field}>
        <span className={styles.label}>{t.export.format}</span>
        <Segmented
          label={t.export.format}
          options={FORMAT_OPTIONS}
          value={settings.format}
          onChange={(format) => onChange({ format })}
        />
      </div>

      {!audioOnly && (
        <div className={styles.field}>
          <span className={styles.label}>{t.export.resolution}</span>
          <Segmented
            label={t.export.resolution}
            options={RESOLUTION_OPTIONS}
            value={settings.resolution}
            onChange={(resolution) => onChange({ resolution })}
          />
        </div>
      )}

      {!audioOnly && (
        <div className={styles.field}>
          <span className={styles.label}>{t.export.fps}</span>
          <Segmented
            label={t.export.fps}
            options={fpsOptions}
            value={gif ? GIF_FPS : settings.fps}
            disabled={gif}
            onChange={(fps) => {
              if (fps === 24 || fps === 30 || fps === 60) onChange({ fps });
            }}
          />
        </div>
      )}

      {!audioOnly && (
        <div className={styles.field}>
          <span className={styles.label}>{t.export.bitrate}</span>
          <Segmented
            label={t.export.bitrate}
            options={BITRATE_OPTIONS}
            value={settings.bitrate}
            onChange={(bitrate) => onChange({ bitrate })}
          />
          {settings.bitrate === 'custom' && (
            <label className={styles.inlineField}>
              <span className={styles.label}>{t.export.customBitrate}</span>
              <input
                type="number"
                className={styles.inputSmall}
                min={1}
                max={200}
                step={0.5}
                value={settings.customBitrateMbps}
                onChange={(event) => {
                  const mbps = event.target.valueAsNumber;
                  if (Number.isFinite(mbps)) onChange({ customBitrateMbps: mbps });
                }}
              />
            </label>
          )}
        </div>
      )}

      <div className={styles.estimate}>
        <span className={styles.label}>{t.export.estimate}</span>
        <strong>{formatBytes(estimateBytes)}</strong>
      </div>

      {showGifLimit && <p className={styles.notice} role="note">{t.export.gifLimit}</p>}
      {showFallback && <p className={styles.notice} role="note">{t.export.fallbackNotice}</p>}
      {showLargeFileWarning && <p className={styles.notice} role="note">{t.export.largeFileWarning}</p>}
    </div>
  );
}
