// Testes dos comandos de filtros e efeitos, com a store real e o registro de efeitos.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import {
  addEffect,
  addFilter,
  moveEffect,
  registerFilterPreset,
  removeEffect,
  setFilterIntensity,
  updateEffectParam,
} from '@/stores/effectCommands';
import { setKeyframeValue } from '@/stores/keyframeCommands';
import { registerEffect } from '@/engine/render/registry';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project } from '@/types';

/** Registra o efeito de teste uma única vez (o registro não aceita duplicatas). */
registerEffect({
  type: 'testBlur',
  category: 'effect',
  labelKey: 'testBlur',
  params: [
    { key: 'radius', type: 'number', default: 4, min: 0, max: 20 },
    { key: 'tint', type: 'boolean', default: false },
  ],
  fragmentSource: '',
});

/** Clipe de teste começando em 1000 ms. */
function makeClip(): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 1000,
    durationMs: 2000,
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

/** Abre um projeto com uma trilha de vídeo contendo o clipe de teste. */
function openClip(): void {
  const base: Project = createProject('Efeitos');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [makeClip()] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks } });
}

/** Clipe de teste da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('effectCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    openClip();
  });

  it('addEffect cria o efeito com os parâmetros padrão e id novo; tipo desconhecido não faz nada', () => {
    addEffect('c1', 'testBlur');
    addEffect('c1', 'nao-existe');
    expect(clipNow().effects).toHaveLength(1);
    expect(clipNow().effects[0]?.params).toEqual({ radius: 4, tint: false });
    expect(clipNow().effects[0]?.id).toBeTruthy();
  });

  it('addFilter acrescenta o filtro dado ao fim da lista', () => {
    addFilter('c1', { id: 'f1', type: 'brightness', params: { amount: 0.1 } });
    addFilter('c1', { id: 'f2', type: 'contrast', params: {} });
    expect(clipNow().filters.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('updateEffectParam grava o valor base quando o parâmetro não tem keyframes', () => {
    addEffect('c1', 'testBlur');
    const id = clipNow().effects[0]?.id ?? '';
    updateEffectParam('c1', id, 'radius', 9);
    expect(clipNow().effects[0]?.params['radius']).toBe(9);
  });

  it('updateEffectParam grava no keyframe do instante atual quando o parâmetro é animado', () => {
    addEffect('c1', 'testBlur');
    const id = clipNow().effects[0]?.id ?? '';
    setKeyframeValue('c1', `fx:${id}:radius`, 1000, 1);
    usePlaybackStore.setState({ currentTimeMs: 2000 });
    updateEffectParam('c1', id, 'radius', 15);
    expect(clipNow().keyframes[`fx:${id}:radius`]?.map((k) => [k.timeMs, k.value])).toEqual([
      [0, 1],
      [1000, 15],
    ]);
    expect(clipNow().effects[0]?.params['radius']).toBe(4);
  });

  it('removeEffect tira o efeito e os keyframes dos seus parâmetros', () => {
    addEffect('c1', 'testBlur');
    const id = clipNow().effects[0]?.id ?? '';
    setKeyframeValue('c1', `fx:${id}:radius`, 1000, 1);
    removeEffect('c1', id);
    expect(clipNow().effects).toEqual([]);
    expect(clipNow().keyframes).toEqual({});
  });

  it('moveEffect reposiciona o efeito e limita o índice ao tamanho da lista', () => {
    addEffect('c1', 'testBlur');
    addEffect('c1', 'testBlur');
    const first = clipNow().effects[0]?.id ?? '';
    moveEffect('c1', first, 99);
    expect(clipNow().effects[1]?.id).toBe(first);
    moveEffect('c1', first, 0);
    expect(clipNow().effects[0]?.id).toBe(first);
  });

  it('setFilterIntensity guarda a intensidade e aplica preset × intensidade quando o preset existe', () => {
    registerFilterPreset('warm', { amount: 0.8, heat: 0.4 });
    addFilter('c1', { id: 'f1', type: 'brightness', params: { presetId: 'warm', amount: 0.8, heat: 0.4 } });
    setFilterIntensity('c1', 'f1', 0.5);
    expect(clipNow().filters[0]?.params).toEqual({ presetId: 'warm', amount: 0.4, heat: 0.2, intensity: 0.5 });
  });

  it('setFilterIntensity sem preset guarda só a intensidade, limitada entre 0 e 1', () => {
    addFilter('c1', { id: 'f2', type: 'contrast', params: { amount: 0.3 } });
    setFilterIntensity('c1', 'f2', 3);
    expect(clipNow().filters[0]?.params).toEqual({ amount: 0.3, intensity: 1 });
  });
});
