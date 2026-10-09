// Comandos de filtros e efeitos: calculam a edição com funções puras e a aplicam via timelineStore.edit.
import type { Clip, EffectInstance, ParamValue, Track } from '@/types';
import { upsertKeyframe } from '@/engine/render/keyframes';
import { defaultParams, getEffect } from '@/engine/render/registry';
import { FILTER_PRESETS, presetToFilter } from '@/engine/render/filters/filterPresets';
import { createId } from '@/engine/project/createProject';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Easing usado quando um keyframe novo de parâmetro é criado. */
const DEFAULT_EASING = 'easeInOut';

/** Intensidade mínima e máxima de um filtro (fração do preset). */
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 1;

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Aplica uma edição de clipe pela timeline, com coalesceKey opcional. */
function editClip(label: string, clipId: string, fn: (clip: Clip) => Clip, coalesceKey?: string): void {
  useTimelineStore.getState().edit(
    label,
    (tracks) => updateClip(tracks, clipId, fn),
    undefined,
    coalesceKey === undefined ? undefined : { coalesceKey },
  );
}

/** Troca a instância de efeito/filtro pelo id, em filtros ou efeitos; o resto do clipe fica igual. */
function mapInstance(clip: Clip, instanceId: string, fn: (inst: EffectInstance) => EffectInstance): Clip {
  return {
    ...clip,
    filters: clip.filters.map((inst) => (inst.id === instanceId ? fn(inst) : inst)),
    effects: clip.effects.map((inst) => (inst.id === instanceId ? fn(inst) : inst)),
  };
}

/** Adiciona um filtro ao fim da lista de filtros do clipe. */
export function addFilter(clipId: string, filter: EffectInstance): void {
  editClip('filter-add', clipId, (clip) => ({ ...clip, filters: [...clip.filters, { ...filter }] }));
}

/** Adiciona um efeito ao fim da lista de efeitos do clipe, com os parâmetros padrão do tipo; tipo desconhecido não faz nada. */
export function addEffect(clipId: string, type: string): void {
  if (getEffect(type) === undefined) return;
  const instance: EffectInstance = { id: createId(), type, params: defaultParams(type) };
  editClip('effect-add', clipId, (clip) => ({ ...clip, effects: [...clip.effects, instance] }));
}

/**
 * Altera um parâmetro de filtro ou efeito. Se o parâmetro tem keyframes, grava um keyframe no instante atual da
 * reprodução (em vez do valor base). Edições seguidas no mesmo parâmetro se fundem num passo só.
 */
export function updateEffectParam(clipId: string, instanceId: string, key: string, value: ParamValue): void {
  const found = findClip(currentTracks(), clipId);
  if (!found) return;
  const property = `fx:${instanceId}:${key}`;
  const list = found.clip.keyframes[property];
  const animated = list !== undefined && list.length > 0 && typeof value === 'number';
  const localMs = usePlaybackStore.getState().currentTimeMs - found.clip.startMs;
  // Com keyframe, só grava se o cursor estiver dentro do clipe.
  if (animated && (localMs < 0 || localMs > found.clip.durationMs)) return;
  editClip(
    'effect-param',
    clipId,
    (clip) => {
      if (animated) {
        const existing = (clip.keyframes[property] ?? []).find((k) => Math.abs(k.timeMs - localMs) <= 1);
        const easing = existing?.easing ?? DEFAULT_EASING;
        const next = upsertKeyframe(clip.keyframes[property] ?? [], { timeMs: localMs, value, easing });
        return { ...clip, keyframes: { ...clip.keyframes, [property]: next } };
      }
      return mapInstance(clip, instanceId, (inst) => ({ ...inst, params: { ...inst.params, [key]: value } }));
    },
    `fx:${clipId}:${instanceId}:${key}`,
  );
}

/** Remove um filtro ou efeito do clipe, junto com os keyframes dos seus parâmetros. */
export function removeEffect(clipId: string, instanceId: string): void {
  editClip('effect-remove', clipId, (clip) => {
    const prefix = `fx:${instanceId}:`;
    const keyframes = Object.fromEntries(Object.entries(clip.keyframes).filter(([prop]) => !prop.startsWith(prefix)));
    return {
      ...clip,
      filters: clip.filters.filter((inst) => inst.id !== instanceId),
      effects: clip.effects.filter((inst) => inst.id !== instanceId),
      keyframes,
    };
  });
}

/** Move um filtro ou efeito para a posição dada na sua lista (índice limitado ao tamanho da lista). */
export function moveEffect(clipId: string, instanceId: string, toIndex: number): void {
  editClip('effect-reorder', clipId, (clip) => {
    const moveIn = (list: EffectInstance[]): EffectInstance[] => {
      const from = list.findIndex((inst) => inst.id === instanceId);
      if (from < 0) return list;
      const to = Math.min(Math.max(0, toIndex), list.length - 1);
      const next = [...list];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    };
    return { ...clip, filters: moveIn(clip.filters), effects: moveIn(clip.effects) };
  });
}

/** Diz se o id é de um filtro pronto de FILTER_PRESETS. */
function isKnownPreset(presetId: string): boolean {
  return FILTER_PRESETS.some((preset) => preset.id === presetId);
}

/**
 * Ajusta a intensidade de um filtro (0 a 1). Se o filtro guarda um presetId de FILTER_PRESETS, os parâmetros
 * de cor voltam a ser os do predefinido na intensidade dada; os demais parâmetros e o presetId ficam.
 */
export function setFilterIntensity(clipId: string, instanceId: string, intensity: number): void {
  const clamped = Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, intensity));
  editClip('filter-intensity', clipId, (clip) =>
    mapInstance(clip, instanceId, (inst) => {
      const presetId = inst.params['presetId'];
      const params: Record<string, ParamValue> = { ...inst.params, intensity: clamped };
      if (typeof presetId === 'string' && isKnownPreset(presetId)) {
        Object.assign(params, presetToFilter(presetId, clamped).params);
      }
      return { ...inst, params };
    }),
  );
}
