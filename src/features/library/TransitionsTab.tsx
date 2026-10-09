// Aba Transições: grade de transições que clicar põe no corte do clipe selecionado; cartões também arrastam até a linha do tempo.

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { TRANSITION_TYPES } from '@/engine/render/transitions';
import { adjacentClipAfter } from '@/engine/render/transitionWindow';
import { t } from '@/i18n/pt-BR';
import { applyTransitionToAll, setTransition } from '@/stores/transitionCommands';
import { beginTransitionDrag, endTransitionDrag } from './transitionDrag';
import { transitionThumbnail } from './itemThumbnails';
import { ItemGrid, ItemThumb, useSelectedVisualClip, type GridItem } from './ItemGrid';
import styles from './TransitionsTab.module.css';

/** Transição usada enquanto o usuário ainda não escolheu nenhuma nesta aba. */
const DEFAULT_TRANSITION = 'dissolve';

/** Nomes de exibição das transições, por tipo. */
const TRANSITION_NAMES: Partial<Record<string, string>> = t.transitions.names;

/** Aba Transições: grade das transições, aplicadas ao corte do clipe selecionado ou arrastadas até ele. */
export function TransitionsTab() {
  const selected = useSelectedVisualClip();
  const [lastType, setLastType] = useState<string>(DEFAULT_TRANSITION);
  const canTransition = selected !== null && adjacentClipAfter(selected.track, selected.clip) !== null;
  const clipId = selected !== null && canTransition ? selected.clip.id : null;

  let notice: string | undefined;
  if (selected === null) notice = t.library.selectClipFirst;
  else if (!canTransition) notice = t.transitions.dropHint;

  const items: GridItem[] = TRANSITION_TYPES.map((type) => {
    const { Icon, background } = transitionThumbnail(type);
    return {
      id: type,
      name: TRANSITION_NAMES[type] ?? type,
      thumbnail: (
        <ItemThumb background={background}>
          <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
        </ItemThumb>
      ),
      disabled: clipId === null,
      onActivate: () => {
        setLastType(type);
        if (clipId !== null) setTransition(clipId, type);
      },
      onDragStart: (event) => {
        setLastType(type);
        beginTransitionDrag(event, type);
      },
      onDragEnd: endTransitionDrag,
    };
  });

  const toolbar = (
    <button
      type="button"
      className={styles.applyAll}
      onClick={() => {
        applyTransitionToAll(lastType);
      }}
    >
      <Layers size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{t.transitions.applyAll}</span>
    </button>
  );

  return <ItemGrid items={items} label={t.library.tabs.transitions} notice={notice} toolbar={toolbar} />;
}
