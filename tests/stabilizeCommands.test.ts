// Testes da estabilização: conversão da análise em keyframes e o comando com a store real (análise falsa).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useJobsStore } from '@/stores/jobsStore';
import { stabilizeClip, stabilizedClip } from '@/stores/stabilizeCommands';
import { analyzeClip, type StabilizeAnalysis } from '@/engine/stabilize/stabilizeClient';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project } from '@/types';

vi.mock('@/engine/stabilize/stabilizeClient', () => ({ analyzeClip: vi.fn() }));

/** Análise falsa de 3 amostras (0, 66 e 132 ms) num quadro 1920x1080, com deslocamento de +1 px da análise no meio. */
function fakeAnalysis(): StabilizeAnalysis {
  return {
    timesMs: [0, 66, 132],
    shifts: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ],
    analysisWidth: 160,
    analysisHeight: 90,
    sourceWidth: 1920,
    sourceHeight: 1080,
  };
}

/** Clipe de teste de 1000 ms, sem velocidade especial, começando em 0. */
function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: { ...defaultTransform(), x: 0 },
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    ...overrides,
  };
}

/** Asset de vídeo de teste, 1920x1080 e 5 s. */
function makeAsset(kind: Asset['kind'] = 'video'): Asset {
  return {
    id: 'a1',
    kind,
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'assets/a1.mp4',
    sizeBytes: 1000,
    durationMs: 5000,
    width: 1920,
    height: 1080,
    thumbnails: [],
    createdAt: 0,
  };
}

/** Abre um projeto com o asset e um clipe de vídeo na primeira trilha. */
function openClip(clip: Clip = makeClip(), asset: Asset = makeAsset()): void {
  const base: Project = createProject('Estabilizar');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [clip] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks, assets: [asset], width: 1920, height: 1080 } });
}

