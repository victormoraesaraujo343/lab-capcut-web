// Testes do hook de keyframe: ligar e desligar no cursor, gravar valor e navegar entre keyframes, com a store real.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useKeyframeProperty } from '@/features/inspector/useKeyframeProperty';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project } from '@/types';

/** Clipe de teste começando em 1000 ms, com 2000 ms de duração e x = 10. */
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

/** Clipe de teste lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('useKeyframeProperty', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    openClip();
  });

  afterEach(() => {
    cleanup();
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    vi.clearAllMocks();
  });

  it('toggle cria o keyframe no cursor e remove na segunda vez', () => {
    usePlaybackStore.getState().seek(1500);
    const setBase = vi.fn();
    const { result } = renderHook(() => useKeyframeProperty('c1', 'x', setBase));

    expect(result.current.hasKeyframes).toBe(false);
    act(() => result.current.toggle());
    expect(clipNow().keyframes['x']).toEqual([{ timeMs: 500, value: 10, easing: 'easeInOut' }]);
    expect(result.current.hasKeyframes).toBe(true);
    expect(result.current.onKeyframe).toBe(true);

    act(() => result.current.toggle());
    expect(clipNow().keyframes['x']).toBeUndefined();
    expect(result.current.onKeyframe).toBe(false);
  });

  it('setValue com keyframes grava no keyframe do cursor e não mexe no valor base', () => {
    usePlaybackStore.getState().seek(1500);
    const setBase = vi.fn();
    const { result } = renderHook(() => useKeyframeProperty('c1', 'x', setBase));
    act(() => result.current.toggle());

    act(() => result.current.setValue(42, true));

    expect(clipNow().keyframes['x']).toEqual([{ timeMs: 500, value: 42, easing: 'easeInOut' }]);
    expect(clipNow().transform.x).toBe(10);
    expect(setBase).not.toHaveBeenCalled();
  });

  it('setValue sem keyframes grava o valor base pelo setBase informado', () => {
    const setBase = vi.fn();
    const { result } = renderHook(() => useKeyframeProperty('c1', 'x', setBase));

    act(() => result.current.setValue(77, false));

    expect(setBase).toHaveBeenCalledWith(77, false);
    expect(clipNow().keyframes['x']).toBeUndefined();
  });

  it('next e prev levam o cursor aos keyframes vizinhos da propriedade', () => {
    const setBase = vi.fn();
    usePlaybackStore.getState().seek(1000);
    const { result } = renderHook(() => useKeyframeProperty('c1', 'x', setBase));
    act(() => result.current.toggle());
    usePlaybackStore.getState().seek(2800);
    act(() => result.current.toggle());
    usePlaybackStore.getState().seek(1000);

    act(() => result.current.next());
    expect(usePlaybackStore.getState().currentTimeMs).toBe(2800);

    act(() => result.current.prev());
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
  });

  it('prev sem keyframe anterior não move o cursor', () => {
    usePlaybackStore.getState().seek(1000);
    const setBase = vi.fn();
    const { result } = renderHook(() => useKeyframeProperty('c1', 'x', setBase));
    act(() => result.current.toggle());

    act(() => result.current.prev());

    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
  });
});
