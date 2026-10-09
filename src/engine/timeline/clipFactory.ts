// Criação de clipes novos a partir de assets da biblioteca de mídia.

import type { Asset, AssetKind, Clip, ShapeData, TextStyle, TrackKind } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import { createId } from '@/engine/project/createProject';
import { IMAGE_DEFAULT_DURATION_MS } from './constants';

const TRACK_KIND_BY_ASSET: Record<AssetKind, TrackKind> = {
  video: 'video',
  image: 'video',
  audio: 'audio',
  sticker: 'sticker',
};

/** Indica em que tipo de trilha um asset de dado tipo pode ser colocado. */
export function trackKindForAsset(kind: AssetKind): TrackKind {
  return TRACK_KIND_BY_ASSET[kind];
}

/** Cria um clipe novo, sem recorte, a partir de um asset, na trilha e posição dadas. */
export function createClipFromAsset(asset: Asset, trackId: string, startMs: number): Clip {
  return {
    id: createId(),
    assetId: asset.id,
    trackId,
    startMs: Math.max(0, startMs),
    durationMs: asset.durationMs ?? IMAGE_DEFAULT_DURATION_MS,
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
  };
}

/** Duração padrão de um texto na timeline, em ms. */
const TEXT_DEFAULT_DURATION_MS = 3000;

/** Cria um clipe de texto novo, sem asset, com transformação padrão, na trilha e posição dadas. */
export function createTextClip(
  trackId: string,
  startMs: number,
  content: string,
  style: TextStyle,
  durationMs = TEXT_DEFAULT_DURATION_MS,
): Clip {
  return {
    id: createId(),
    trackId,
    startMs: Math.max(0, startMs),
    durationMs,
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
    text: { content, style },
  };
}

/** Duração padrão de uma forma na timeline, em ms. */
const SHAPE_DEFAULT_DURATION_MS = 3000;

/** Cria um clipe de forma nova, sem asset, com transformação padrão, na trilha e posição dadas. */
export function createShapeClip(
  trackId: string,
  startMs: number,
  shape: ShapeData,
  durationMs = SHAPE_DEFAULT_DURATION_MS,
): Clip {
  return {
    id: createId(),
    trackId,
    startMs: Math.max(0, startMs),
    durationMs,
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
    shape,
  };
}
