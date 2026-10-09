// Comandos de keyframes: calculam a edição com funções puras de keyframes.ts e a aplicam via timelineStore.edit.
import type { Clip, Easing, Keyframe, Track } from '@/types';
import { evaluateNumber, hasKeyframeAt, moveKeyframe, removeKeyframeAt, upsertKeyframe } from '@/engine/render/keyframes';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Easing usado quando um keyframe novo é criado sem um easing existente. */
const DEFAULT_EASING: Easing = 'easeInOut';

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Valor de uma propriedade fx:<id>:<param> do clipe, lido do parâmetro salvo (booleano vira 0 ou 1; texto vira 0). */
function fxBaseValue(clip: Clip, property: string): number {
  const rest = property.slice('fx:'.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return 0;
  const instanceId = rest.slice(0, sep);
  const param = rest.slice(sep + 1);
  const instance = [...clip.filters, ...clip.effects].find((i) => i.id === instanceId);
  const value = instance?.params[param];
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

/** Valor base (sem keyframes) de uma propriedade animável do clipe. */
function basePropertyValue(clip: Clip, property: string): number {
  const t = clip.transform;
  switch (property) {
    case 'x':
      return t.x;
    case 'y':
      return t.y;
    case 'scaleX':
      return t.scaleX;
    case 'scaleY':
      return t.scaleY;
    case 'rotation':
      return t.rotation;
    case 'opacity':
      return t.opacity;
    case 'crop.top':
      return t.crop.top;
    case 'crop.right':
      return t.crop.right;
    case 'crop.bottom':
      return t.crop.bottom;
    case 'crop.left':
      return t.crop.left;
    case 'volume':
      return clip.volume;
    default:
      return property.startsWith('fx:') ? fxBaseValue(clip, property) : 0;
  }
}

/** Valor da propriedade do clipe no instante local dado: o keyframe avaliado, ou o valor base se não houver keyframes. */
export function currentPropertyValue(clip: Clip, property: string, localMs: number): number {
  return evaluateNumber(clip.keyframes, property, localMs, basePropertyValue(clip, property));
}

/** Aplica uma função sobre a lista de keyframes de uma propriedade do clipe; lista vazia remove a chave. */
function withPropertyList(clip: Clip, property: string, fn: (list: Keyframe<number>[]) => Keyframe<number>[]): Clip {
  const current = clip.keyframes[property] ?? [];
  const next = fn(current);
  const keyframes = { ...clip.keyframes };
  if (next.length === 0) {
    delete keyframes[property];
  } else {
    keyframes[property] = next;
  }
  return { ...clip, keyframes };
}

/** Localiza o clipe e devolve o instante local dele para um instante da timeline; null se o clipe não existe. */
function localTimeOf(clipId: string, timelineMs: number): number | null {
  const found = findClip(currentTracks(), clipId);
  if (!found) return null;
  return timelineMs - found.clip.startMs;
}

/** Aplica uma mudança nos keyframes de um clipe pela timeline, com coalesceKey opcional. */
function editClip(label: string, clipId: string, fn: (clip: Clip) => Clip, coalesceKey?: string): void {
  useTimelineStore.getState().edit(
    label,
    (tracks) => updateClip(tracks, clipId, fn),
    undefined,
    coalesceKey === undefined ? undefined : { coalesceKey },
  );
}

/** Liga ou desliga um keyframe no instante da timeline: remove se existe, senão cria com o valor dado (easing padrão). */
export function toggleKeyframe(clipId: string, property: string, atTimelineMs: number, value: number): void {
  const localMs = localTimeOf(clipId, atTimelineMs);
  if (localMs === null) return;
  editClip('Keyframe', clipId, (clip) =>
    withPropertyList(clip, property, (list) =>
      hasKeyframeAt(list, localMs)
        ? removeKeyframeAt(list, localMs)
        : upsertKeyframe(list, { timeMs: localMs, value, easing: DEFAULT_EASING }),
    ),
  );
}

/** Cria ou atualiza o keyframe no instante da timeline com o valor dado; mantém o easing se já existia. */
export function setKeyframeValue(clipId: string, property: string, atTimelineMs: number, value: number): void {
  const localMs = localTimeOf(clipId, atTimelineMs);
  if (localMs === null) return;
  editClip(
    'Valor do keyframe',
    clipId,
    (clip) =>
      withPropertyList(clip, property, (list) => {
        const existing = list.find((k) => hasKeyframeAt([k], localMs));
        const easing = existing?.easing ?? DEFAULT_EASING;
        return upsertKeyframe(list, { timeMs: localMs, value, easing });
      }),
    `kf:${clipId}:${property}`,
  );
}

/** Troca o easing do keyframe no tempo local do clipe (ms relativo ao início do clipe); sem keyframe ali, não faz nada. */
export function setKeyframeEasing(clipId: string, property: string, timeMs: number, easing: Easing): void {
  editClip('Curva do keyframe', clipId, (clip) =>
    withPropertyList(clip, property, (list) =>
      list.map((k) => (hasKeyframeAt([k], timeMs) ? { ...k, easing } : k)),
    ),
  );
}

/** Move o keyframe de um tempo local do clipe para outro (ms relativos ao início do clipe). */
export function moveKeyframeCmd(clipId: string, property: string, fromMs: number, toMs: number): void {
  editClip('Mover keyframe', clipId, (clip) =>
    withPropertyList(clip, property, (list) => moveKeyframe(list, fromMs, toMs)),
  );
}

/** Remove todos os keyframes de uma propriedade do clipe. */
export function clearKeyframes(clipId: string, property: string): void {
  editClip('Limpar keyframes', clipId, (clip) => {
    if (clip.keyframes[property] === undefined) return clip;
    return withPropertyList(clip, property, () => []);
  });
}
