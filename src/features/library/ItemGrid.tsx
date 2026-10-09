// Grade de cartões da biblioteca: busca por nome no topo, foco por setas, Enter/clique = ação principal e cartões arrastáveis.

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip, Track } from '@/types';
import styles from './ItemGrid.module.css';

/** Tipos de trilha que recebem efeitos, filtros e transições. */
const VISUAL_TRACK_KINDS: readonly string[] = ['video', 'sticker'];

/** Lista vazia reaproveitada quando não há projeto aberto. */
const NO_TRACKS: readonly Track[] = [];

/** Item de uma grade: miniatura, nome, ação principal e arrasto opcional. */
export interface GridItem {
  /** Identificador estável do item (chave do React). */
  id: string;
  /** Nome exibido, também usado na busca. */
  name: string;
  /** Miniatura do cartão (normalmente ItemThumb). */
  thumbnail: ReactNode;
  /** Cartão desabilitado: não age ao clicar e mostra a dica. */
  disabled?: boolean;
  /** Ação principal, disparada por clique ou Enter. */
  onActivate: () => void;
  /** Início do arrasto (evento nativo); presente só nos itens arrastáveis. */
  onDragStart?: (event: DragEvent) => void;
  /** Fim do arrasto. */
  onDragEnd?: () => void;
}

/** Propriedades da grade de cartões. */
export interface ItemGridProps {
  /** Itens na ordem de exibição. */
  items: readonly GridItem[];
  /** Nome acessível da grade. */
  label: string;
  /** Dica acima da grade, ex.: por que os cartões estão desabilitados. */
  notice?: string;
  /** Controles extras acima da grade, ex.: botão Aplicar em todos. */
  toolbar?: ReactNode;
}

/** Clipe visual selecionado com a trilha dele. */
export interface SelectedVisualClip {
  /** Trilha do clipe. */
  track: Track;
  /** Clipe selecionado. */
  clip: Clip;
}

/** Normaliza um texto para busca: minúsculas e sem acentos. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Miniatura 16:9 de um cartão, com a cor ou o degradê dado como fundo. */
export function ItemThumb({ background, children }: { background: string; children?: ReactNode }) {
  const style: CSSProperties = { background };
  return (
    <span className={styles.thumb} style={style}>
      {children}
    </span>
  );
}

/** Primeiro clipe visual da seleção, com a trilha dele; null se a seleção não tem clipe visual. */
export function findSelectedVisualClip(
  tracks: readonly Track[],
  selectedIds: readonly string[],
): SelectedVisualClip | null {
  for (const id of selectedIds) {
    for (const track of tracks) {
      if (!VISUAL_TRACK_KINDS.includes(track.kind)) continue;
      const clip = track.clips.find((candidate) => candidate.id === id);
      if (clip !== undefined) return { track, clip };
    }
  }
  return null;
}

/** Clipe visual selecionado no momento, com a trilha dele; null se nenhum. */
export function useSelectedVisualClip(): SelectedVisualClip | null {
  const tracks = useProjectStore((s) => s.project?.tracks ?? NO_TRACKS);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  return useMemo(() => findSelectedVisualClip(tracks, selectedIds), [tracks, selectedIds]);
}

/** Grade de cartões com busca, foco por teclado (roving tabindex) e ação principal em clique ou Enter. */
export function ItemGrid({ items, label, notice, toolbar }: ItemGridProps) {
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const needle = normalize(query.trim());
  const visible = useMemo(
    () => (needle === '' ? items : items.filter((item) => normalize(item.name).includes(needle))),
    [items, needle],
  );
  const activeIndex = Math.min(focusIndex, Math.max(0, visible.length - 1));

  /** Quantas colunas a grade tem agora, para as setas para cima e para baixo. */
  function columnCount(): number {
    const grid = gridRef.current;
    if (grid === null) return 1;
    const columns = window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, columns);
  }

  /** Move o foco para o cartão no índice dado, limitado aos cartões visíveis. */
  function moveFocus(next: number) {
    const index = Math.min(Math.max(0, next), visible.length - 1);
    setFocusIndex(index);
    cardRefs.current[index]?.focus();
  }

  /** Setas, Home e End movem o foco entre os cartões. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (visible.length === 0) return;
    const moves: Partial<Record<string, number>> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      ArrowDown: activeIndex + columnCount(),
      ArrowUp: activeIndex - columnCount(),
      Home: 0,
      End: visible.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveFocus(next);
  }

  /** Clique na ação principal; cartão desabilitado não faz nada. */
  function activate(item: GridItem) {
    if (item.disabled === true) return;
    item.onActivate();
  }

  return (
    <div className={styles.root}>
      {toolbar}
      <div className={styles.searchWrap}>
        <Search className={styles.searchIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          className={styles.search}
          placeholder={t.library.searchItems}
          aria-label={t.library.searchItems}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setFocusIndex(0);
          }}
        />
      </div>
      {notice !== undefined ? <p className={styles.notice}>{notice}</p> : null}
      {visible.length === 0 ? (
        <p className={styles.notice}>{t.library.noResults}</p>
      ) : (
        <div ref={gridRef} className={styles.grid} role="group" aria-label={label} onKeyDown={handleKeyDown}>
          {visible.map((item, index) => {
            const disabled = item.disabled === true;
            const cardClass = disabled ? `${styles.card} ${styles.cardDisabled}` : styles.card;
            return (
              <button
                key={item.id}
                ref={(element) => {
                  cardRefs.current[index] = element;
                }}
                type="button"
                className={cardClass}
                tabIndex={index === activeIndex ? 0 : -1}
                aria-disabled={disabled}
                title={disabled && notice !== undefined ? notice : item.name}
                draggable={item.onDragStart !== undefined}
                onFocus={() => setFocusIndex(index)}
                onClick={() => activate(item)}
                onDragStart={
                  item.onDragStart === undefined
                    ? undefined
                    : (event) => {
                        item.onDragStart?.(event.nativeEvent);
                      }
                }
                onDragEnd={item.onDragEnd}
              >
                {item.thumbnail}
                <span className={styles.cardName}>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
