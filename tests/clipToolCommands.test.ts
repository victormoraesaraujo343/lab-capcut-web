import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { FREEZE_FRAME_MS, freezeFrame } from '@/stores/clipToolCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project, type Track } from '@/types';

/** Asset de vídeo de teste, com 10 s de mídia. */
const VIDEO: Asset = {
  id: 'a1',
  kind: 'video',
  name: 'praia.mp4',
  mimeType: 'video/mp4',
  opfsPath: 'media/a1.mp4',
  sizeBytes: 1000,
  durationMs: 10000,
  width: 1920,
  height: 1080,
  fps: 30,
  thumbnails: [],
  createdAt: 0,
};

/** Clipe de teste: 4 s na timeline, começando em 0, com recorte de 500 ms no início da mídia. */
function makeClip(overrides: Partial<Clip> & { id: string }): Clip {
  return {
    assetId: 'a1',
    trackId: 'v1',
    startMs: 0,
    durationMs: 4000,
    trimInMs: 500,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
    ...overrides,
  };
}

/** Abre um projeto com a trilha de vídeo dada e o asset de teste. */
function openTracks(tracks: Track[]): Project {
  const project: Project = { ...createProject('Congelar'), tracks, assets: [VIDEO] };
  useProjectStore.setState({ project });
  return project;
}

/** Trilha de vídeo destravada com os clipes dados. */
function videoTrack(clips: Clip[]): Track {
  return { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips };
}

/** Clipes da trilha v1 do projeto aberto, em ordem. */
function trackClips(): Clip[] {
  return useProjectStore.getState().project?.tracks[0]?.clips ?? [];
}

describe('congelar quadro', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState({ currentTimeMs: 0 });
    useProjectStore.setState({ project: null });
  });

  it('divide o clipe no cursor e insere um quadro congelado de 3 s empurrando o resto', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    usePlaybackStore.setState({ currentTimeMs: 1500 });

    freezeFrame('c1');

    const clips = trackClips();
    expect(clips).toHaveLength(3);
    const [left, frozen, right] = clips;
    expect(left?.id).toBe('c1');
    expect(left?.durationMs).toBe(1500);
    expect(frozen?.startMs).toBe(1500);
    expect(frozen?.durationMs).toBe(FREEZE_FRAME_MS);
    expect(right?.startMs).toBe(1500 + FREEZE_FRAME_MS);
    expect(right?.durationMs).toBe(2500);
    expect(right?.trimInMs).toBe(2000);
  });

  it('o quadro congelado guarda o instante da mídia, sem áudio', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    freezeFrame('c1', 1500);

    const frozen = trackClips()[1];
    expect(frozen?.freezeFrameMs).toBe(2000);
    expect(frozen?.volume).toBe(0);
    expect(frozen?.assetId).toBe('a1');
  });

  it('seleciona o quadro congelado', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    freezeFrame('c1', 1500);

    const frozen = trackClips()[1];
    expect(useTimelineStore.getState().selectedClipIds).toEqual([frozen?.id]);
  });

  it('ocupa um único passo de histórico', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    freezeFrame('c1', 1500);
    expect(trackClips()).toHaveLength(3);

    useTimelineStore.getState().undo();
    expect(trackClips()).toHaveLength(1);
    expect(trackClips()[0]?.durationMs).toBe(4000);
  });

  it('não faz nada se o instante cai fora do clipe', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    freezeFrame('c1', 9000);
    expect(trackClips()).toHaveLength(1);
  });

  it('não faz nada se o corte ficaria menor que a duração mínima do clipe', () => {
    openTracks([videoTrack([makeClip({ id: 'c1' })])]);
    freezeFrame('c1', 20);
    expect(trackClips()).toHaveLength(1);
  });

  it('não faz nada em trilha travada', () => {
    openTracks([{ ...videoTrack([makeClip({ id: 'c1' })]), locked: true }]);
    freezeFrame('c1', 1500);
    expect(trackClips()).toHaveLength(1);
  });
});
