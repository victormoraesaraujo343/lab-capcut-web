// Testes do job de inversão: voltar ao original usando a janela gravada no asset (sem memória do job) e cancelamento sem erro.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mixProjectAudio } from '@/engine/audio/offlineMix';
import { runReverseJob } from '@/engine/jobs/reverseJob';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useJobsStore } from '@/stores/jobsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project } from '@/types';

vi.mock('@/engine/audio/offlineMix', () => ({ mixProjectAudio: vi.fn() }));

/** Asset de vídeo de teste de 6 s. */
function videoAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `assets/${id}.mp4`,
    sizeBytes: 1000,
    durationMs: 6000,
    width: 1920,
    height: 1080,
    fps: 30,
    thumbnails: [],
    createdAt: 0,
    ...overrides,
  };
}

/** Clipe de teste de 2 s, começando em 0, sobre o asset dado. */
function clipOn(assetId: string): Clip {
  return {
    id: 'c1',
    assetId,
    trackId: 't1',
    startMs: 0,
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

/** Abre um projeto com os assets e o clipe na primeira trilha de vídeo. */
function openProject(assets: Asset[], clip: Clip): void {
  const base: Project = createProject('Inverter');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [clip] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks, assets } });
}

/** Clipe de teste lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('runReverseJob', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useJobsStore.setState(useJobsStore.getInitialState());
    useProjectStore.setState({ project: null });
    vi.mocked(mixProjectAudio).mockReset();
  });

  it('recarregar: volta ao trecho certo usando a janela gravada no asset invertido', async () => {
    const source = videoAsset('src');
    const reversed = videoAsset('rev', {
      role: 'reversed',
      sourceAssetId: 'src',
      sourceTrimInMs: 1500,
      sourceSpanMs: 2000,
      durationMs: 2000,
    });
    openProject([source, reversed], clipOn('rev'));
    await runReverseJob('c1');
    expect(clipNow().assetId).toBe('src');
    expect(clipNow().trimInMs).toBe(1500);
    expect(clipNow().trimOutMs).toBe(2500);
  });

  it('cancelar a inversão não marca erro no job (o cancelJob só remove)', async () => {
    openProject([videoAsset('src')], clipOn('src'));
    vi.mocked(mixProjectAudio).mockImplementation(
      (_project, _start, _end, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const jobs = useJobsStore.getState();
    const fail = vi.spyOn(jobs, 'fail');
    const running = runReverseJob('c1');
    const jobId = useJobsStore.getState().jobs[0]?.id ?? '';
    useJobsStore.getState().cancelJob(jobId);
    await running;
    expect(fail).not.toHaveBeenCalled();
    expect(useJobsStore.getState().jobs).toHaveLength(0);
    expect(clipNow().assetId).toBe('src');
  });
});
