// Comandos de sobreposições animadas: criam e ajustam clipes de shader procedural (sem asset) na trilha de efeito.
import type { Clip, OverlayData, ParamValue, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import { defaultParams, getEffect, type EffectDefinition } from '@/engine/render/registry';
import { createId } from '@/engine/project/createProject';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { addTrack, sortClips } from '@/engine/timeline/trackOps';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Duração padrão de uma sobreposição na timeline, em ms. */
const OVERLAY_DURATION_MS = 5000;

/** Mistura padrão de cada tipo de sobreposição; tipo sem entrada usa 'normal'. */
const DEFAULT_BLEND: Readonly<Record<string, OverlayData['blend']>> = {
  lightLeak: 'screen',
  rain: 'normal',
  snow: 'normal',
  dust: 'normal',
  bokeh: 'normal',
  filmGrain: 'add',
};

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Primeira trilha de efeito não travada (a de cima, na ordem da lista) sem clipe no intervalo [startMs, endMs); undefined se nenhuma estiver livre. */
function freeEffectTrack(tracks: Track[], startMs: number, endMs: number): Track | undefined {
  return tracks.find(
    (track) =>
      track.kind === 'effect' &&
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

/** Clipe novo de sobreposição: sem asset, transformação padrão, na trilha e posição dadas. */
function overlayClip(trackId: string, startMs: number, overlay: OverlayData): Clip {
  return {
    id: createId(),
    trackId,
    startMs,
    durationMs: OVERLAY_DURATION_MS,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    overlay,
  };
}

/** Limita os valores numéricos aos mínimos e máximos do registro; ignora chaves desconhecidas e valores que não são número. */
function clampParams(def: EffectDefinition | undefined, values: Record<string, ParamValue>): Record<string, ParamValue> {
  const result: Record<string, ParamValue> = {};
  if (!def) return result;
  for (const spec of def.params) {
    const value = values[spec.key];
    if (spec.type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) continue;
    result[spec.key] = Math.min(spec.max ?? value, Math.max(spec.min ?? value, value));
  }
  return result;
}

/** Adiciona uma sobreposição do tipo dado no cursor (ou em atMs): clipe de 5 s na primeira trilha de efeito livre (senão, nova trilha no topo); seleciona-o e devolve o id ('' se não houver projeto ou o tipo não for de sobreposição). */
export function addOverlay(type: string, atMs?: number): string {
  if (useProjectStore.getState().project === null) return '';
  if (getEffect(type)?.category !== 'overlay') return '';
  const at = Math.max(0, atMs ?? usePlaybackStore.getState().currentTimeMs);
  const overlay: OverlayData = {
    type,
    params: defaultParams(type),
    blend: DEFAULT_BLEND[type] ?? 'normal',
  };
  let clipId = '';
  useTimelineStore.getState().edit('overlay-add', (tracks) => {
    const free = freeEffectTrack(tracks, at, at + OVERLAY_DURATION_MS);
    const added = free
      ? { tracks, trackId: free.id }
      : addTrack(tracks, 'effect', 0, t.timeline.trackKinds.effect);
    const clip = overlayClip(added.trackId, at, overlay);
    clipId = clip.id;
    return appendClip(added.tracks, added.trackId, clip);
  });
  if (clipId !== '') useTimelineStore.getState().selectClips([clipId]);
  return clipId;
}

/** Altera parâmetros (limitados aos mínimos e máximos) e/ou a mistura de uma sobreposição; edições seguidas do mesmo clipe viram um passo só. */
export function updateOverlay(
  clipId: string,
  patch: { params?: Record<string, ParamValue>; blend?: OverlayData['blend'] },
): void {
  const clip = findClip(currentTracks(), clipId)?.clip;
  if (clip?.overlay === undefined) return;
  useTimelineStore.getState().edit(
    'overlay-update',
    (tracks) =>
      updateClip(tracks, clipId, (c) => {
        if (c.overlay === undefined) return c;
        const def = getEffect(c.overlay.type);
        const params = { ...c.overlay.params, ...clampParams(def, patch.params ?? {}) };
        return { ...c, overlay: { ...c.overlay, params, blend: patch.blend ?? c.overlay.blend } };
      }),
    undefined,
    { coalesceKey: `overlay:${clipId}` },
  );
}
