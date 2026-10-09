// Testes do comando removeBackground: máscara do trecho, asset oculto, efeito ligado e falhas no trabalho.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMatte, MatteError } from '@/engine/matte/matteClient';
import { registerEffect } from '@/engine/render/registry';
import { removeBackgroundEffect } from '@/engine/render/effects/removeBackground';
import { createProject } from '@/engine/project/createProject';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useJobsStore } from '@/stores/jobsStore';
import { useProjectStore } from '@/stores/projectStore';
import { removeBackground } from '@/stores/removeBackgroundCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project } from '@/types';

vi.mock('@/engine/matte/matteClient', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateMatte: vi.fn() };
});

/** Registra o efeito real de remover fundo uma única vez (o registro não aceita duplicatas). */
registerEffect(removeBackgroundEffect);

/** Asset de vídeo de origem, com 5 s de mídia. */
function sourceAsset(): Asset {
  return {
    id: 'a1',
    kind: 'video',
    name: 'pessoa.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'media/a1.mp4',
    sizeBytes: 100,
    durationMs: 5000,
    fps: 30,
    width: 1920,
    height: 1080,
    thumbnails: [],
    createdAt: 0,
  };
}

/** Clipe de 2 s começando em 1 s da timeline, com o trecho de mídia começando em 1 s do asset. */
function makeClip(): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 1000,
    durationMs: 2000,
    trimInMs: 1000,
    trimOutMs: 2000,
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

/** Abre um projeto com o asset de origem e o clipe de teste. */
function openProject(clip: Clip = makeClip()): void {
  const base: Project = createProject('Fundo');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [clip] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks, assets: [sourceAsset()] } });
}

/** Importação falsa: adiciona o arquivo como asset novo, sem passar pelo OPFS. */
async function fakeImport(files: File[]): Promise<void> {
  const current = useProjectStore.getState().project;
  const file = files[0];
  if (current === null || file === undefined) return;
  const asset: Asset = {
    id: `m-${current.assets.length}`,
    kind: 'video',
    name: file.name,
    mimeType: 'video/mp4',
    opfsPath: `media/m.mp4`,
    sizeBytes: file.size,
    thumbnails: [],
    createdAt: 0,
  };
  useProjectStore.setState({ project: { ...current, assets: [...current.assets, asset] } });
}

/** Clipe de teste lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('removeBackground', () => {
  beforeEach(() => {
    cancelPendingSave();
    vi.mocked(generateMatte).mockReset();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useJobsStore.setState({ jobs: [] });
    useProjectStore.setState({ importFiles: fakeImport });
    openProject();
  });

  it('gera a máscara do trecho, marca como máscara oculta e liga o efeito com o deslocamento', async () => {
    vi.mocked(generateMatte).mockResolvedValue(new ArrayBuffer(8));
    await removeBackground('c1');

    expect(generateMatte).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      1000,
      3000,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    const matte = useProjectStore.getState().project?.assets.find((a) => a.role === 'matte');
    expect(matte?.sourceAssetId).toBe('a1');
    const effect = clipNow().effects.find((e) => e.type === 'removeBackground');
    expect(effect?.params['matteAssetId']).toBe(matte?.id);
    expect(effect?.params['matteOffsetMs']).toBe(1000);
    expect(useJobsStore.getState().jobs).toEqual([
      expect.objectContaining({ kind: 'removeBackground', clipId: 'c1', status: 'done' }),
    ]);
  });

  it('falha no download do modelo fica no trabalho com o código model', async () => {
    vi.mocked(generateMatte).mockRejectedValue(new MatteError('download', 'rede caiu'));
    await removeBackground('c1');

    const job = useJobsStore.getState().jobs[0];
    expect(job?.status).toBe('error');
    expect(job?.errorCode).toBe('model');
    expect(clipNow().effects).toEqual([]);
    expect(useProjectStore.getState().project?.assets.some((a) => a.role === 'matte')).toBe(false);
  });

  it('cancelar o trabalho não liga o efeito', async () => {
    vi.mocked(generateMatte).mockImplementation(
      (_asset, _start, _end, _progress, signal) =>
        new Promise<ArrayBuffer>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
        }),
    );
    const running = removeBackground('c1');
    const job = useJobsStore.getState().jobs[0];
    expect(job).toBeDefined();
    useJobsStore.getState().cancelJob(job?.id ?? '');
    await running;

    expect(useJobsStore.getState().jobs).toEqual([]);
    expect(clipNow().effects).toEqual([]);
  });

  it('não faz nada sem clipe encontrado', async () => {
    await removeBackground('inexistente');
    expect(generateMatte).not.toHaveBeenCalled();
    expect(useJobsStore.getState().jobs).toEqual([]);
  });
});
