import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import {
  applyTransitionToAll,
  removeTransition,
  setTransition,
  setTransitionDuration,
} from '@/stores/transitionCommands';
import { createProject, createTrack } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

/** Cria um clipe de vídeo de teste. */
function makeClip(id: string, trackId: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    trackId,
    startMs,
    durationMs,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
  };
}

/** Abre um projeto com uma trilha de vídeo contendo os clipes dados. */
function openProject(clips: Clip[]): Project {
  const base = createProject('Transicoes');
  const video = { ...createTrack('video', 'Vídeo'), id: 'v1', clips };
  const project = { ...base, tracks: [video] };
  useProjectStore.setState({ project });
  return project;
}

/** Clipe da trilha de vídeo pelo id. */
function clipById(id: string): Clip {
  const track = useProjectStore.getState().project?.tracks[0];
  const clip = track?.clips.find((c) => c.id === id);
  if (clip === undefined) throw new Error(`sem clipe ${id}`);
  return clip;
}

/** Trilhas do projeto aberto. */
function tracksNow(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

describe('transitionCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useTimelineStore.getState().resetHistory();
    useProjectStore.setState({ project: null });
  });

  it('põe a transição na saída de um clipe que tem vizinho encostado', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000)]);
    setTransition('a', 'dissolve', 400);
    expect(clipById('a').transitionOut).toEqual({ type: 'dissolve', durationMs: 400, params: {} });
    expect(clipById('b').transitionOut).toBeUndefined();
  });

  it('usa 500 ms quando a duração não é dada e parâmetros padrão do tipo', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000)]);
    setTransition('a', 'wipe');
    expect(clipById('a').transitionOut).toEqual({ type: 'wipe', durationMs: 500, params: { angle: 0 } });
  });

  it('não faz nada sem vizinho encostado depois ou com tipo desconhecido', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1500, 1000)]);
    setTransition('a', 'dissolve');
    expect(clipById('a').transitionOut).toBeUndefined();
    setTransition('b', 'naoExiste');
    expect(clipById('b').transitionOut).toBeUndefined();
  });

  it('tira a transição de saída', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000)]);
    setTransition('a', 'dissolve');
    removeTransition('a');
    expect(clipById('a').transitionOut).toBeUndefined();
  });

  it('muda a duração só se houver transição', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000)]);
    setTransitionDuration('a', 300);
    expect(clipById('a').transitionOut).toBeUndefined();
    setTransition('a', 'slideLeft', 500);
    setTransitionDuration('a', 300);
    expect(clipById('a').transitionOut?.durationMs).toBe(300);
    expect(clipById('a').transitionOut?.type).toBe('slideLeft');
  });

  it('aplica em todos os cortes de todas as trilhas de vídeo com um único passo de histórico', () => {
    const project = openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000), makeClip('c', 'v1', 2000, 1000)]);
    expect(project.tracks).toHaveLength(1);
    applyTransitionToAll('zoomIn', 250);
    expect(clipById('a').transitionOut).toEqual({ type: 'zoomIn', durationMs: 250, params: {} });
    expect(clipById('b').transitionOut?.type).toBe('zoomIn');
    expect(clipById('c').transitionOut).toBeUndefined();
    useTimelineStore.getState().undo();
    expect(clipById('a').transitionOut).toBeUndefined();
    expect(clipById('b').transitionOut).toBeUndefined();
    expect(tracksNow()[0]?.clips).toHaveLength(3);
  });

  it('cada comando é um passo de histórico desfeito por undo', () => {
    openProject([makeClip('a', 'v1', 0, 1000), makeClip('b', 'v1', 1000, 1000)]);
    setTransition('a', 'dissolve');
    removeTransition('a');
    useTimelineStore.getState().undo();
    expect(clipById('a').transitionOut?.type).toBe('dissolve');
    useTimelineStore.getState().undo();
    expect(clipById('a').transitionOut).toBeUndefined();
  });
});
