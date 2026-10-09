import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectAssetBeats } from '@/engine/audio/beatsClient';
import { createProject } from '@/engine/project/createProject';
import { clearMarkers, detectBeats, removeMarker } from '@/stores/beatCommands';
import { useProjectStore } from '@/stores/projectStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project, type Track } from '@/types';

vi.mock('@/engine/audio/beatsClient', () => ({ detectAssetBeats: vi.fn() }));
vi.mock('@/stores/projectPersistence', () => ({
  scheduleSave: vi.fn(),
  flushSave: vi.fn(() => Promise.resolve()),
  cancelPendingSave: vi.fn(),
}));

/** Asset de vídeo de teste, com 10 s de mídia. */
const VIDEO: Asset = {
  id: 'a1',
  kind: 'video',
  name: 'show.mp4',
  mimeType: 'video/mp4',
  opfsPath: 'media/a1.mp4',
  sizeBytes: 1000,
  durationMs: 10000,
  thumbnails: [],
  createdAt: 0,
};

/** Clipe de 4 s começando em 1000 ms da timeline, com recorte de 500 ms no início da mídia. */
function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 'v1',
    startMs: 1000,
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

/** Abre um projeto com uma trilha de vídeo contendo o clipe dado e o asset de teste. */
function openProject(clip: Clip, markers: number[] = []): Project {
  const track: Track = { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [clip] };
  const project: Project = { ...createProject('Batidas'), tracks: [track], assets: [VIDEO], markers };
  useProjectStore.setState({ project });
  return project;
}

/** Marcadores do projeto aberto. */
function currentMarkers(): number[] {
  return useProjectStore.getState().project?.markers ?? [];
}

describe('detectBeats', () => {
  beforeEach(() => {
    vi.mocked(detectAssetBeats).mockReset();
  });

  it('converte batidas de tempo de mídia para a linha do tempo do clipe', async () => {
    openProject(makeClip());
    vi.mocked(detectAssetBeats).mockResolvedValue({ onsetsMs: [500, 1000, 2000, 4400, 6000], bpm: 120 });

    const result = await detectBeats('c1');

    expect(result).toEqual({ count: 4, bpm: 120 });
    expect(currentMarkers()).toEqual([1000, 1500, 2500, 4900]);
  });

  it('analisa só o trecho de mídia que o clipe toca', async () => {
    openProject(makeClip());
    vi.mocked(detectAssetBeats).mockResolvedValue({ onsetsMs: [], bpm: null });

    await detectBeats('c1');

    expect(detectAssetBeats).toHaveBeenCalledWith(VIDEO, { startMs: 500, endMs: 4500 }, 0.5);
  });

  it('não duplica marcadores a 30 ms ou menos de um existente', async () => {
    openProject(makeClip(), [1010]);
    vi.mocked(detectAssetBeats).mockResolvedValue({ onsetsMs: [500, 1000], bpm: null });

    const result = await detectBeats('c1');

    expect(result.count).toBe(2);
    expect(currentMarkers()).toEqual([1010, 1500]);
  });

  it('mantém a lista de marcadores ordenada', async () => {
    openProject(makeClip(), [3000]);
    vi.mocked(detectAssetBeats).mockResolvedValue({ onsetsMs: [1000, 2000], bpm: null });

    await detectBeats('c1');

    expect(currentMarkers()).toEqual([1500, 2500, 3000]);
  });

  it('não faz nada para imagens', async () => {
    const image: Asset = { ...VIDEO, id: 'a1', kind: 'image' };
    openProject(makeClip());
    useProjectStore.setState((state) => ({ project: state.project && { ...state.project, assets: [image] } }));

    const result = await detectBeats('c1');

    expect(result).toEqual({ count: 0, bpm: null });
    expect(detectAssetBeats).not.toHaveBeenCalled();
  });

  it('devolve zero para clipe inexistente', async () => {
    openProject(makeClip());
    expect(await detectBeats('nao-existe')).toEqual({ count: 0, bpm: null });
  });
});

describe('clearMarkers and removeMarker', () => {
  it('remove o marcador exato pedido e mantém os outros', () => {
    openProject(makeClip(), [1000, 1500, 2500]);
    removeMarker(1500);
    expect(currentMarkers()).toEqual([1000, 2500]);
  });

  it('esvazia todos os marcadores', () => {
    openProject(makeClip(), [1000, 1500]);
    clearMarkers();
    expect(currentMarkers()).toEqual([]);
  });
});
