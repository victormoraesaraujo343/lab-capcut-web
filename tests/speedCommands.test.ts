import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { applySpeedPreset, setClipSpeed, setPreservePitch, setSpeedCurve } from '@/stores/speedCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { SPEED_CURVE_PRESETS } from '@/engine/timeline/speedCurve';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

/** Clipe de teste com os campos padrão. */
function makeClip(overrides: Partial<Clip> & { id: string; trackId: string }): Clip {
  return {
    assetId: 'a1',
    startMs: 0,
    durationMs: 1000,
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
    ...overrides,
  };
}

/** Abre um projeto com as trilhas dadas no store. */
function openTracks(tracks: Track[]): Project {
  const base = createProject('Velocidade');
  const project = { ...base, tracks };
  useProjectStore.setState({ project });
  return project;
}

/** Clipe pelo id, na trilha aberta. */
function clipById(id: string): Clip {
  const project = useProjectStore.getState().project;
  const clip = project?.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  if (clip === undefined) throw new Error(`sem clipe ${id}`);
  return clip;
}

describe('velocidade do clipe', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('velocidade 2x encolhe o clipe pela metade e deixa buraco depois dele', () => {
    openTracks([
      {
        id: 'v1',
        kind: 'video',
        name: 'V1',
        muted: false,
        locked: false,
        hidden: false,
        clips: [
          makeClip({ id: 'A', trackId: 'v1', startMs: 0, durationMs: 1000 }),
          makeClip({ id: 'B', trackId: 'v1', startMs: 1000, durationMs: 1000 }),
        ],
      },
    ]);
    setClipSpeed('A', 2);
    expect(clipById('A').speed).toMatchObject({ mode: 'constant', value: 2 });
    expect(clipById('A').durationMs).toBe(500);
    expect(clipById('B').startMs).toBe(1000);
  });

  it('velocidade menor que 1 alonga o clipe e empurra os clipes seguintes da mesma trilha', () => {
    openTracks([
      {
        id: 'v1',
        kind: 'video',
        name: 'V1',
        muted: false,
        locked: false,
        hidden: false,
        clips: [
          makeClip({ id: 'A', trackId: 'v1', startMs: 0, durationMs: 1000 }),
          makeClip({ id: 'B', trackId: 'v1', startMs: 1000, durationMs: 1000 }),
        ],
      },
      {
        id: 'v2',
        kind: 'video',
        name: 'V2',
        muted: false,
        locked: false,
        hidden: false,
        clips: [makeClip({ id: 'C', trackId: 'v2', startMs: 1000, durationMs: 1000 })],
      },
    ]);
    setClipSpeed('A', 0.5);
    expect(clipById('A').durationMs).toBe(2000);
    expect(clipById('B').startMs).toBe(2000);
    expect(clipById('C').startMs).toBe(1000);
  });

  it('limita a velocidade constante entre 0,1x e 100x', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1' })] },
    ]);
    setClipSpeed('A', 500);
    expect(clipById('A').speed.value).toBe(100);
    setClipSpeed('A', 0.01);
    expect(clipById('A').speed.value).toBe(0.1);
  });

  it('troca de velocidade acompanha a mídia usada: 2x e depois 4x dá um quarto da duração original', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1', durationMs: 1000 })] },
    ]);
    setClipSpeed('A', 2);
    setClipSpeed('A', 4);
    expect(clipById('A').durationMs).toBe(250);
  });

  it('a curva de velocidade usa a média para a duração e os pontos são limitados e ordenados', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1', durationMs: 10000 })] },
    ]);
    setSpeedCurve('A', [
      { t: 1, speed: 500 },
      { t: 0, speed: 1 },
    ]);
    const clip = clipById('A');
    expect(clip.speed.mode).toBe('curve');
    expect(clip.speed.curve).toEqual([
      { t: 0, speed: 1 },
      { t: 1, speed: 100 },
    ]);
    // Média da rampa de 1x a 100x é 50,5: a mídia de 10000 ms ocupa cerca de 198 ms na timeline.
    expect(clip.durationMs).toBe(Math.round(10000 / 50.5));
  });

  it('aplica um preset de curva e ignora id desconhecido', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1' })] },
    ]);
    const montage = SPEED_CURVE_PRESETS.find((p) => p.id === 'montage');
    applySpeedPreset('A', 'montage');
    expect(clipById('A').speed.mode).toBe('curve');
    expect(clipById('A').speed.curve).toEqual(montage?.curve);

    applySpeedPreset('A', 'inexistente' as Parameters<typeof applySpeedPreset>[1]);
    expect(clipById('A').speed.curve).toEqual(montage?.curve);
  });

  it('liga e desliga a manutenção do tom sem mudar a duração', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1' })] },
    ]);
    setClipSpeed('A', 2);
    const duration = clipById('A').durationMs;
    setPreservePitch('A', false);
    expect(clipById('A').speed.preservePitch).toBe(false);
    expect(clipById('A').durationMs).toBe(duration);
  });

  it('os keyframes acompanham a nova duração do clipe', () => {
    openTracks([
      {
        id: 'v1',
        kind: 'video',
        name: 'V1',
        muted: false,
        locked: false,
        hidden: false,
        clips: [
          makeClip({
            id: 'A',
            trackId: 'v1',
            durationMs: 1000,
            keyframes: { volume: [{ timeMs: 500, value: 0.5, easing: 'linear' }] },
          }),
        ],
      },
    ]);
    setClipSpeed('A', 2);
    expect(clipById('A').keyframes['volume']?.[0]?.timeMs).toBe(250);
  });

  it('não muda clipe de trilha travada', () => {
    openTracks([
      { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: true, hidden: false, clips: [makeClip({ id: 'A', trackId: 'v1' })] },
    ]);
    setClipSpeed('A', 2);
    expect(clipById('A').speed.value).toBe(1);
    expect(clipById('A').durationMs).toBe(1000);
  });
});
