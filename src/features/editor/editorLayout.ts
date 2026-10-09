// Disposição do editor para o tamanho da janela. Função pura: não altera a store.

/** Tamanhos dos painéis escolhidos pelo usuário, em pixels. */
export interface EditorSizes {
  /** Largura do painel de mídia. */
  mediaWidth: number;
  /** Largura do painel de propriedades. */
  inspectorWidth: number;
  /** Altura da linha do tempo. */
  timelineHeight: number;
}

/** Disposição efetiva exibida: tamanhos usados e quais painéis laterais aparecem. */
export interface EditorLayout extends EditorSizes {
  /** Indica se o painel de mídia aparece. */
  showMedia: boolean;
  /** Indica se o painel de propriedades aparece. */
  showInspector: boolean;
}

/** Largura mínima da prévia, em pixels. */
export const PREVIEW_MIN_WIDTH = 360;
/** Altura mínima da linha do meio, em pixels. */
export const MIDDLE_MIN_HEIGHT = 220;
/** Largura mínima dos painéis laterais quando encolhidos, em pixels. */
export const SIDE_MIN_WIDTH = 200;
/** Altura mínima da linha do tempo, em pixels. */
export const TIMELINE_MIN_HEIGHT = 150;
/** Altura da barra superior, em pixels. */
export const TOP_BAR_HEIGHT = 44;
/** Espessura de cada alça de redimensionamento, em pixels. */
export const HANDLE_SIZE = 4;

/** Calcula os tamanhos e a visibilidade dos painéis que cabem na janela. */
export function computeEditorLayout(
  viewportW: number,
  viewportH: number,
  sizes: EditorSizes,
): EditorLayout {
  let mediaWidth = sizes.mediaWidth;
  let inspectorWidth = sizes.inspectorWidth;
  let showMedia = true;
  let showInspector = true;

  /** Verifica se a prévia tem a largura mínima com os painéis indicados. */
  const previewFits = (sm: boolean, si: boolean): boolean => {
    const used =
      (sm ? mediaWidth + HANDLE_SIZE : 0) + (si ? inspectorWidth + HANDLE_SIZE : 0);
    return viewportW - used >= PREVIEW_MIN_WIDTH;
  };

  // 1. Encolhe mídia e propriedades proporcionalmente, sem passar de SIDE_MIN_WIDTH.
  if (!previewFits(true, true)) {
    const excess = mediaWidth + inspectorWidth + 2 * HANDLE_SIZE + PREVIEW_MIN_WIDTH - viewportW;
    const mediaRoom = Math.max(0, mediaWidth - SIDE_MIN_WIDTH);
    const inspectorRoom = Math.max(0, inspectorWidth - SIDE_MIN_WIDTH);
    const room = mediaRoom + inspectorRoom;
    if (room > 0 && excess > 0) {
      const need = Math.min(excess, room);
      mediaWidth -= Math.ceil((need * mediaRoom) / room);
      inspectorWidth -= Math.ceil((need * inspectorRoom) / room);
    }
  }

  // 2. Se ainda faltar largura, esconde propriedades; depois mídia.
  if (!previewFits(true, true)) {
    showInspector = false;
  }
  if (!previewFits(showMedia, showInspector)) {
    showMedia = false;
  }

  // 3. Altura: a timeline encolhe até o mínimo para a linha do meio caber.
  const timelineRoom = viewportH - TOP_BAR_HEIGHT - HANDLE_SIZE - MIDDLE_MIN_HEIGHT;
  const timelineHeight = Math.min(sizes.timelineHeight, Math.max(TIMELINE_MIN_HEIGHT, timelineRoom));

  return { mediaWidth, inspectorWidth, timelineHeight, showMedia, showInspector };
}
