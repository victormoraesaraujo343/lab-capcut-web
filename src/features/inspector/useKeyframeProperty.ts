// Hook de uma propriedade animável do clipe: valor no cursor, losango de keyframe e navegação entre keyframes.
import { findClip } from '@/engine/timeline/clipOps';
import { hasKeyframeAt } from '@/engine/render/keyframes';
import { currentPropertyValue, setKeyframeValue, toggleKeyframe } from '@/stores/keyframeCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import type { Clip } from '@/types';

/** Tolerância, em ms, para considerar que dois instantes são o mesmo keyframe. */
const SAME_INSTANT_MS = 1;

/** Estado e ações de uma propriedade animável no cursor atual. */
export interface KeyframeProperty {
  /** Valor da propriedade no cursor (animado se houver keyframes, senão o valor base), na unidade interna. */
  value: number;
  /** Se a propriedade tem algum keyframe no clipe. */
  hasKeyframes: boolean;
  /** Se existe keyframe exatamente no instante do cursor. */
  onKeyframe: boolean;
  /** Cria o keyframe no cursor, ou remove o que existe ali. */
  toggle: () => void;
  /** Grava o valor: no keyframe do cursor se a propriedade é animada, senão no valor base via setBase. */
  setValue: (value: number, final: boolean) => void;
  /** Leva o cursor ao keyframe anterior desta propriedade. */
  prev: () => void;
  /** Leva o cursor ao próximo keyframe desta propriedade. */
  next: () => void;
}

/** Instante do cursor relativo ao início do clipe, em ms. */
function localCursor(clip: Clip): number {
  return usePlaybackStore.getState().currentTimeMs - clip.startMs;
}

/** Valor da propriedade no cursor agora, lido da store (não do último render). */
function valueNow(clipId: string, property: string): number {
  const found = findClip(useProjectStore.getState().project?.tracks ?? [], clipId);
  if (!found) return 0;
  return currentPropertyValue(found.clip, property, localCursor(found.clip));
}

/** Leva o cursor ao keyframe mais próximo na direção pedida; sem keyframe ali, não faz nada. */
function seekKeyframe(clipId: string, property: string, direction: -1 | 1): void {
  const found = findClip(useProjectStore.getState().project?.tracks ?? [], clipId);
  if (!found) return;
  const { clip } = found;
  const here = localCursor(clip);
  const times = (clip.keyframes[property] ?? []).map((k) => k.timeMs);
  const target =
    direction < 0
      ? times.filter((time) => time < here - SAME_INSTANT_MS).sort((a, b) => b - a)[0]
      : times.filter((time) => time > here + SAME_INSTANT_MS).sort((a, b) => a - b)[0];
  if (target !== undefined) usePlaybackStore.getState().seek(clip.startMs + target);
}

/** Propriedade animável do clipe: lê o valor no cursor e faz os comandos de keyframe; setBase grava o valor sem keyframes. */
export function useKeyframeProperty(
  clipId: string,
  property: string,
  setBase: (value: number, final: boolean) => void,
): KeyframeProperty {
  const clip = useProjectStore((s) => findClip(s.project?.tracks ?? [], clipId)?.clip ?? null);
  const cursorMs = usePlaybackStore((s) => s.currentTimeMs);

  if (clip === null) {
    return {
      value: 0,
      hasKeyframes: false,
      onKeyframe: false,
      toggle: () => undefined,
      setValue: () => undefined,
      prev: () => undefined,
      next: () => undefined,
    };
  }

  const here = cursorMs - clip.startMs;
  const list = clip.keyframes[property];
  const hasKeyframes = (list?.length ?? 0) > 0;
  const value = currentPropertyValue(clip, property, here);

  return {
    value,
    hasKeyframes,
    onKeyframe: hasKeyframeAt(list, here),
    toggle: () => toggleKeyframe(clipId, property, usePlaybackStore.getState().currentTimeMs, valueNow(clipId, property)),
    setValue: (next, final) => {
      if (hasKeyframes) {
        setKeyframeValue(clipId, property, usePlaybackStore.getState().currentTimeMs, next);
      } else {
        setBase(next, final);
      }
    },
    prev: () => seekKeyframe(clipId, property, -1),
    next: () => seekKeyframe(clipId, property, 1),
  };
}
