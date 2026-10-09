// Testes dos comandos de keyframe: alternar, definir valor, curva, mover e limpar, com a store real.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import {
  clearKeyframes,
  currentPropertyValue,
  moveKeyframeCmd,
  setKeyframeEasing,
  setKeyframeValue,
  toggleKeyframe,
} from '@/stores/keyframeCommands';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project } from '@/types';

/** Clipe de teste começando em 1000 ms, com 2000 ms de duração. */
function makeClip(): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 1000,
    durationMs: 2000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: { ...defaultTransform(), x: 10 },
    speed: defaultSpeed(),
    volume: 0.5,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
  };
}

/** Abre um projeto com uma trilha de vídeo contendo o clipe de teste. */
function openClip(): void {
  const base: Project = createProject('Keyframes');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [makeClip()] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks } });
}

/** Clipe de teste pelo id, lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('keyframeCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    openClip();
  });

  it('currentPropertyValue devolve o valor base sem keyframes e o avaliado com eles', () => {
    expect(currentPropertyValue(clipNow(), 'x', 500)).toBe(10);
    expect(currentPropertyValue(clipNow(), 'volume', 0)).toBe(0.5);
    const animated = { ...clipNow(), keyframes: { x: [{ timeMs: 0, value: 0, easing: 'linear' as const }, { timeMs: 1000, value: 100, easing: 'linear' as const }] } };
    expect(currentPropertyValue(animated, 'x', 500)).toBeCloseTo(50);
  });

  it('toggleKeyframe cria com o valor e easeInOut no instante da timeline, e remove na segunda vez', () => {
    toggleKeyframe('c1', 'x', 1500, 42);
    expect(clipNow().keyframes['x']).toEqual([{ timeMs: 500, value: 42, easing: 'easeInOut' }]);
    toggleKeyframe('c1', 'x', 1500, 42);
    expect(clipNow().keyframes['x']).toBeUndefined();
  });

  it('setKeyframeValue cria ou atualiza no mesmo instante e mantém o easing existente', () => {
    setKeyframeValue('c1', 'opacity', 1000, 0.2);
    setKeyframeEasing('c1', 'opacity', 0, 'hold');
    setKeyframeValue('c1', 'opacity', 1000, 0.8);
    expect(clipNow().keyframes['opacity']).toEqual([{ timeMs: 0, value: 0.8, easing: 'hold' }]);
  });

  it('setKeyframeEasing muda só o keyframe do tempo local dado', () => {
    setKeyframeValue('c1', 'x', 1000, 1);
    setKeyframeValue('c1', 'x', 2000, 2);
    setKeyframeEasing('c1', 'x', 1000, 'easeOut');
    expect(clipNow().keyframes['x']?.map((k) => k.easing)).toEqual(['easeInOut', 'easeOut']);
  });

  it('moveKeyframeCmd move do tempo local de origem para o de destino', () => {
    setKeyframeValue('c1', 'y', 1200, 3);
    moveKeyframeCmd('c1', 'y', 200, 700);
    expect(clipNow().keyframes['y']?.map((k) => k.timeMs)).toEqual([700]);
  });

  it('clearKeyframes tira todos os keyframes da propriedade', () => {
    setKeyframeValue('c1', 'x', 1000, 1);
    setKeyframeValue('c1', 'scaleX', 1000, 2);
    clearKeyframes('c1', 'x');
    expect(Object.keys(clipNow().keyframes)).toEqual(['scaleX']);
  });

  it('desfazer volta o keyframe criado', () => {
    toggleKeyframe('c1', 'x', 1500, 42);
    useTimelineStore.getState().undo();
    expect(clipNow().keyframes['x']).toBeUndefined();
  });
});
