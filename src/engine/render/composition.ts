// Composição pura: quais camadas aparecem num instante, com tempo de mídia, keyframes e transformação avaliada.

import type {
  Asset,
  Clip,
  EffectInstance,
  KeyframeMap,
  Layer,
  ParamValue,
  Project,
  TextData,
  Track,
  Transform,
} from '@/types';
import { clipEndMs } from '@/types';
import { curveSpeedAt, mediaOffsetAt } from '@/engine/timeline/speedCurve';
import { evaluateNumber, evaluateTransform } from './keyframes';
import { applyTransitions } from './compositionTransitions';
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
export const VISUAL_TRACK_KINDS: ReadonlySet<Track['kind']> = new Set<Track['kind']>([
  'video',
  'sticker',
  'text',
  'effect',
]);

/** Nome do efeito que recorta o fundo com uma máscara. */
const MATTE_EFFECT_TYPE = 'removeBackground';

/** Parâmetro numérico do efeito de recorte: atraso da máscara em relação à mídia, em ms (padrão 0). */
const MATTE_OFFSET_PARAM = 'matteOffsetMs';

/** Instante local do clipe (0 = início) se o instante da timeline cai dentro dele; senão null. */
export function clipLocalTime(clip: Clip, timelineMs: number): number | null {
  if (timelineMs < clip.startMs || timelineMs >= clipEndMs(clip)) return null;
  return timelineMs - clip.startMs;
}

/** Prende um instante de mídia a [0, duração do asset]; sem duração conhecida, só não fica negativo. */
function clampMediaTime(ms: number, assetDurationMs: number | undefined): number {
  const floored = Math.max(0, ms);
  return assetDurationMs === undefined ? floored : Math.min(floored, assetDurationMs);
}

/**
 * Instante da mídia original a mostrar para um instante local do clipe, com velocidade constante ou por curva.
 * O resultado fica preso a [0, duração do asset] quando ela é conhecida (transições podem pedir além do fim).
 */
export function clipMediaTime(clip: Clip, localMs: number, assetDurationMs?: number): number {
  if (clip.freezeFrameMs !== undefined) return clip.freezeFrameMs;
  const offset = mediaOffsetAt(
    clip.speed,
    clip.reversed ? clip.durationMs - localMs : localMs,
    clip.durationMs,
  );
  const consumed = clip.reversed ? Math.max(0, offset) : offset;
  return clampMediaTime(clip.trimInMs + consumed, assetDurationMs);
}

/**
 * Velocidade com que a mídia avança num instante local do clipe: a constante, ou a da curva no ponto do clipe
 * (com o mesmo sentido de tempo de clipMediaTime, para clipes invertidos); freeze frame fica parado (0).
 */
export function clipPlaybackRate(clip: Clip, localMs: number): number {
  if (clip.freezeFrameMs !== undefined) return 0;
  if (clip.speed.mode === 'constant' || !(clip.durationMs > 0)) return clip.speed.value;
  const along = clip.reversed ? clip.durationMs - localMs : localMs;
  return curveSpeedAt(clip.speed.curve, along / clip.durationMs);
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
  if (clip.overlay) return 'overlay';
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

/** Instância de filtro/efeito com os parâmetros numéricos avaliados nos keyframes 'fx:<id>:<param>' no instante local. */
function evaluateInstance(inst: EffectInstance, keyframes: KeyframeMap, localMs: number): EffectInstance {
  const params: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(inst.params)) {
    params[key] =
      typeof value === 'number' ? evaluateNumber(keyframes, `fx:${inst.id}:${key}`, localMs, value) : value;
  }
  return { ...inst, params };
}

/** Atraso da máscara, em ms, do efeito de recorte; 0 se ausente ou inválido. */
function matteOffsetOf(effectParams: Record<string, ParamValue> | undefined): number {
  const offset = effectParams?.[MATTE_OFFSET_PARAM];
  return typeof offset === 'number' && Number.isFinite(offset) ? offset : 0;
}

