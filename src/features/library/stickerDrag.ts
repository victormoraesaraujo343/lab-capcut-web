// Arrasto de figurinhas: a miniatura leva o id (catálogo ou asset) no dataTransfer; a linha do tempo solta a figurinha no instante e na trilha do drop.

import { findSticker } from '@/engine/stickers/stickerCatalog';
import { addSticker, placeStickerAsset } from '@/stores/stickerCommands';
import { runWithToast } from '@/stores/toastStore';
import { t } from '@/i18n/pt-BR';

/** Tipo MIME gravado no dataTransfer ao arrastar uma figurinha. */
export const STICKER_DRAG_MIME = 'application/x-capcut-sticker';

/** Grava o id da figurinha no dataTransfer ao começar o arrasto. */
export function beginStickerDrag(event: DragEvent, id: string): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(STICKER_DRAG_MIME, id);
  }
}

/** Diz se o arrasto em curso é de figurinha (pelo MIME, que dá para ler no dragover). */
export function carriesSticker(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer !== null && Array.from(dataTransfer.types).includes(STICKER_DRAG_MIME);
}

/** Id da figurinha trazida por um drop; null se o drop não é de figurinha. */
export function readStickerDrop(dataTransfer: DataTransfer | null): string | null {
  if (dataTransfer === null || !carriesSticker(dataTransfer)) return null;
  const id = dataTransfer.getData(STICKER_DRAG_MIME);
  return id === '' ? null : id;
}

/** Põe a figurinha solta no instante dado; trilha preferida só se for de figurinha. Catálogo é importado antes, se preciso. */
export function dropSticker(id: string, startMs: number, trackId?: string): void {
  if (findSticker(id) !== undefined) {
    void runWithToast(addSticker(id, startMs, trackId), t.stickers.addError);
    return;
  }
  placeStickerAsset(id, startMs, trackId);
}
