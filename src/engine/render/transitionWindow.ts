// Janela de transição entre clipes encostados da mesma trilha: cálculo puro, sem estado.
import { clipEndMs, type Clip, type Track, type Transition } from '@/types';

/** Tolerância, em ms, para considerar dois clipes encostados. */
const ADJACENT_TOLERANCE_MS = 1;

/** Intervalo de uma transição na timeline: início, fim, corte e duração efetiva, em ms. */
export interface TransitionSpan {
  /** Início da janela (corte menos metade da duração). */
  startMs: number;
  /** Fim da janela (corte mais metade da duração). */
  endMs: number;
  /** Instante do corte entre os dois clipes. */
  cutMs: number;
  /** Duração efetiva, já limitada pelos clipes. */
  durationMs: number;
}

/** Transição ativa num instante: os dois clipes, o progresso de 0 a 1 e a transição. */
export interface ActiveTransition {
  /** Clipe que sai (guarda a transição em transitionOut). */
  outgoing: Clip;
  /** Clipe que entra. */
  incoming: Clip;
  /** Progresso da transição, de 0 (início da janela) a 1 (fim). */
  progress: number;
  /** Transição configurada no clipe que sai. */
  transition: Transition;
  /** Instante do corte, em ms da timeline. */
  cutMs: number;
}

/** Diz se o segundo clipe começa onde o primeiro termina (com tolerância de 1 ms). */
export function isAdjacent(outgoing: Clip, incoming: Clip): boolean {
  return outgoing.id !== incoming.id && Math.abs(clipEndMs(outgoing) - incoming.startMs) <= ADJACENT_TOLERANCE_MS;
}

/** Acha o clipe da mesma trilha que encosta depois do clipe dado, ou null. */
export function adjacentClipAfter(track: Track, clip: Clip): Clip | null {
  return track.clips.find((other) => isAdjacent(clip, other)) ?? null;
}

/** Calcula a janela da transição entre dois clipes encostados, ou null se não estiverem encostados ou a duração for zero. */
export function transitionSpan(outgoing: Clip, incoming: Clip, transition: Transition): TransitionSpan | null {
  if (!isAdjacent(outgoing, incoming)) return null;
  const durationMs = Math.min(transition.durationMs, outgoing.durationMs / 2, incoming.durationMs / 2);
  if (!(durationMs > 0)) return null;
  const cutMs = clipEndMs(outgoing);
  return { startMs: cutMs - durationMs / 2, endMs: cutMs + durationMs / 2, cutMs, durationMs };
}

/** Devolve a transição que está acontecendo na trilha no instante dado, ou null se nenhuma. */
export function activeTransition(track: Track, timelineMs: number): ActiveTransition | null {
  for (const outgoing of track.clips) {
    const transition = outgoing.transitionOut;
    if (transition === undefined) continue;
    const incoming = adjacentClipAfter(track, outgoing);
    if (incoming === null) continue;
    const span = transitionSpan(outgoing, incoming, transition);
    if (span === null || timelineMs < span.startMs || timelineMs >= span.endMs) continue;
    const progress = (timelineMs - span.startMs) / span.durationMs;
    return { outgoing, incoming, progress, transition, cutMs: span.cutMs };
  }
  return null;
}

/** Tempo local do clipe que sai, em ms da timeline desde o início dele; pode passar da duração (a composição prende à mídia). */
export function outgoingLocalMs(outgoing: Clip, timelineMs: number): number {
  return timelineMs - outgoing.startMs;
}

/** Tempo local do clipe que entra, em ms da timeline desde o início dele; pode ser negativo antes do início (a composição prende à mídia). */
export function incomingLocalMs(incoming: Clip, timelineMs: number): number {
  return timelineMs - incoming.startMs;
}
