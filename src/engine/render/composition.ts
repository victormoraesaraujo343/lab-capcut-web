// Composição pura: quais camadas aparecem num instante, com tempo de mídia, keyframes e transformação avaliada.

import type { Asset, Clip, Layer, Project, TextData, Track, Transform } from '@/types';
import { clipEndMs } from '@/types';
import { evaluateTransform } from './keyframes';
import { evaluateTextAnimation, type TextAnimState } from '../text/textAnimations';

/** Clipe com som ativo no instante, com o tempo de mídia a tocar. */
export interface ActiveAudioClip {
  /** Clipe com som. */
  clip: Clip;
  /** Trilha do clipe. */
  track: Track;
  /** Instante dentro da mídia original, em ms. */
  mediaTimeMs: number;
}

/** Tipos de trilha que geram camadas visuais (áudio nunca entra). */
const VISUAL_TRACK_KINDS: ReadonlySet<Track['kind']> = new Set<Track['kind']>([
  'video',
  'sticker',
  'text',
  'effect',
]);

/** Instante local do clipe (0 = início) se o instante da timeline cai dentro dele; senão null. */
export function clipLocalTime(clip: Clip, timelineMs: number): number | null {
  if (timelineMs < clip.startMs || timelineMs >= clipEndMs(clip)) return null;
  return timelineMs - clip.startMs;
}

/**
 * Instante da mídia original a mostrar para um instante local do clipe.
 * A curva de velocidade (modo 'curve') entra na etapa 7; por enquanto usa speed.value nos dois modos.
 */
export function clipMediaTime(clip: Clip, localMs: number): number {
  if (clip.freezeFrameMs !== undefined) return clip.freezeFrameMs;
  const speed = clip.speed.value;
  if (clip.reversed) {
    return Math.max(clip.trimInMs, clip.trimInMs + (clip.durationMs - localMs) * speed);
  }
  return clip.trimInMs + localMs * speed;
}

/** Velocidade com que a mídia avança na reprodução: speed do clipe; freeze frame fica parado (0). */
export function clipPlaybackRate(clip: Clip): number {
  if (clip.freezeFrameMs !== undefined) return 0;
  return clip.speed.value;
}

/** Mapa de assets por id, para consulta rápida. */
function assetMap(project: Project): Map<string, Asset> {
  return new Map<string, Asset>(project.assets.map((a): [string, Asset] => [a.id, a]));
}

/** Asset usado pelo clipe, ou undefined se o clipe não tem asset ou ele não existe. */
function clipAsset(assets: Map<string, Asset>, clip: Clip): Asset | undefined {
  return clip.assetId === undefined ? undefined : assets.get(clip.assetId);
}

/** Tipo visual do clipe (texto, forma ou mídia visual); null se o clipe não é visual. */
function visualKindOf(clip: Clip, asset: Asset | undefined): Layer['kind'] | null {
  if (clip.text) return 'text';
  if (clip.shape) return 'shape';
  if (asset && (asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'sticker')) {
    return asset.kind;
  }
  return null;
}

/** Transformação de um texto: a avaliada pelos keyframes, com a animação somada (deslocamento, escala, rotação, opacidade). */
function textTransform(base: Transform, data: TextData, anim: TextAnimState): Transform {
  return {
    ...base,
    x: base.x + anim.dx,
    y: base.y + anim.dy,
    scaleX: base.scaleX * anim.scale,
    scaleY: base.scaleY * anim.scale,
    rotation: base.rotation + anim.rotation,
    opacity: base.opacity * anim.opacity * data.style.opacity,
  };
}

/** Monta a camada de um clipe no instante, ou null se o clipe não aparece nele. */
function resolveClipLayer(
  project: Project,
  clip: Clip,
  assets: Map<string, Asset>,
  timelineMs: number,
  zIndex: number,
): Layer | null {
  const localTimeMs = clipLocalTime(clip, timelineMs);
  if (localTimeMs === null) return null;
  const asset = clipAsset(assets, clip);
  const kind = visualKindOf(clip, asset);
  if (kind === null) return null;
  const base = evaluateTransform(clip.transform, clip.keyframes, localTimeMs);
  const common = {
    clipId: clip.id,
    mediaTimeMs: clipMediaTime(clip, localTimeMs),
    localTimeMs,
    filters: [...clip.filters],
    effects: [...clip.effects],
    zIndex,
    playbackRate: clipPlaybackRate(clip),
  };
  if (clip.text) {
    const anim = evaluateTextAnimation(clip.text, localTimeMs, clip.durationMs, project.height);
    return {
      ...common,
      kind: 'text',
      transform: textTransform(base, clip.text, anim),
      sourceWidth: 0,
      sourceHeight: 0,
      fit: 'none',
      text: { data: clip.text, reveal: anim.reveal },
    };
  }
  return {
    ...common,
    assetId: clip.assetId,
    kind,
    transform: base,
    sourceWidth: asset?.width ?? project.width,
    sourceHeight: asset?.height ?? project.height,
    fit: 'contain',
  };
}

/**
 * Camadas visuais ativas no instante, ordenadas por zIndex crescente.
 * A trilha de índice 0 fica no topo: zIndex = número de trilhas - 1 - índice.
 */
export function resolveLayers(project: Project, timelineMs: number): Layer[] {
  const assets = assetMap(project);
  const trackCount = project.tracks.length;
  const layers: Layer[] = [];
  project.tracks.forEach((track, index) => {
    if (track.hidden || !VISUAL_TRACK_KINDS.has(track.kind)) return;
    const zIndex = trackCount - 1 - index;
    for (const clip of track.clips) {
      const layer = resolveClipLayer(project, clip, assets, timelineMs, zIndex);
      if (layer) layers.push(layer);
    }
  });
  return layers.sort((a, b) => a.zIndex - b.zIndex);
}

/** Clipes com som (trilhas áudio ou vídeo não mutadas, asset de vídeo ou áudio) ativos no instante. */
export function activeAudioClips(project: Project, timelineMs: number): ActiveAudioClip[] {
  const assets = assetMap(project);
  const result: ActiveAudioClip[] = [];
  for (const track of project.tracks) {
    if (track.muted || (track.kind !== 'audio' && track.kind !== 'video')) continue;
    for (const clip of track.clips) {
      const asset = clipAsset(assets, clip);
      if (!asset || (asset.kind !== 'video' && asset.kind !== 'audio')) continue;
      const localMs = clipLocalTime(clip, timelineMs);
      if (localMs === null) continue;
      result.push({ clip, track, mediaTimeMs: clipMediaTime(clip, localMs) });
    }
  }
  return result;
}
