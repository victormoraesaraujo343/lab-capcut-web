// Testes dos comandos de sobreposição, com a store real e o registro das sobreposições.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { addOverlay, updateOverlay } from '@/stores/overlayCommands';
import { registerOverlays } from '@/engine/render/overlays';
import { registerEffect } from '@/engine/render/registry';
import { createProject, createTrack } from '@/engine/project/createProject';
import type { Clip, Project, Track } from '@/types';

registerOverlays();
registerEffect({
  type: 'ovTestEffect',
  category: 'effect',
  labelKey: 'ovTestEffect',
  params: [],
  fragmentSource: '',
});

/** Abre um projeto com uma trilha de efeito (com um clipe de sobreposição ocupando 0 a 6000 ms) e uma de vídeo. */
function openProject(effectClips: Clip[] = []): Project {
  const base: Project = createProject('Sobreposições');
  const effect: Track = { ...createTrack('effect', 'Efeito'), clips: effectClips };
  const project: Project = { ...base, tracks: [...base.tracks, effect] };
  useProjectStore.setState({ project });
  return project;
}

/** Todos os clipes do projeto aberto. */
function allClips(): Clip[] {
  return useProjectStore.getState().project?.tracks.flatMap((track) => track.clips) ?? [];
}

/** Clipe de sobreposição pelo id; lança se não existir. */
function clipById(id: string): Clip {
  const clip = allClips().find((c) => c.id === id);
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('addOverlay', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    openProject();
  });

  it('cria clipe de 5000 ms sem asset na trilha de efeito, no cursor, com parâmetros padrão e mistura padrão', () => {
    usePlaybackStore.setState({ currentTimeMs: 1200 });
    const id = addOverlay('rain');
    const clip = clipById(id);
    expect(clip.durationMs).toBe(5000);
    expect(clip.startMs).toBe(1200);
    expect(clip.assetId).toBeUndefined();
    expect(clip.overlay).toEqual({
      type: 'rain',
      params: { density: 0.6, speed: 1, angle: 12 },
      blend: 'normal',
    });
    const track = useProjectStore.getState().project?.tracks.find((t) => t.clips.some((c) => c.id === id));
    expect(track?.kind).toBe('effect');
    expect(useTimelineStore.getState().selectedClipIds).toEqual([id]);
  });

  it('usa a mistura padrão de cada tipo: lightLeak clareia, filmGrain soma', () => {
    const light = clipById(addOverlay('lightLeak', 0));
    const grain = clipById(addOverlay('filmGrain', 0));
    expect(light.overlay?.blend).toBe('screen');
    expect(grain.overlay?.blend).toBe('add');
  });

  it('reaproveita a primeira trilha de efeito livre naquele intervalo', () => {
    const id = addOverlay('snow', 0);
    const tracks = useProjectStore.getState().project?.tracks ?? [];
    const effects = tracks.filter((t) => t.kind === 'effect');
    expect(effects).toHaveLength(1);
    expect(effects[0]?.clips.map((c) => c.id)).toEqual([id]);
  });

  it('cria nova trilha de efeito no topo quando a existente está ocupada no intervalo', () => {
    addOverlay('dust', 0);
    const id = addOverlay('bokeh', 1000);
    const tracks = useProjectStore.getState().project?.tracks ?? [];
    expect(tracks[0]?.kind).toBe('effect');
    expect(tracks[0]?.clips.map((c) => c.id)).toEqual([id]);
    expect(tracks.filter((t) => t.kind === 'effect')).toHaveLength(2);
  });

  it('tipo desconhecido ou que não é sobreposição não cria nada', () => {
    expect(addOverlay('nao-existe')).toBe('');
    expect(addOverlay('ovTestEffect')).toBe('');
    expect(allClips()).toHaveLength(0);
  });

  it('sem projeto aberto devolve string vazia', () => {
    useProjectStore.setState({ project: null });
    expect(addOverlay('rain', 0)).toBe('');
  });
});

describe('updateOverlay', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
    openProject();
  });

  it('altera parâmetros e mistura, mantendo os demais parâmetros', () => {
    const id = addOverlay('rain', 0);
    updateOverlay(id, { params: { speed: 2 }, blend: 'screen' });
    expect(clipById(id).overlay).toEqual({
      type: 'rain',
      params: { density: 0.6, speed: 2, angle: 12 },
      blend: 'screen',
    });
  });

  it('limita números aos mínimos e máximos e ignora chaves desconhecidas', () => {
    const id = addOverlay('rain', 0);
    updateOverlay(id, { params: { density: 5, angle: -90, inexistente: 1 } });
    expect(clipById(id).overlay?.params).toEqual({ density: 1, speed: 1, angle: -45 });
  });

  it('clipe inexistente não faz nada', () => {
    expect(() => updateOverlay('nao-existe', { params: { speed: 2 } })).not.toThrow();
  });
});
