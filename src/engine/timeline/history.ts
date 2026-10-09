// Histórico de desfazer/refazer por patches de trilha, sem cópias profundas (só referências).

import type { Track } from "@/types";

/** Mudança de uma trilha: estado anterior e posterior (null = a trilha não existia ou foi removida). */
export interface TrackPatch {
  /** Identificador da trilha alterada. */
  trackId: string;
  /** Trilha antes da mudança, ou null se não existia. */
  before: Track | null;
  /** Trilha depois da mudança, ou null se foi removida. */
  after: Track | null;
}

/** Uma ação desfazível: rótulo, trilhas alteradas e a ordem das trilhas antes e depois. */
export interface HistoryEntry {
  /** Nome legível da ação. */
  label: string;
  /** Trilhas que mudaram. */
  changes: TrackPatch[];
  /** Ordem dos ids de trilha antes da ação. */
  orderBefore: string[];
  /** Ordem dos ids de trilha depois da ação. */
  orderAfter: string[];
}

/** Pilhas de ações: passado (para desfazer) e futuro (para refazer). */
export interface HistoryState {
  /** Ações que podem ser desfeitas, da mais antiga para a mais recente. */
  past: HistoryEntry[];
  /** Ações que podem ser refeitas, a mais próxima primeiro. */
  future: HistoryEntry[];
}

/** Cria um histórico vazio. */
export function createHistory(): HistoryState {
  return { past: [], future: [] };
}

/** Compara duas listas de ids na mesma ordem. */
function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Gera a entrada de histórico entre dois estados de trilhas (comparação por id e referência); null se nada mudou. */
export function diffTracks(
  before: Track[],
  after: Track[],
  label: string,
): HistoryEntry | null {
  const beforeById = new Map(before.map((track) => [track.id, track]));
  const afterById = new Map(after.map((track) => [track.id, track]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  const changes: TrackPatch[] = [];
  for (const trackId of ids) {
    const prev = beforeById.get(trackId) ?? null;
    const next = afterById.get(trackId) ?? null;
    if (prev !== next) {
      changes.push({ trackId, before: prev, after: next });
    }
  }

  const orderBefore = before.map((track) => track.id);
  const orderAfter = after.map((track) => track.id);
  if (changes.length === 0 && sameOrder(orderBefore, orderAfter)) {
    return null;
  }
  return { label, changes, orderBefore, orderAfter };
}

/** Aplica uma entrada em modo desfazer ou refazer, reconstruindo as trilhas na ordem correta sem mutar a entrada. */
export function applyEntry(
  tracks: Track[],
  entry: HistoryEntry,
  direction: "undo" | "redo",
): Track[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  for (const change of entry.changes) {
    const target = direction === "undo" ? change.before : change.after;
    if (target === null) {
      byId.delete(change.trackId);
    } else {
      byId.set(change.trackId, target);
    }
  }

  const order = direction === "undo" ? entry.orderBefore : entry.orderAfter;
  const result: Track[] = [];
  const placed = new Set<string>();
  for (const trackId of order) {
    const track = byId.get(trackId);
    if (track !== undefined && !placed.has(trackId)) {
      result.push(track);
      placed.add(trackId);
    }
  }
  for (const track of tracks) {
    if (!placed.has(track.id) && byId.get(track.id) === track) {
      result.push(track);
      placed.add(track.id);
    }
  }
  for (const change of entry.changes) {
    const track = byId.get(change.trackId);
    if (track !== undefined && !placed.has(change.trackId)) {
      result.push(track);
      placed.add(change.trackId);
    }
  }
  return result;
}

/** Registra uma nova ação no passado e descarta o futuro. */
export function pushEntry(h: HistoryState, e: HistoryEntry): HistoryState {
  return { past: [...h.past, e], future: [] };
}

/** Desfaz a última ação; retorna o histórico e as trilhas novas, ou null se não há o que desfazer. */
export function undo(
  h: HistoryState,
  tracks: Track[],
): { history: HistoryState; tracks: Track[] } | null {
  const entry = h.past[h.past.length - 1];
  if (entry === undefined) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [entry, ...h.future] },
    tracks: applyEntry(tracks, entry, "undo"),
  };
}

/** Refaz a ação mais próxima do futuro; retorna o histórico e as trilhas novas, ou null se não há o que refazer. */
export function redo(
  h: HistoryState,
  tracks: Track[],
): { history: HistoryState; tracks: Track[] } | null {
  const entry = h.future[0];
  if (entry === undefined) return null;
  return {
    history: { past: [...h.past, entry], future: h.future.slice(1) },
    tracks: applyEntry(tracks, entry, "redo"),
  };
}

/** Indica se há ação para desfazer. */
export function canUndo(h: HistoryState): boolean {
  return h.past.length > 0;
}

/** Indica se há ação para refazer. */
export function canRedo(h: HistoryState): boolean {
  return h.future.length > 0;
}
