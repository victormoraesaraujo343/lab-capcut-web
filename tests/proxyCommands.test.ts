import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startProxyTranscode, type ProxyHandle } from '../src/engine/proxy/proxyTranscode';
import { cancelProxies, ensureProxies, setProxyPreviewEnabled } from '../src/stores/proxyCommands';
import { useJobsStore } from '../src/stores/jobsStore';
import { useProjectStore } from '../src/stores/projectStore';
import { useProxySettingsStore } from '../src/stores/proxySettingsStore';
import type { Asset, Project } from '../src/types';

vi.mock('../src/engine/proxy/proxyTranscode', () => ({
  startProxyTranscode: vi.fn(),
  PROXY_CANCELLED: 'cancelled',
}));

/** Cria um asset de vídeo de teste. */
function video(id: string, width: number, height: number, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'video',
    name: id,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}`,
    sizeBytes: 10,
    thumbnails: [],
    createdAt: 0,
    width,
    height,
    fps: 30,
    durationMs: 5000,
    ...extra,
  };
}

/** Cria um projeto de teste com os assets dados. */
function projectWith(assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Projeto',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks: [],
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Faz startProxyTranscode devolver um controle que só termina quando é cancelado. */
function mockPendingTranscodes(): ReturnType<typeof vi.fn> {
  const start = vi.mocked(startProxyTranscode);
  start.mockImplementation((): ProxyHandle => {
    let reject: (error: Error) => void = () => undefined;
    const result = new Promise<Blob>((_resolve, rej) => {
      reject = rej;
    });
    return { result, cancel: () => reject(new Error('cancelled')) };
  });
  return start;
}

describe('proxyCommands', () => {
  beforeEach(() => {
    cancelProxies();
    useProjectStore.setState({ project: null });
    useJobsStore.setState({ jobs: [] });
    useProxySettingsStore.getState().setEnabled(true);
    vi.clearAllMocks();
    mockPendingTranscodes();
  });

  it('enfileira só os vídeos grandes sem cópia e não duplica', () => {
    const big = video('big', 1920, 1080);
    const small = video('small', 640, 480);
    const done = video('done', 1920, 1080, { sourceAssetId: undefined });
    const proxy = video('done-proxy', 960, 540, { role: 'proxy', sourceAssetId: 'done' });
    useProjectStore.setState({ project: projectWith([big, small, done, proxy]) });
    ensureProxies();
    ensureProxies();
    expect(startProxyTranscode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startProxyTranscode).mock.calls[0]?.[0].id).toBe('big');
    const jobs = useJobsStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe('proxy');
    expect(jobs[0]?.status).toBe('running');
  });

  it('gera uma cópia por vez, mesmo com vários vídeos grandes', () => {
    useProjectStore.setState({ project: projectWith([video('a', 1920, 1080), video('b', 3840, 2160)]) });
    ensureProxies();
    expect(startProxyTranscode).toHaveBeenCalledTimes(1);
  });

  it('não gera nada com a prévia leve desligada', () => {
    useProxySettingsStore.getState().setEnabled(false);
    useProjectStore.setState({ project: projectWith([video('a', 1920, 1080)]) });
    ensureProxies();
    expect(startProxyTranscode).not.toHaveBeenCalled();
  });

  it('ao ligar a prévia leve pede as cópias que faltam', () => {
    useProxySettingsStore.getState().setEnabled(false);
    useProjectStore.setState({ project: projectWith([video('a', 1920, 1080)]) });
    setProxyPreviewEnabled(true);
    expect(startProxyTranscode).toHaveBeenCalledTimes(1);
    expect(useProxySettingsStore.getState().enabled).toBe(true);
  });

  it('cancelar esvazia a fila e não começa outra cópia', async () => {
    useProjectStore.setState({ project: projectWith([video('a', 1920, 1080), video('b', 1920, 1080)]) });
    ensureProxies();
    cancelProxies();
    await Promise.resolve();
    ensureProxies();
    expect(startProxyTranscode).toHaveBeenCalledTimes(2);
    expect(vi.mocked(startProxyTranscode).mock.calls[1]?.[0].id).toBe('a');
  });
});
