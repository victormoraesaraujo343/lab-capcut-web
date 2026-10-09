// Comandos das ferramentas de clipe (congelar quadro): cada um calcula a edição com funções puras e a aplica num único passo de histórico.
import { clipLocalTime, clipMediaTime } from '@/engine/render/composition';
import { createId } from '@/engine/project/createProject';
import { findClip, splitClipAt } from '@/engine/timeline/clipOps';
import { placeClip } from '@/engine/timeline/trackOps';
import { defaultAudioFx, defaultSpeed, type Clip } from '@/types';
import { usePlaybackStore } from './playbackStore';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Duração do clipe congelado na timeline, em ms. */
export const FREEZE_FRAME_MS = 3000;

/**
 * Congela o quadro do clipe no instante dado (padrão: cursor). Divide o clipe ali e insere um clipe congelado de 3 s,
 * sem áudio, empurrando o resto da trilha. Sem efeito se o instante não cair dentro de um clipe de vídeo destravado.
 */
export function freezeFrame(clipId: string, atTimelineMs?: number): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const at = atTimelineMs ?? usePlaybackStore.getState().currentTimeMs;
  const found = findClip(project.tracks, clipId);
  if (!found || found.track.locked) return;
  const { clip, track } = found;
  const local = clipLocalTime(clip, at);
  if (local === null || clip.assetId === undefined || clip.text !== undefined || clip.shape !== undefined) return;
  const asset = project.assets.find((a) => a.id === clip.assetId);
  if (asset === undefined || asset.kind !== 'video') return;

  const split = splitClipAt(project.tracks, clipId, at);
  if (split.rightId === null) return;

  const mediaMs = clipMediaTime(clip, local, asset.durationMs);
  const frozen: Clip = {
    ...clip,
    id: createId(),
    startMs: at,
    durationMs: FREEZE_FRAME_MS,
    trimInMs: mediaMs,
    trimOutMs: 0,
    freezeFrameMs: mediaMs,
    speed: defaultSpeed(),
    reversed: false,
    volume: 0,
    audio: defaultAudioFx(),
    keyframes: {},
    transitionIn: undefined,
    transitionOut: undefined,
  };
  const placed = placeClip(split.tracks, frozen, track.id, at, 'insert');
  useTimelineStore.getState().edit('freeze-frame', () => placed, [frozen.id]);
}
