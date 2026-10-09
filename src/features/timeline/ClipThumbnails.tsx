// Miniaturas de um clipe de vídeo ou imagem: slots 16:9 lado a lado, só os que estão na área visível.
import type { Asset, Clip } from '@/types';
import { useObjectUrl } from '@/features/media/useObjectUrl';
import { thumbnailIndexForTime, visibleThumbSlots, type PxRange } from './clipGeometry';
import styles from './ClipView.module.css';

/** Proporção de cada miniatura. */
const THUMB_ASPECT = 16 / 9;

/** Propriedades das miniaturas de um clipe. */
export interface ClipThumbnailsProps {
  /** Clipe que mostra as miniaturas. */
  clip: Clip;
  /** Asset de origem das miniaturas. */
  asset: Asset;
  /** Zoom em pixels por segundo. */
  zoom: number;
  /** Altura disponível para as miniaturas, em px. */
  heightPx: number;
  /** Trecho do clipe visível, em px relativos ao clipe. */
  range: PxRange;
}

/** Faixa de miniaturas do clipe; cada slot mostra a miniatura do instante da mídia que cobre. */
export function ClipThumbnails({ clip, asset, zoom, heightPx, range }: ClipThumbnailsProps) {
  const slotWidth = heightPx * THUMB_ASPECT;
  const slots = visibleThumbSlots(clip, zoom, slotWidth, range);
  return (
    <div className={styles.thumbs} style={{ height: heightPx }} aria-hidden="true">
      {slots.map((slot) => (
        <ThumbSlot
          key={slot.leftPx}
          path={asset.thumbnails[thumbnailIndexForTime(asset, slot.mediaMs)]}
          leftPx={slot.leftPx}
          widthPx={slotWidth}
        />
      ))}
    </div>
  );
}

/** Propriedades de um slot de miniatura. */
interface ThumbSlotProps {
  /** Caminho OPFS da miniatura, ou undefined se não houver. */
  path: string | undefined;
  /** Posição do slot dentro do clipe, em px. */
  leftPx: number;
  /** Largura do slot, em px. */
  widthPx: number;
}

/** Um slot com a imagem da miniatura carregada do OPFS. */
function ThumbSlot({ path, leftPx, widthPx }: ThumbSlotProps) {
  const url = useObjectUrl(path);
  if (url === undefined) return null;
  return (
    <div className={styles.slot} style={{ left: leftPx, width: widthPx }}>
      <img className={styles.thumbImg} src={url} alt="" draggable={false} />
    </div>
  );
}