/** Clipe de teste lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('stabilizedClip', () => {
  it('grava keyframes x e y com a compensação (suavizado menos bruto) e aplica zoom mínimo', () => {
    const out = stabilizedClip(makeClip(), fakeAnalysis(), 1920, 1080, 0.5);
    const xs = out.keyframes['x'] ?? [];
    expect(xs.map((k) => k.timeMs)).toEqual([0, 66, 132]);
    // Deslocamento de 1 px da análise = 12 px do projeto. Bruto: 0, 12, 0. Raio 13 => média 4; compensação 4, -8, 4.
    expect(xs[0]?.value).toBeCloseTo(4, 6);
    expect(xs[1]?.value).toBeCloseTo(-8, 6);
    expect(xs[2]?.value).toBeCloseTo(4, 6);
    expect(out.keyframes['y']?.every((k) => Math.abs(k.value) < 1e-9)).toBe(true);
    expect(out.transform.scaleX).toBeCloseTo(1 + (2 * 8) / 1920, 6);
    expect(out.transform.scaleY).toBeCloseTo(out.transform.scaleX, 6);
  });

  it('soma a posição base do clipe à compensação', () => {
    const out = stabilizedClip(makeClip({ transform: { ...defaultTransform(), x: 100 } }), fakeAnalysis(), 1920, 1080, 0.5);
    expect(out.keyframes['x']?.[0]?.value).toBeCloseTo(104, 6);
  });

  it('mapeia tempo de mídia para tempo local de clipe invertido', () => {
    const clip = makeClip({ reversed: true, trimInMs: 500, speed: { ...defaultSpeed(), value: 2 } });
    const analysis: StabilizeAnalysis = { ...fakeAnalysis(), timesMs: [500, 632, 764] };
    const out = stabilizedClip(clip, analysis, 1920, 1080, 0.5);
    expect(out.keyframes['x']?.map((k) => k.timeMs)).toEqual([868, 934, 1000]);
  });

  it('mantém o clipe igual quando há congelamento de quadro', () => {
    const clip = makeClip({ freezeFrameMs: 300 });
    expect(stabilizedClip(clip, fakeAnalysis(), 1920, 1080, 0.5)).toBe(clip);
  });

  it('troca keyframes x e y anteriores e escala os de escala', () => {
    const clip = makeClip({
      keyframes: {
        x: [{ timeMs: 0, value: 999, easing: 'linear' }],
        scaleX: [{ timeMs: 0, value: 2, easing: 'linear' }],
      },
    });
    const out = stabilizedClip(clip, fakeAnalysis(), 1920, 1080, 0.5);
    expect(out.keyframes['x']?.some((k) => k.value === 999)).toBe(false);
    expect(out.keyframes['scaleX']?.[0]?.value).toBeCloseTo(2 * (1 + (2 * 8) / 1920), 6);
  });
});

describe('stabilizeClip', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useJobsStore.setState(useJobsStore.getInitialState());
    useProjectStore.setState({ project: null });
    vi.mocked(analyzeClip).mockReset();
    openClip();
  });

  it('aplica a estabilização numa única edição e termina o job', async () => {
    vi.mocked(analyzeClip).mockResolvedValue(fakeAnalysis());
    await stabilizeClip('c1', 0.5);
    expect(clipNow().keyframes['x']?.length).toBe(3);
    const job = useJobsStore.getState().jobs.find((j) => j.kind === 'stabilize');
    expect(job?.status).toBe('done');
    useTimelineStore.getState().undo();
    expect(clipNow().keyframes['x']).toBeUndefined();
  });

  it('marca o job com erro quando a análise falha', async () => {
    vi.mocked(analyzeClip).mockRejectedValue(new Error('boom'));
    await stabilizeClip('c1');
    const job = useJobsStore.getState().jobs.find((j) => j.kind === 'stabilize');
    expect(job?.status).toBe('error');
    expect(job?.errorCode).toBe('stabilize-failed');
    expect(clipNow().keyframes['x']).toBeUndefined();
  });

  it('recusa clipe que não é vídeo', async () => {
    openClip(makeClip(), makeAsset('image'));
    await stabilizeClip('c1');
    const job = useJobsStore.getState().jobs.find((j) => j.kind === 'stabilize');
    expect(job?.errorCode).toBe('stabilize-unsupported');
    expect(analyzeClip).not.toHaveBeenCalled();
  });

  it('cancelar o job remove-o sem erro e não grava nada', async () => {
    vi.mocked(analyzeClip).mockImplementation(
      (_asset, _start, _end, _progress, signal) =>
        new Promise<StabilizeAnalysis>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('cancelada', 'AbortError')));
        }),
    );
    const running = stabilizeClip('c1');
    const job = useJobsStore.getState().jobs.find((j) => j.kind === 'stabilize');
    expect(job).toBeDefined();
    useJobsStore.getState().cancelJob(job?.id ?? '');
    await running;
    expect(useJobsStore.getState().jobs.some((j) => j.kind === 'stabilize')).toBe(false);
    expect(clipNow().keyframes['x']).toBeUndefined();
  });

  it('parte da posição animada atual de x em cada amostra e mantém os keyframes fora do trecho', () => {
    const clip = makeClip({
      keyframes: {
        x: [
          { timeMs: 0, value: 100, easing: 'linear' },
          { timeMs: 1000, value: 300, easing: 'linear' },
        ],
      },
    });
    const out = stabilizedClip(clip, fakeAnalysis(), 1920, 1080, 0.5);
    const xs = out.keyframes['x'] ?? [];
    // Animado: 100 em 0, 113.2 em 66, 126.4 em 132. Compensação: 4, -8, 4. O keyframe em 1000 ms fica intacto.
    expect(xs.map((k) => k.timeMs)).toEqual([0, 66, 132, 1000]);
    expect(xs[0]?.value).toBeCloseTo(104, 6);
    expect(xs[1]?.value).toBeCloseTo(105.2, 6);
    expect(xs[2]?.value).toBeCloseTo(130.4, 6);
    expect(xs[3]?.value).toBe(300);
  });
});
