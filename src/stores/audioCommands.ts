// Comandos de áudio do clipe: separar e juntar o áudio do vídeo, fades, volume e silêncio. Cada comando é um passo do histórico.
import { t } from '@/i18n/pt-BR';
import { createId } from '@/engine/project/createProject';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { addTrack, placeClip, removeClipsById } from '@/engine/timeline/trackOps';
import { clipEndMs, type Asset, type Clip, type Track } from '@/types';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Borda do clipe com fade: 'in' é a entrada e 'out' é a saída. */
export type FadeEdge = 'in' | 'out';

/** Volume máximo de um clipe (1 = original). */
export const MAX_CLIP_VOLUME = 2;

/** Indica se o asset tem som: sem forma de onda conhecida conta como tendo; com picos, precisa de algum acima de zero. */
export function assetHasAudio(asset: Asset): boolean {
  const peaks = asset.waveform;
  if (peaks === undefined || peaks.length === 0) return true;
  return peaks.some((peak) => peak > 0);
}

/** Indica se um clipe de vídeo pode ter o áudio separado: vídeo com som, ainda não separado e fora de quadro congelado. */
export function canDetachAudio(clip: Clip, asset: Asset): boolean {
  return (
    asset.kind === 'video' &&
    clip.assetId === asset.id &&
    clip.audioDetached !== true &&
    clip.freezeFrameMs === undefined &&
    assetHasAudio(asset)
  );
}

/** Indica se o clipe tem som próprio: clipe de trilha de áudio, ou clipe de vídeo cujo áudio ainda não foi separado. */
export function clipHasOwnSound(clip: Clip, track: Track, asset: Asset | undefined): boolean {
  if (track.kind === 'audio') return true;
  if (track.kind !== 'video' || asset === undefined) return false;
  return canDetachAudio(clip, asset);
}

/** Acha, numa trilha de áudio destravada, um intervalo livre para o clipe; sem trilha livre, devolve null. */
function freeAudioTrack(tracks: Track[], clip: Clip): Track | null {
  const end = clipEndMs(clip);
  const free = tracks.find(
    (track) =>
      track.kind === 'audio' &&
      !track.locked &&
      !track.clips.some((other) => other.startMs < end && clipEndMs(other) > clip.startMs),
  );
  return free ?? null;
}

/** Separa o áudio de um clipe de vídeo: cria um clipe de áudio igual numa trilha de áudio e silencia o vídeo. */
export function detachAudio(clipId: string): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const found = findClip(project.tracks, clipId);
  if (!found || found.track.kind !== 'video' || found.track.locked) return;
  const { clip } = found;
  const asset = project.assets.find((a) => a.id === clip.assetId);
  if (asset === undefined || !canDetachAudio(clip, asset)) return;

  const groupId = clip.groupId ?? createId();
  const audioId = createId();
  const existing = freeAudioTrack(project.tracks, clip);
  const created = existing === null ? addTrack(project.tracks, 'audio', undefined, t.timeline.trackKinds.audio) : null;
  const baseTracks = created ? created.tracks : project.tracks;
  const audioTrackId = existing?.id ?? created?.trackId ?? '';

  const audioClip: Clip = {
    ...clip,
    id: audioId,
    trackId: audioTrackId,
    groupId,
    transitionIn: undefined,
    transitionOut: undefined,
  };
  const withVideo = updateClip(baseTracks, clipId, (c) => ({ ...c, audioDetached: true, groupId }));
  const next = placeClip(withVideo, audioClip, audioTrackId, audioClip.startMs, 'overwrite');
  useTimelineStore.getState().edit('detach-audio', () => next, [audioId]);
}

/** Junta o áudio de volta: remove o clipe de áudio agrupado com o mesmo asset e tira a marca de separado do vídeo. */
export function reattachAudio(videoClipId: string): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const found = findClip(project.tracks, videoClipId);
  if (!found || found.track.kind !== 'video' || found.track.locked) return;
  const { clip } = found;
  if (clip.audioDetached !== true || clip.groupId === undefined) return;

  const twinIds = project.tracks
    .filter((track) => track.kind === 'audio')
    .flatMap((track) => track.clips)
    .filter((c) => c.id !== clip.id && c.groupId === clip.groupId && c.assetId === clip.assetId)
    .map((c) => c.id);
  const removed = removeClipsById(project.tracks, twinIds);
  const next = updateClip(removed, clip.id, (c) => ({ ...c, audioDetached: false }));
  useTimelineStore.getState().edit('reattach-audio', () => next, [clip.id]);
}

/** Limita um fade ao intervalo [0, duração do clipe menos o fade do outro lado]. */
export function clampFadeMs(clip: Clip, edge: FadeEdge, ms: number): number {
  const other = edge === 'in' ? clip.audio.fadeOutMs : clip.audio.fadeInMs;
  const max = Math.max(0, clip.durationMs - other);
  return Math.round(Math.min(max, Math.max(0, ms)));
}

/** Define o fade de entrada ou saída do clipe; seguidas com o mesmo clipe e borda, viram um passo só do histórico. */
export function setFade(clipId: string, edge: FadeEdge, ms: number): void {
  const project = useProjectStore.getState().project;
  if (project === null || !Number.isFinite(ms)) return;
  const found = findClip(project.tracks, clipId);
  if (!found) return;
  const value = clampFadeMs(found.clip, edge, ms);
  useTimelineStore.getState().edit(
    `fade-${edge}`,
    (tracks) =>
      updateClip(tracks, clipId, (c) => ({
        ...c,
        audio:
          edge === 'in'
            ? { ...c.audio, fadeInMs: value }
            : { ...c.audio, fadeOutMs: value },
      })),
    undefined,
    { coalesceKey: `fade:${clipId}:${edge}` },
  );
}

/** Define o volume do clipe, de 0 a 2; seguidas no mesmo clipe, viram um passo só do histórico. */
export function setClipVolume(clipId: string, volume: number): void {
  if (!Number.isFinite(volume)) return;
  const value = Math.min(MAX_CLIP_VOLUME, Math.max(0, volume));
  useTimelineStore.getState().edit(
    'volume',
    (tracks) => updateClip(tracks, clipId, (c) => (c.volume === value ? c : { ...c, volume: value })),
    undefined,
    { coalesceKey: `volume:${clipId}` },
  );
}

/** Liga ou desliga o mudo do clipe (audio.muted), sem mexer no volume nem nos keyframes; cada alternância é um passo do histórico. */
export function toggleClipMute(clipId: string): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const found = findClip(project.tracks, clipId);
  if (!found || found.track.locked) return;
  const nextMuted = found.clip.audio.muted !== true;
  useTimelineStore.getState().edit('mute', (tracks) =>
    updateClip(tracks, clipId, (c) => ({ ...c, audio: { ...c.audio, muted: nextMuted } })),
  );
}
