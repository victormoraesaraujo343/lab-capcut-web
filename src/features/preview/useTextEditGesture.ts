// Duplo clique sobre um texto da prévia abre o editor inline sobre ele; some ao começar a reprodução.
import { useCallback, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import type { Layer, Project } from '@/types';
import { hitTestLayers, isClipLocked, type Point } from './transformGestures';

/** Entradas do gesto de edição de texto. */
interface TextEditGestureOptions {
  /** Projeto aberto, ou null. */
  project: Project | null;
  /** Camadas do instante, com o tamanho do texto já medido. */
  layers: Layer[];
  /** Escala de exibição (px da tela por px do projeto). */
  scale: number;
  /** Se a reprodução está rodando. */
  isPlaying: boolean;
  /** Elemento da prévia, usado para converter o ponto do mouse. */
  stageRef: RefObject<HTMLDivElement>;
  /** Converte as coordenadas do evento em px do projeto. */
  pointOf: (stage: HTMLDivElement | null, e: { clientX: number; clientY: number }, scale: number) => Point;
}

/** Estado e handlers do editor de texto inline da prévia. */
export interface TextEditGesture {
  /** Id do clipe em edição, ou null se nenhum estiver sendo editado. */
  editingClipId: string | null;
  /** Fecha o editor de texto. */
  closeEditor: () => void;
  /** Handler de duplo clique na prévia: abre o editor se a camada de cima for texto de trilha não travada. */
  onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

/** Gerencia o editor de texto aberto por duplo clique na prévia. */
export function useTextEditGesture(options: TextEditGestureOptions): TextEditGesture {
  const { project, layers, scale, isPlaying, stageRef, pointOf } = options;
  const [editingClipId, setEditingClipId] = useState<string | null>(null);

  // Fecha o editor ao começar a reprodução (ajuste de estado durante a renderização, sem efeito).
  const [wasPlaying, setWasPlaying] = useState(isPlaying);
  if (wasPlaying !== isPlaying) {
    setWasPlaying(isPlaying);
    if (isPlaying) setEditingClipId(null);
  }

  /** Fecha o editor de texto. */
  const closeEditor = useCallback((): void => setEditingClipId(null), []);

  /** Duplo clique: se a camada de cima no ponto for texto (trilha não travada), abre o editor sobre ela; mídia não faz nada. */
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (project === null || scale <= 0 || isPlaying) return;
    const p = pointOf(stageRef.current, e, scale);
    const hitId = hitTestLayers(layers, project.width, project.height, p);
    if (hitId === null) return;
    const hit = layers.find((l) => l.clipId === hitId);
    if (hit?.text === undefined || isClipLocked(project, hitId)) return;
    setEditingClipId(hitId);
  };

  return { editingClipId, closeEditor, onDoubleClick };
}