/**
 * Máscara de recorte do clipe: o asset indicado no efeito 'removeBackground', se existir no projeto; senão undefined.
 * O tempo da máscara é o tempo de mídia do clipe menos o atraso (matteOffsetMs), sem ficar negativo.
 */
function matteFor(clip: Clip, assets: Map<string, Asset>, mediaTimeMs: number): Layer['matte'] {
  const effect = clip.effects.find((e) => e.type === MATTE_EFFECT_TYPE);
  const assetId = effect?.params['matteAssetId'];
  if (typeof assetId !== 'string' || !assets.has(assetId)) return undefined;
  const matteTimeMs = Math.max(0, mediaTimeMs - matteOffsetOf(effect?.params));
  return { assetId, mediaTimeMs: matteTimeMs };
}

/**
 * Monta a camada de um clipe num instante LOCAL dado, sem checar se o clipe está ativo ali
 * (as transições usam instantes fora do clipe). Devolve null se o clipe não é visual.
 */
export function layerForClipAt(
  project: Project,
  assets: Map<string, Asset>,
  clip: Clip,
  localMs: number,
  zIndex: number,
): Layer | null {
  const asset = clipAsset(assets, clip);
  const kind = visualKindOf(clip, asset);
  if (kind === null) return null;
  const base = evaluateTransform(clip.transform, clip.keyframes, localMs);
  // Imagem animada repete o ciclo: o instante de mídia não é preso à duração do ciclo (o decodificador dá a volta).
  const stillKind = asset?.kind === 'image' || asset?.kind === 'sticker';
  const mediaTimeMs = clipMediaTime(clip, localMs, stillKind ? undefined : asset?.durationMs);
  const common = {
    clipId: clip.id,
    mediaTimeMs,
    localTimeMs: localMs,
    filters: clip.filters.map((f) => evaluateInstance(f, clip.keyframes, localMs)),
    effects: clip.effects.map((e) => evaluateInstance(e, clip.keyframes, localMs)),
    zIndex,
    playbackRate: clipPlaybackRate(clip, localMs),
  };
  if (clip.text) {
    const anim = evaluateTextAnimation(clip.text, localMs, clip.durationMs, project.height);
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
  if (clip.shape) {
    return {
      ...common,
      kind: 'shape',
      transform: base,
      sourceWidth: 0,
      sourceHeight: 0,
      fit: 'none',
      shape: clip.shape,
    };
  }
  if (clip.overlay) {
    // Sobreposição: quadro inteiro do projeto, sem asset; o compositor desenha o shader com a mistura do clipe.
    return {
      ...common,
      kind: 'overlay',
      transform: base,
      sourceWidth: project.width,
      sourceHeight: project.height,
      fit: 'contain',
      overlay: clip.overlay,
    };
  }
  const matte = matteFor(clip, assets, mediaTimeMs);
  return {
    ...common,
    assetId: clip.assetId,
    kind,
    transform: base,
    sourceWidth: asset?.width ?? project.width,
    sourceHeight: asset?.height ?? project.height,
    fit: 'contain',
    ...(matte === undefined ? {} : { matte }),
  };
}

/** Monta a camada de um clipe no instante da timeline, ou null se o clipe não aparece nele. */
function resolveClipLayer(
  project: Project,
  clip: Clip,
  assets: Map<string, Asset>,
  timelineMs: number,
  zIndex: number,
): Layer | null {
  const localTimeMs = clipLocalTime(clip, timelineMs);
  if (localTimeMs === null) return null;
  return layerForClipAt(project, assets, clip, localTimeMs, zIndex);
}

/**
 * Camadas visuais ativas no instante, ordenadas por zIndex crescente.
 * A trilha de índice 0 fica no topo: zIndex = número de trilhas - 1 - índice. Transições ativas viram uma camada só.
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
  return applyTransitions(project, timelineMs, layers);
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
      result.push({ clip, track, mediaTimeMs: clipMediaTime(clip, localMs, asset.durationMs) });
    }
  }
  return result;
}
