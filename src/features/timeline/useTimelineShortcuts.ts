// Hook que escuta o teclado da janela e aplica os atalhos do editor quando há projeto aberto.
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { DEFAULT_KEYMAP, eventToCombo, isTypingTarget, resolveShortcut } from '@/utils/keymap';
import { runShortcut } from './runShortcut';

/** Indica se o alvo do evento está dentro de um diálogo modal, onde os atalhos não devem agir. */
function isInsideDialog(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"], [aria-modal="true"], dialog') !== null;
}

/** Registra os atalhos de teclado do editor na janela enquanto houver projeto aberto. */
export function useTimelineShortcuts(): void {
  const hasProject = useProjectStore((state) => state.project !== null);

  useEffect(() => {
    if (!hasProject) return undefined;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || isInsideDialog(e.target)) return;
      const combo = eventToCombo(e);
      const action = resolveShortcut(combo, DEFAULT_KEYMAP);
      if (action === null) return;
      // Segurar a barra não deve alternar play e pausa a cada repetição do teclado.
      if (action === 'playPause' && e.repeat) {
        e.preventDefault();
        return;
      }
      if (runShortcut(action)) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasProject]);
}
