import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removedAssetIds, startPlaybackController } from '@/features/preview/playbackController';
import type { PreviewEngine } from '@/features/preview/previewEngine';
import { getPreviewEngine } from '@/features/preview/previewEngine';
import { usePlaybackStore, useProjectStore } from '@/stores';
import { createProject } from '@/engine/project/createProject';
import type { Asset, Project } from '@/types';

vi.mock('@/features/preview/previewEngine', () => ({ getPreviewEngine: vi.fn(), disposePreviewEngine: vi.fn() }));

const initialPlayback = usePlaybackStore.getState();

/** Cria um asset de vídeo de teste com o id dado. */
function makeAsset(id: string): Asset {
  return { id, kind: 'video', name: `${id}.mp4`, mimeType: 'video/mp4', opfsPath: `/${id}`, sizeBytes: 1, thumbnails: [], createdAt: 0 };
}

/** Projeto de teste com os assets dados e duração fixa. */
function projectWith(assets: Asset[]): Project {
  return { ...createProject('Teste'), assets, durationMs: 5000 };
}

/** Motor falso com as funções espiadas. */
function fakeEngine(overrides: Partial<PreviewEngine['audio']> = {}): PreviewEngine & {
  provider: { closeAsset: ReturnType<typeof vi.fn>; setPlaying: ReturnType<typeof vi.fn> };
} {
  const provider = {
    getFrame: vi.fn(),
    prefetch: vi.fn(),
    releaseFrame: vi.fn(),
    closeAsset: vi.fn(),
    setPlaying: vi.fn(),
    dispose: vi.fn(),
  };
  const audio: PreviewEngine['audio'] = {
    play: vi.fn(() => Promise.resolve()),
    currentTimelineMs: vi.fn(() => 0),
    stop: vi.fn(),
    reschedule: vi.fn(),
    setMasterVolume: vi.fn(),
    isPlaying: vi.fn(() => false),
    isClockRunning: vi.fn(() => true),
    dispose: vi.fn(),
    ...overrides,
  };
  return { provider, audio };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  usePlaybackStore.setState(initialPlayback, true);
  useProjectStore.setState({ project: null });
});

describe('removedAssetIds', () => {
  it('devolve só os ids que sumiram da lista', () => {
    const a = makeAsset('a');
    const b = makeAsset('b');
    expect(removedAssetIds([a, b], [b])).toEqual(['a']);
    expect(removedAssetIds([a], [a, b])).toEqual([]);
  });
});

describe('startPlaybackController: assets removidos', () => {
  it('fecha no provedor o asset que saiu do projeto', () => {
    const engine = fakeEngine();
    vi.mocked(getPreviewEngine).mockReturnValue(engine);
    useProjectStore.setState({ project: projectWith([makeAsset('a'), makeAsset('b')]) });
    const stop = startPlaybackController();
    useProjectStore.setState({ project: projectWith([makeAsset('b')]) });
    expect(engine.provider.closeAsset).toHaveBeenCalledTimes(1);
    expect(engine.provider.closeAsset).toHaveBeenCalledWith('a');
    stop();
  });

  it('não fecha assets que continuam no projeto', () => {
    const engine = fakeEngine();
    vi.mocked(getPreviewEngine).mockReturnValue(engine);
    useProjectStore.setState({ project: projectWith([makeAsset('a')]) });
    const stop = startPlaybackController();
    useProjectStore.setState({ project: projectWith([makeAsset('a'), makeAsset('c')]) });
    expect(engine.provider.closeAsset).not.toHaveBeenCalled();
    stop();
  });
});

describe('startPlaybackController: falha do áudio', () => {
  it('mantém a reprodução quando o relógio de reserva segue andando', async () => {
    const engine = fakeEngine({
      play: vi.fn(() => Promise.reject(new Error('sem áudio'))),
      isClockRunning: vi.fn(() => true),
    });
    vi.mocked(getPreviewEngine).mockReturnValue(engine);
    useProjectStore.setState({ project: projectWith([]) });
    const stop = startPlaybackController();
    usePlaybackStore.getState().play();
    await Promise.resolve();
    await Promise.resolve();
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    stop();
  });

  it('pausa quando nem o relógio de reserva roda', async () => {
    const engine = fakeEngine({
      play: vi.fn(() => Promise.reject(new Error('sem áudio'))),
      isClockRunning: vi.fn(() => false),
    });
    vi.mocked(getPreviewEngine).mockReturnValue(engine);
    useProjectStore.setState({ project: projectWith([]) });
    const stop = startPlaybackController();
    usePlaybackStore.getState().play();
    await Promise.resolve();
    await Promise.resolve();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
    stop();
  });
});
