// Executa a ação de um atalho chamando o comando correspondente da timeline ou do player.
import type { ShortcutAction } from '@/utils/keymap';
import {
  copySelected,
  cutSelected,
  deleteSelected,
  duplicateSelected,
  goToEdge,
  goToEnd,
  goToStart,
  groupSelected,
  pasteAtPlayhead,
  selectAll,
  splitAtPlayhead,
  trimSelectedToPlayhead,
  ungroupSelected,
} from '@/stores/timelineCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';

/** Fator de zoom de uma aproximação ou afastamento por atalho ou botão. */
const ZOOM_IN_FACTOR = 1.25;
const ZOOM_OUT_FACTOR = 0.8;

/** Executa a ação do atalho; devolve true se tratou a ação, false se ela não pôde rodar agora (ex.: sem projeto). */
export function runShortcut(action: ShortcutAction): boolean {
  switch (action) {
    case 'playPause':
      usePlaybackStore.getState().togglePlay();
      return true;
    case 'split':
      splitAtPlayhead();
      return true;
    case 'delete':
      deleteSelected(false);
      return true;
    case 'rippleDelete':
      deleteSelected(true);
      return true;
    case 'undo':
      useTimelineStore.getState().undo();
      return true;
    case 'redo':
      useTimelineStore.getState().redo();
      return true;
    case 'duplicate':
      duplicateSelected();
      return true;
    case 'copy':
      copySelected();
      return true;
    case 'paste':
      pasteAtPlayhead();
      return true;
    case 'cut':
      cutSelected();
      return true;
    case 'trimStartToPlayhead':
      trimSelectedToPlayhead('start');
      return true;
    case 'trimEndToPlayhead':
      trimSelectedToPlayhead('end');
      return true;
    case 'prevEdge':
      goToEdge('prev');
      return true;
    case 'nextEdge':
      goToEdge('next');
      return true;
    case 'zoomIn':
      useTimelineStore.getState().zoomBy(ZOOM_IN_FACTOR);
      return true;
    case 'zoomOut':
      useTimelineStore.getState().zoomBy(ZOOM_OUT_FACTOR);
      return true;
    case 'selectAll':
      selectAll();
      return true;
    case 'group':
      groupSelected();
      return true;
    case 'ungroup':
      ungroupSelected();
      return true;
    case 'bladeTool':
      useTimelineStore.getState().setTool('blade');
      return true;
    case 'selectTool':
      useTimelineStore.getState().setTool('select');
      return true;
    case 'frameBack':
    case 'frameForward': {
      const fps = useProjectStore.getState().project?.fps;
      if (fps === undefined) return false;
      usePlaybackStore.getState().stepFrame(action === 'frameBack' ? -1 : 1, fps);
      return true;
    }
    case 'goToStart':
      goToStart();
      return true;
    case 'goToEnd':
      goToEnd();
      return true;
    case 'toggleSnap':
      useTimelineStore.getState().toggleSnap();
      return true;
  }
}
