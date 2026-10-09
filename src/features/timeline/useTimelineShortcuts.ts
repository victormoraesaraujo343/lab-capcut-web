// Hook que escuta o teclado da janela e aplica os atalhos do editor (com as combinações personalizadas) quando há projeto aberto.
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { comboFromEvent, isInsideDialog, isTypingTarget } from '@/features/shortcuts/keyCombo';
import { useShortcutsStore } from '@/features/shortcuts/shortcutsStore';
import { runShortcut } from './runShortcut';

/** Registra os atalhos de teclado do editor na janela enquanto houver projeto aberto. */
export function useTimelineShortcuts(): void {
  const hasProject = useProjectStore((state) => state.project !== null);

  useEffect(() => {
    if (!hasProject) return undefined;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || isInsideDialog(e.target)) return;
      const id = useShortcutsStore.getState().actionForCombo(comboFromEvent(e));
      // Ajuda e painel de atalhos são abertos pela barra superior, que também existe fora do editor.
      if (id === null || id === 'help' || id === 'shortcuts') return;
      // Segurar a barra não deve alternar play e pausa a cada repetição do teclado.
      if (id === 'playPause' && e.repeat) {
        e.preventDefault();
        return;
      }
      if (runShortcut(id)) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasProject]);
}
