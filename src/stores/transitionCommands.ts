// Comandos de transição: pôr, tirar e ajustar a transição de saída de um corte; cada um é um passo de histórico.
import type { Clip, Track, Transition } from '@/types';
import { defaultParams } from '@/engine/render/registry';
import { DEFAULT_TRANSITION_MS, TRANSITION_TYPES, registerTransitions } from '@/engine/render/transitions';
import { adjacentClipAfter } from '@/engine/render/transitionWindow';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { useTimelineStore } from './timelineStore';

/** Duração válida em ms: a dada se for positiva e finita, senão a padrão. */
function validDuration(durationMs: number | undefined): number {
  return durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0 ? durationMs : DEFAULT_TRANSITION_MS;
}

/** Monta uma transição do tipo dado com parâmetros padrão, ou null se o tipo não existir. */
function makeTransition(type: string, durationMs: number | undefined): Transition | null {
  if (!TRANSITION_TYPES.includes(type)) return null;
  registerTransitions();
  return { type, durationMs: validDuration(durationMs), params: defaultParams(type) };
}

/** Põe a transição na saída do clipe, só se houver um clipe encostado depois dele na mesma trilha. */
function putTransition(tracks: Track[], clipId: string, transition: Transition): Track[] {
  const found = findClip(tracks, clipId);
  if (found === null || adjacentClipAfter(found.track, found.clip) === null) return tracks;
  return updateClip(tracks, clipId, (c: Clip) => ({ ...c, transitionOut: transition }));
}

/** Põe uma transição na saída do clipe; sem vizinho encostado depois, ou tipo desconhecido, não faz nada. */
export function setTransition(clipId: string, type: string, durationMs?: number): void {
  const transition = makeTransition(type, durationMs);
  if (transition === null) return;
  useTimelineStore.getState().edit('transition', (tracks) => putTransition(tracks, clipId, transition));
}

/** Tira a transição de saída do clipe. */
export function removeTransition(clipId: string): void {
  useTimelineStore.getState().edit('transition-remove', (tracks) =>
    updateClip(tracks, clipId, (c) => (c.transitionOut === undefined ? c : { ...c, transitionOut: undefined })),
  );
}

/** Muda a duração da transição de saída do clipe, se ele tiver uma. */
export function setTransitionDuration(clipId: string, durationMs: number): void {
  const ms = validDuration(durationMs);
  useTimelineStore.getState().edit('transition-duration', (tracks) =>
    updateClip(tracks, clipId, (c) =>
      c.transitionOut === undefined ? c : { ...c, transitionOut: { ...c.transitionOut, durationMs: ms } },
    ),
  );
}

/** Põe a transição em todos os cortes de todas as trilhas de vídeo destravadas que tenham um clipe encostado depois. */
export function applyTransitionToAll(type: string, durationMs?: number): void {
  const transition = makeTransition(type, durationMs);
  if (transition === null) return;
  useTimelineStore.getState().edit('transition-all', (tracks) => {
    const ids = tracks
      .filter((track) => track.kind === 'video' && !track.locked)
      .flatMap((track) => track.clips.filter((c) => adjacentClipAfter(track, c) !== null).map((c) => c.id));
    return ids.reduce(
      (acc, id) => putTransition(acc, id, { ...transition, params: { ...transition.params } }),
      tracks,
    );
  });
}
