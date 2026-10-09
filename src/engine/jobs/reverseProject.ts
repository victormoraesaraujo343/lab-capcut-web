// Projeto temporário da inversão: um único clipe com a mídia do trecho, em velocidade 1, sem efeitos, para gerar a cópia invertida.

import type { Asset, Clip, Project, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import { mediaOffsetAt } from '@/engine/timeline/speedCurve';

/** Id da única trilha do projeto temporário. */
export const REVERSE_TRACK_ID = 'reverse-track';
/** Id do único clipe do projeto temporário. */
export const REVERSE_CLIP_ID = 'reverse-clip';

/** Quantidade de mídia, em ms, que o clipe consome com a velocidade dele (o trecho que será invertido). */
export function clipMediaSpanMs(clip: Clip): number {
  return Math.max(0, mediaOffsetAt(clip.speed, clip.durationMs, clip.durationMs));
}

/**
 * Monta o projeto temporário que contém só a mídia do trecho do clipe, invertida, em velocidade 1.
 * Tamanho e fps vêm do asset (ou do projeto, se o asset não informar). A trilha vem mutada: o áudio é mixado à parte.
 */
export function buildReverseProject(project: Project, clip: Clip, asset: Asset): Project {
  const spanMs = Math.max(1, Math.round(clipMediaSpanMs(clip)));
  const reversedClip: Clip = {
    id: REVERSE_CLIP_ID,
    assetId: asset.id,
    trackId: REVERSE_TRACK_ID,
    startMs: 0,
    durationMs: spanMs,
    trimInMs: clip.trimInMs,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: true,
  };
  const track: Track = {
    id: REVERSE_TRACK_ID,
    kind: 'video',
    name: asset.name,
    muted: true,
    locked: false,
    hidden: false,
    clips: [reversedClip],
  };
  return {
    id: `${project.id}-reverse`,
    name: asset.name,
    width: asset.width ?? project.width,
    height: asset.height ?? project.height,
    fps: asset.fps ?? project.fps,
    aspectRatio: 'free',
    durationMs: spanMs,
    tracks: [track],
    assets: [asset],
    folders: [],
    markers: [],
    createdAt: project.createdAt,
    updatedAt: Date.now(),
  };
}

/** Mesmo projeto temporário, com a trilha audível e o clipe no sentido normal: serve para mixar o áudio do trecho sem inverter. */
export function buildForwardAudioProject(reverseProject: Project): Project {
  const tracks = reverseProject.tracks.map((track) => ({
    ...track,
    muted: false,
    clips: track.clips.map((clip) => ({ ...clip, reversed: false })),
  }));
  return { ...reverseProject, tracks };
}
