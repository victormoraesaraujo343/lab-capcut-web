// Comandos de formas: criar uma forma no cursor (trilha de adesivo livre) e alterar suas propriedades.
import type { Clip, ShapeData, Track } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createShapeClip } from '@/engine/timeline/clipFactory';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { addTrack, sortClips } from '@/engine/timeline/trackOps';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Padrões de cada tipo de forma ao ser criada. */
const SHAPE_DEFAULTS: Record<ShapeData['shape'], ShapeData> = {
  rectangle: { shape: 'rectangle', width: 600, height: 340, cornerRadius: 24, fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 0 },
  circle: { shape: 'circle', width: 400, height: 400, cornerRadius: 0, fill: '#f43f5e', stroke: '#ffffff', strokeWidth: 0 },
  arrow: { shape: 'arrow', width: 600, height: 0, cornerRadius: 0, fill: '#facc15', stroke: '#facc15', strokeWidth: 18 },
  line: { shape: 'line', width: 600, height: 0, cornerRadius: 0, fill: 'transparent', stroke: '#ffffff', strokeWidth: 12 },
};

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Primeira trilha de adesivo não travada, livre no intervalo [startMs, endMs); undefined se nenhuma estiver livre. */
function freeStickerTrack(tracks: Track[], startMs: number, endMs: number): Track | undefined {
  return tracks.find(
    (track) =>
      track.kind === 'sticker' &&
      !track.locked &&
      track.clips.every((clip) => clip.startMs >= endMs || clip.startMs + clip.durationMs <= startMs),
  );
}

/** Acrescenta um clipe à trilha dada, mantendo os clipes ordenados por início. */
function appendClip(tracks: Track[], trackId: string, clip: Clip): Track[] {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, clips: sortClips([...track.clips, clip]) } : track,
  );
}

/** Cria uma forma no cursor (ou em atMs), na primeira trilha de adesivo livre naquele intervalo (senão, nova trilha no topo); seleciona-a e devolve o id ('' sem projeto). */
export function addShape(kind: ShapeData['shape'], atMs?: number): string {
  if (useProjectStore.getState().project === null) return '';
  const shape: ShapeData = { ...SHAPE_DEFAULTS[kind] };
  const at = atMs ?? usePlaybackStore.getState().currentTimeMs;
  let clipId = '';
  useTimelineStore.getState().edit('shape-add', (tracks) => {
    // Rascunho só para saber a duração padrão da forma nova antes de escolher a trilha.
    const draft = createShapeClip('', at, shape);
    const free = freeStickerTrack(tracks, draft.startMs, draft.startMs + draft.durationMs);
    const added = free
      ? { tracks, trackId: free.id }
      : addTrack(tracks, 'sticker', 0, t.shapes.title);
    const clip = { ...draft, trackId: added.trackId };
    clipId = clip.id;
    return appendClip(added.tracks, added.trackId, clip);
  });
  if (clipId !== '') useTimelineStore.getState().selectClips([clipId]);
  return clipId;
}

/** Altera propriedades de uma forma; edições seguidas do mesmo clipe viram um passo só. Clipes sem forma ficam iguais. */
export function updateShape(clipId: string, patch: Partial<ShapeData>): void {
  const clip = findClip(currentTracks(), clipId)?.clip;
  if (clip?.shape === undefined) return;
  useTimelineStore.getState().edit(
    'shape',
    (tracks) => updateClip(tracks, clipId, (c) => (c.shape ? { ...c, shape: { ...c.shape, ...patch } } : c)),
    undefined,
    { coalesceKey: `shape:${clipId}` },
  );
}
