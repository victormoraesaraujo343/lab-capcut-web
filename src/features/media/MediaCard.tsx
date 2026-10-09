// Card de um asset da biblioteca: miniatura, duração, nome, arrastar e menu de ações.

import { useState, type DragEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { Film, Image, Music, Ellipsis } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { formatDuration } from '@/utils/time';
import type { Asset, AssetKind, Folder } from '@/types/project';
import { useObjectUrl } from './useObjectUrl';
import styles from './MediaCard.module.css';

/** Tipo MIME usado para arrastar um asset de dentro do painel. */
export const ASSET_DRAG_MIME = 'application/x-capcut-asset';

/** Número de barras desenhadas na miniatura de forma de onda. */
const WAVE_BARS = 40;

export interface MediaCardProps {
  /** Asset exibido pelo card. */
  asset: Asset;
  /** Pastas disponíveis para o menu "mover para pasta". */
  folders: Folder[];
  /** Move o asset para a pasta dada, ou para fora de pastas quando undefined. */
  onMove: (assetId: string, folderId: string | undefined) => void;
  /** Remove o asset da biblioteca. */
  onRemove: (assetId: string) => void;
}

/** Indica se um DataTransfer carrega um asset arrastado de dentro do painel. */
export function isAssetDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ASSET_DRAG_MIME);
}

/** Card de mídia com miniatura 16:9, duração, tipo, nome e menu de ações; arrastável para a linha do tempo. */
export function MediaCard({ asset, folders, onMove, onRemove }: MediaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const thumbUrl = useObjectUrl(asset.thumbnails[0]);
  const durationLabel =
    (asset.kind === 'video' || asset.kind === 'audio') && asset.durationMs !== undefined
      ? formatDuration(asset.durationMs)
      : undefined;

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function handleMenuBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setMenuOpen(false);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && menuOpen) {
      setMenuOpen(false);
    }
  }

  function moveTo(folderId: string | undefined) {
    setMenuOpen(false);
    onMove(asset.id, folderId);
  }

  return (
    <li className={styles.card} data-menu-open={menuOpen ? 'true' : undefined}>
      <div className={styles.surface} draggable tabIndex={0} onDragStart={handleDragStart}>
        <div className={styles.thumb}>
          {thumbUrl !== undefined ? (
            <img className={styles.image} src={thumbUrl} alt="" draggable={false} />
          ) : (
            <Placeholder asset={asset} />
          )}
          {durationLabel !== undefined ? <span className={styles.duration}>{durationLabel}</span> : null}
        </div>
        <div className={styles.meta}>
          <KindIcon kind={asset.kind} />
          <span className={styles.name} title={asset.name}>
            {asset.name}
          </span>
        </div>
      </div>

      <div className={styles.menuWrap} onBlur={handleMenuBlur} onKeyDown={handleMenuKeyDown}>
        <IconButton
          icon={Ellipsis}
          label={t.home.moreActions}
          className={styles.moreButton}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        />
        {menuOpen ? (
          <div className={styles.menu}>
            <span className={styles.menuCaption}>{t.media.moveToFolder}</span>
            <button
              type="button"
              className={styles.menuItem}
              disabled={asset.folderId === undefined}
              onClick={() => moveTo(undefined)}
            >
              {t.media.noFolder}
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={styles.menuItem}
                disabled={asset.folderId === folder.id}
                onClick={() => moveTo(folder.id)}
              >
                {folder.name}
              </button>
            ))}
            <span className={styles.menuDivider} aria-hidden="true" />
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuDanger}`}
              onClick={() => onRemove(asset.id)}
            >
              {t.media.removeAsset}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

interface PlaceholderProps {
  /** Asset sem miniatura carregada. */
  asset: Asset;
}

/** Miniatura de substituição: forma de onda para áudio com picos, ícone do tipo nos demais casos. */
function Placeholder({ asset }: PlaceholderProps) {
  const peaks = asset.waveform ?? [];
  if (asset.kind === 'audio' && peaks.length > 0) {
    return <Waveform peaks={peaks} />;
  }
  return (
    <div className={styles.fallback}>
      <KindIcon kind={asset.kind} large />
    </div>
  );
}

interface KindIconProps {
  /** Tipo de mídia a representar. */
  kind: AssetKind;
  /** Usa tamanho grande para a área de miniatura. */
  large?: boolean;
}

/** Ícone do tipo de mídia com rótulo acessível. */
function KindIcon({ kind, large = false }: KindIconProps) {
  const size = large ? 28 : 14;
  const label = t.media.kinds[kind];
  const Icon = kind === 'video' ? Film : kind === 'audio' ? Music : Image;
  return (
    <span className={large ? styles.kindLarge : styles.kind} role="img" aria-label={label} title={label}>
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

interface WaveformProps {
  /** Picos normalizados entre 0 e 1. */
  peaks: number[];
}

/** Mini forma de onda em SVG, amostrada em barras a partir dos picos do áudio. */
function Waveform({ peaks }: WaveformProps) {
  const bars = sampleBars(peaks, WAVE_BARS);
  return (
    <svg className={styles.wave} viewBox={`0 0 ${WAVE_BARS} 40`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((peak, index) => {
        const height = Math.max(1, peak * 40);
        return <rect key={index} x={index + 0.25} y={(40 - height) / 2} width={0.5} height={height} rx={0.25} />;
      })}
    </svg>
  );
}

/** Reduz os picos a `count` valores, usando o máximo de cada faixa. */
function sampleBars(peaks: number[], count: number): number[] {
  if (peaks.length === 0) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * peaks.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / count));
    let max = 0;
    for (let i = start; i < end && i < peaks.length; i += 1) {
      max = Math.max(max, peaks[i] ?? 0);
    }
    return Math.min(1, max);
  });
}
