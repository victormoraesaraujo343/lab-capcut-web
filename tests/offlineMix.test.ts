import { afterEach, describe, expect, it, vi } from 'vitest';
import { mixProjectAudio, segmentsInRange } from '../src/engine/audio/offlineMix';
import { originalSource, scheduleSegment, stretchedPlaySource } from '../src/engine/audio/audioNodes';
import { clearStretchedSegments } from '../src/engine/audio/stretchedBufferCache';
import { stretchChannels } from '../src/engine/audio/stretchClient';
import { computeSegments } from '../src/engine/audio/audioSchedule';
import { createPreviewAudioEngine } from '../src/engine/audio/previewAudioEngine';
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Asset,
  type Clip,
  type Project,
  type Track,
} from '../src/types/project';

vi.mock('../src/engine/storage/opfs', () => ({
  readFile: vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })),
}));

// Worker de esticamento substituído pelo WSOLA na própria thread (o teste não tem Worker).
vi.mock('../src/engine/audio/stretchClient', async () => {
  const { wsolaStretch } = await import('../src/engine/audio/timeStretch');
  return {
    stretchChannels: vi.fn(async (channels: Float32Array<ArrayBuffer>[], sampleRate: number, rate: number) =>
      channels.map((channel) => wsolaStretch(channel, sampleRate, rate)),
    ),
  };
});

/** Buffer de áudio falso com dados de verdade (para o corte do trecho esticado). */
function fakeDecodedBuffer(samples: number, sampleRate: number): AudioBuffer {
  const data = new Float32Array(samples);
  return {
    numberOfChannels: 1,
    sampleRate,
    length: samples,
    duration: samples / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

interface FakeSource {
  buffer: unknown;
  playbackRate: { value: number };
  connect: () => void;
  start: (when: number, offset: number) => void;
  stop: (when: number) => void;
  started: { when: number; offset: number } | null;
  stopAt: number | null;
}

interface FakeGain {
  gain: { setValueAtTime: (value: number, when: number) => void; linearRampToValueAtTime: (value: number, when: number) => void };
  connect: () => void;
}

/** Chamada de envelope de volume registrada num ganho falso. */
interface EnvelopeCall {
  op: 'setValueAtTime' | 'linearRampToValueAtTime';
  value: number;
  when: number;
}

/** Contexto offline falso: registra as fontes criadas e devolve um canal de teste por canal. */
class FakeOfflineAudioContext {
  static last: FakeOfflineAudioContext | null = null;
  static renderCalls = 0;
  destination = {};
  sources: FakeSource[] = [];
  envelopeCalls: EnvelopeCall[] = [];
  decodeCalls = 0;
  created: string[] = [];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    FakeOfflineAudioContext.last = this;
  }
  decodeAudioData(): Promise<unknown> {
    this.decodeCalls++;
    return Promise.resolve(fakeDecodedBuffer(4000, 1000));
  }
  createBuffer(channels: number, length: number): FakeCreatedBuffer {
    return createdBufferFake(channels, length);
  }
  createDelay(): FakeEffectNode {
    return fakeEffectNode('delay', this.created);
  }
  createBiquadFilter(): FakeEffectNode {
    return fakeEffectNode('biquad', this.created);
  }
  createDynamicsCompressor(): FakeEffectNode {
    return fakeEffectNode('compressor', this.created);
  }
  createBufferSource(): FakeSource {
    this.created.push('source');
    const source: FakeSource = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: () => undefined,
      started: null,
      stopAt: null,
      start(when, offset) {
        this.started = { when, offset };
      },
      stop(when) {
        this.stopAt = when;
      },
    };
    this.sources.push(source);
    return source;
  }
  createGain(): FakeGain {
    this.created.push('gain');
    const calls = this.envelopeCalls;
    return {
      gain: {
        setValueAtTime: (value, when) => {
          calls.push({ op: 'setValueAtTime', value, when });
        },
        linearRampToValueAtTime: (value, when) => {
          calls.push({ op: 'linearRampToValueAtTime', value, when });
        },
      },
      connect: () => undefined,
    };
  }
  startRendering(): Promise<unknown> {
    FakeOfflineAudioContext.renderCalls++;
    return Promise.resolve({
      getChannelData: (channel: number) => new Float32Array([channel + 1, channel + 1]),
    });
  }
}

/** Contexto de áudio falso da prévia: registra as chamadas de envelope dos ganhos dos trechos. */
class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 0;
  state = 'running';
  destination = {};
  envelopeCalls: EnvelopeCall[] = [];
  created: string[] = [];
  sources: { buffer: unknown; playbackRate: { value: number } }[] = [];

  constructor() {
    FakeAudioContext.last = this;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve(previewBuffer);
  }
  createBuffer(channels: number, length: number): FakeCreatedBuffer {
    return createdBufferFake(channels, length);
  }
  createDelay(): FakeEffectNode {
    return fakeEffectNode('delay', this.created);
  }
  createBiquadFilter(): FakeEffectNode {
    return fakeEffectNode('biquad', this.created);
  }
  createDynamicsCompressor(): FakeEffectNode {
    return fakeEffectNode('compressor', this.created);
  }
  createBufferSource() {
    this.created.push('source');
    const source = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
    };
    this.sources.push(source);
    return source;
  }
  createGain() {
    this.created.push('gain');
    const calls = this.envelopeCalls;
    return {
      gain: {
        value: 1,
        setValueAtTime: (value: number, when: number) => {
          calls.push({ op: 'setValueAtTime', value, when });
        },
        linearRampToValueAtTime: (value: number, when: number) => {
          calls.push({ op: 'linearRampToValueAtTime', value, when });
        },
      },
      connect: () => undefined,
      disconnect: () => undefined,
    };
  }
}

vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
vi.stubGlobal('AudioContext', FakeAudioContext);

/** Buffer decodificado falso da prévia: 2 s a 1 kHz, mono, com amostras reais. */
const previewBuffer = fakeDecodedBuffer(2000, 1000);

/** Nó de efeito falso (atraso, filtro, compressor): aceita os parâmetros que a cadeia ajusta. */
interface FakeEffectNode {
  type: string;
  gain: { value: number };
  delayTime: { value: number };
  frequency: { value: number };
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect: () => void;
  disconnect: () => void;
}

/** Cria um nó de efeito falso e registra o tipo na lista de criados. */
function fakeEffectNode(kind: string, created: string[]): FakeEffectNode {
  created.push(kind);
  return {
    type: '',
    gain: { value: 1 },
    delayTime: { value: 0 },
    frequency: { value: 0 },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: () => undefined,
    disconnect: () => undefined,
  };
}

/** Buffer criado por createBuffer nos contextos falsos: registra os canais copiados. */
interface FakeCreatedBuffer {
  channels: number;
  length: number;
  data: Float32Array[];
  copyToChannel: (data: Float32Array, channel: number) => void;
}

function createdBufferFake(channels: number, length: number): FakeCreatedBuffer {
  const entry: FakeCreatedBuffer = {
    channels,
    length,
    data: [],
    copyToChannel: (data, channel) => {
      entry.data[channel] = data;
    },
  };
  return entry;
}

afterEach(() => {
  FakeOfflineAudioContext.last = null;
  FakeOfflineAudioContext.renderCalls = 0;
  FakeAudioContext.last = null;
  clearStretchedSegments();
  vi.mocked(stretchChannels).mockClear();
});

/** Espera as promessas pendentes do motor da prévia (carga de buffer e agendamento). */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeAsset(id: string, kind: Asset['kind']): Asset {
  return {
    id,
    kind,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}`,
    sizeBytes: 1000,
    thumbnails: [],
    createdAt: 0,
  };
}

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

function makeTrack(overrides: Partial<Track> & { id: string; kind: Track['kind'] }): Track {
  return { name: overrides.id, clips: [], muted: false, locked: false, hidden: false, ...overrides };
}

function makeProject(tracks: Track[], assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks,
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('segmentsInRange', () => {
  it('corta a duração do clipe que passa do fim do intervalo', () => {
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'video', clips: [makeClip({ id: 'c1', trackId: 't1', startMs: 0, durationMs: 5000 })] })],
      [makeAsset('a1', 'video')],
    );
    const segments = segmentsInRange(project, 1000, 3000);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.startAtTimelineMs).toBe(1000);
    expect(segments[0]?.durationMs).toBe(2000);
  });

  it('ignora clipe que começa depois do fim', () => {
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [makeClip({ id: 'c1', trackId: 't1', startMs: 4000, durationMs: 1000 })] })],
      [makeAsset('a1', 'audio')],
    );
    expect(segmentsInRange(project, 0, 3000)).toEqual([]);
  });

  it('ignora trilha muda', () => {
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', muted: true, clips: [makeClip({ id: 'c1', trackId: 't1' })] })],
      [makeAsset('a1', 'audio')],
    );
    expect(segmentsInRange(project, 0, 1000)).toEqual([]);
  });
});

describe('mixProjectAudio', () => {
  it('retorna null quando não há nenhum trecho com som', async () => {
    const project = makeProject([makeTrack({ id: 't1', kind: 'text' })], []);
    await expect(mixProjectAudio(project, 0, 1000)).resolves.toBeNull();
    expect(FakeOfflineAudioContext.last).toBeNull();
  });

  it('agenda start e offset relativos ao início da mixagem', async () => {
    const project = makeProject(
      [
        makeTrack({
          id: 't1',
          kind: 'audio',
          clips: [
            makeClip({ id: 'c1', trackId: 't1', startMs: 0, durationMs: 2000, trimInMs: 500 }),
            makeClip({ id: 'c2', trackId: 't1', startMs: 1500, durationMs: 1000 }),
          ],
        }),
      ],
      [makeAsset('a1', 'audio')],
    );
    const mixed = await mixProjectAudio(project, 1000, 3000, { sampleRate: 1000 });
    const ctx = FakeOfflineAudioContext.last;
    expect(ctx?.length).toBe(2000);
    expect(ctx?.numberOfChannels).toBe(2);
    expect(ctx?.decodeCalls).toBe(1);
    const [first, second] = ctx?.sources ?? [];
    expect(first?.started).toEqual({ when: 0, offset: 1.5 });
    expect(first?.stopAt).toBe(1.0);
    expect(second?.started).toEqual({ when: 0.5, offset: 0 });
    expect(second?.stopAt).toBe(1.5);
    expect(FakeOfflineAudioContext.renderCalls).toBe(1);
    expect(mixed?.sampleRate).toBe(1000);
    expect(mixed?.channels).toHaveLength(2);
    expect(Array.from(mixed?.channels[1] ?? [])).toEqual([2, 2]);
  });

  it('lança AbortError quando o sinal já está abortado', async () => {
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [makeClip({ id: 'c1', trackId: 't1' })] })],
      [makeAsset('a1', 'audio')],
    );
    const controller = new AbortController();
    controller.abort();
    await expect(mixProjectAudio(project, 0, 1000, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(FakeOfflineAudioContext.renderCalls).toBe(0);
  });

  it('não renderiza quando cancelado durante o progresso', async () => {
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [makeClip({ id: 'c1', trackId: 't1' })] })],
      [makeAsset('a1', 'audio')],
    );
    const controller = new AbortController();
    const progress: number[] = [];
    const promise = mixProjectAudio(project, 0, 1000, {
      signal: controller.signal,
      onProgress: (fraction) => {
        progress.push(fraction);
        if (fraction === 0.5) {
          controller.abort();
        }
      },
    });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toEqual([0, 0.5]);
    expect(FakeOfflineAudioContext.renderCalls).toBe(0);
  });
});

describe('envelope de volume: prévia e mixagem offline', () => {
  it('fazem as mesmas chamadas de setValueAtTime/linearRampToValueAtTime para o mesmo trecho', async () => {
    const audio = { ...defaultAudioFx(), fadeInMs: 300, fadeOutMs: 400 };
    const project = makeProject(
      [
        makeTrack({
          id: 't1',
          kind: 'audio',
          clips: [makeClip({ id: 'c1', trackId: 't1', startMs: 500, durationMs: 2000, volume: 0.8, audio })],
        }),
      ],
      [makeAsset('a1', 'audio')],
    );

    const engine = createPreviewAudioEngine();
    await engine.play(project, 0);
    await flushPromises();
    const previewCalls = FakeAudioContext.last?.envelopeCalls ?? [];
    engine.dispose();

    await mixProjectAudio(project, 0, 3000, { sampleRate: 1000 });
    const offlineCalls = FakeOfflineAudioContext.last?.envelopeCalls ?? [];

    // Chamadas esperadas: silêncio no início, subida do fade-in, patamar e queda até zero no fim.
    expect(offlineCalls.map((call) => [call.op, call.value])).toEqual([
      ['setValueAtTime', 0],
      ['linearRampToValueAtTime', 0.8],
      ['linearRampToValueAtTime', 0.8],
      ['linearRampToValueAtTime', 0],
    ]);
    // A prévia agenda a partir de uma folga de 50 ms no relógio do áudio; descontada essa folga, os instantes batem.
    const previewLeadS = 0.05;
    expect(previewCalls.map((call) => call.op)).toEqual(offlineCalls.map((call) => call.op));
    previewCalls.forEach((call, index) => {
      expect(call.value).toBeCloseTo(offlineCalls[index]?.value ?? Number.NaN, 9);
      expect(call.when - previewLeadS).toBeCloseTo(offlineCalls[index]?.when ?? Number.NaN, 9);
    });
  });
});

/** Chamada de setValueCurveAtTime registrada num parâmetro falso. */
interface CurveCall {
  values: Float32Array;
  when: number;
  duration: number;
}

/** Parâmetro falso (playbackRate) que grava valores e curvas. */
interface FakeParam {
  value: number;
  curveCalls: CurveCall[];
  setValueAtTime: (value: number, when: number) => void;
  setValueCurveAtTime: (values: Float32Array, when: number, duration: number) => void;
}

/** Fonte falsa criada pelo contexto de nós: grava buffer, taxa, início e parada. */
interface NodeSource {
  buffer: unknown;
  playbackRate: FakeParam;
  started: { when: number; offset: number } | null;
  stopAt: number | null;
  connect: () => void;
  start: (when: number, offset: number) => void;
  stop: (when: number) => void;
}

/** Contexto falso para scheduleSegment direto: registra fontes e buffers esticados criados. */
class FakeNodeContext {
  sources: NodeSource[] = [];
  createdBuffers: { channels: number; length: number; data: Float32Array[] }[] = [];

  createBufferSource(): NodeSource {
    const playbackRate: FakeParam = {
      value: 1,
      curveCalls: [],
      setValueAtTime: () => undefined,
      setValueCurveAtTime(values, when, duration) {
        this.curveCalls.push({ values, when, duration });
      },
    };
    const source: NodeSource = {
      buffer: null,
      playbackRate,
      started: null,
      stopAt: null,
      connect: () => undefined,
      start(when, offset) {
        this.started = { when, offset };
      },
      stop(when) {
        this.stopAt = when;
      },
    };
    this.sources.push(source);
    return source;
  }

  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
      connect: () => undefined,
    };
  }

  createBuffer(channels: number, length: number): { copyToChannel: (data: Float32Array, channel: number) => void } {
    const entry = { channels, length, data: [] as Float32Array[] };
    this.createdBuffers.push(entry);
    return {
      copyToChannel: (data, channel) => {
        entry.data[channel] = data;
      },
    };
  }
}

/** Buffer de origem falso: um canal de silêncio com a taxa de amostragem dada. */
function sourceBuffer(samples: number, sampleRate: number): AudioBuffer {
  const data = new Float32Array(samples);
  return {
    numberOfChannels: 1,
    sampleRate,
    length: samples,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

/** Trecho agendado de um clipe, como o motor de áudio calcularia. */
function segmentOf(clip: Clip, fromMs = 0) {
  const project = makeProject(
    [makeTrack({ id: 't1', kind: 'audio', clips: [clip] })],
    [makeAsset('a1', 'audio')],
  );
  const [segment] = computeSegments(project, fromMs);
  if (!segment) throw new Error('trecho esperado');
  return segment;
}

describe('velocidade no nó de áudio (scheduleSegment)', () => {
  it('velocidade constante sem manter o tom usa a taxa direta do buffer original', () => {
    const clip = makeClip({
      id: 'n1',
      trackId: 't1',
      durationMs: 1000,
      trimInMs: 100,
      speed: { mode: 'constant', value: 2, curve: [], preservePitch: false },
    });
    const ctx = new FakeNodeContext();
    const buffer = sourceBuffer(2000, 1000);
    const node = scheduleSegment(
      ctx as unknown as BaseAudioContext,
      {} as AudioNode,
      originalSource(buffer),
      clip,
      segmentOf(clip, 250),
      0,
    );
    const [source] = ctx.sources;
    expect(node).not.toBeNull();
    expect(ctx.createdBuffers).toHaveLength(0);
    expect(source?.buffer).toBe(buffer);
    expect(source?.playbackRate.value).toBe(2);
    // Trecho de 250 ms da timeline: offset = trimIn 100 + 250 ms x 2 = 600 ms de mídia.
    expect(source?.started).toEqual({ when: 0, offset: 0.6 });
    expect(source?.stopAt).toBeCloseTo(0.75, 9);
  });

  it('velocidade constante mantendo o tom usa o trecho esticado e taxa residual 1', async () => {
    const clip = makeClip({
      id: 'n2',
      trackId: 't1',
      durationMs: 1000,
      speed: { mode: 'constant', value: 2, curve: [], preservePitch: true },
    });
    const ctx = new FakeNodeContext();
    const buffer = sourceBuffer(2000, 1000);
    const playable = await stretchedPlaySource(ctx as unknown as BaseAudioContext, makeAsset('a1', 'audio'), buffer, clip);
    scheduleSegment(ctx as unknown as BaseAudioContext, {} as AudioNode, playable, clip, segmentOf(clip, 250), 0);
    const [source] = ctx.sources;
    expect(ctx.createdBuffers).toHaveLength(1);
    expect(ctx.createdBuffers[0]?.length).toBe(1000);
    expect(source?.buffer).not.toBe(buffer);
    expect(source?.playbackRate.value).toBe(1);
    // A mídia de 500 ms (250 ms x 2) cai em 250 ms do trecho esticado.
    expect(source?.started?.offset).toBeCloseTo(0.25, 9);
  });

  it('velocidade por curva automatiza a taxa ao longo do trecho, sem esticar o buffer', () => {
    const clip = makeClip({
      id: 'n3',
      trackId: 't1',
      durationMs: 1000,
      speed: {
        mode: 'curve',
        value: 1,
        preservePitch: true,
        curve: [
          { t: 0, speed: 1 },
          { t: 1, speed: 3 },
        ],
      },
    });
    const ctx = new FakeNodeContext();
    scheduleSegment(
      ctx as unknown as BaseAudioContext,
      {} as AudioNode,
      originalSource(sourceBuffer(2000, 1000)),
      clip,
      segmentOf(clip),
      0,
    );
    const [source] = ctx.sources;
    expect(ctx.createdBuffers).toHaveLength(0);
    const call = source?.playbackRate.curveCalls[0];
    expect(call?.duration).toBe(1);
    expect(call?.when).toBe(0);
    expect(call?.values[0]).toBeCloseTo(1, 6);
    expect(call?.values[call.values.length - 1]).toBeCloseTo(3, 6);
    expect(source?.started?.offset).toBe(0);
  });

  it('velocidade fora de 0,0625x a 16x deixa o clipe mudo, em constante e em curva', () => {
    const fast = makeClip({
      id: 'm1',
      trackId: 't1',
      speed: { mode: 'constant', value: 20, curve: [], preservePitch: false },
    });
    const slow = makeClip({
      id: 'm2',
      trackId: 't1',
      speed: {
        mode: 'curve',
        value: 1,
        preservePitch: false,
        curve: [
          { t: 0, speed: 1 },
          { t: 1, speed: 40 },
        ],
      },
    });
    const ctx = new FakeNodeContext();
    const buffer = sourceBuffer(2000, 1000);
    const source = originalSource(buffer);
    expect(scheduleSegment(ctx as unknown as BaseAudioContext, {} as AudioNode, source, fast, segmentOf(fast), 0)).toBeNull();
    expect(scheduleSegment(ctx as unknown as BaseAudioContext, {} as AudioNode, source, slow, segmentOf(slow), 0)).toBeNull();
    expect(ctx.sources).toHaveLength(0);
  });

  it('a mixagem offline não cria fonte para clipe fora da faixa do Web Audio', async () => {
    const clip = makeClip({
      id: 'm3',
      trackId: 't1',
      speed: { mode: 'constant', value: 0.01, curve: [], preservePitch: false },
    });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    await mixProjectAudio(project, 0, 1000, { sampleRate: 1000 });
    expect(FakeOfflineAudioContext.last?.sources).toHaveLength(0);
  });
});

describe('volume por keyframe na mixagem offline', () => {
  it('automatiza o ganho nos instantes dos keyframes, com a interpolação entre eles', async () => {
    const clip = makeClip({
      id: 'vk',
      trackId: 't1',
      startMs: 0,
      durationMs: 1000,
      volume: 1,
      keyframes: {
        volume: [
          { timeMs: 0, value: 0.5, easing: 'linear' },
          { timeMs: 500, value: 1, easing: 'linear' },
          { timeMs: 1000, value: 1.5, easing: 'linear' },
        ],
      },
    });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    await mixProjectAudio(project, 0, 1000, { sampleRate: 1000 });
    expect(FakeOfflineAudioContext.last?.envelopeCalls).toEqual([
      { op: 'setValueAtTime', value: 0.5, when: 0 },
      { op: 'linearRampToValueAtTime', value: 1, when: 0.5 },
      { op: 'linearRampToValueAtTime', value: 1.5, when: 1 },
    ]);
  });
});

describe('trecho esticado no caminho de exportação e de prévia', () => {
  it('a mixagem offline espera o trecho esticado antes de agendar a fonte', async () => {
    const clip = makeClip({
      id: 'w1',
      trackId: 't1',
      durationMs: 1000,
      speed: { mode: 'constant', value: 2, curve: [], preservePitch: true },
    });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    let release: (channels: Float32Array<ArrayBuffer>[]) => void = () => undefined;
    vi.mocked(stretchChannels).mockImplementationOnce(
      () => new Promise<Float32Array<ArrayBuffer>[]>((resolve) => {
        release = resolve;
      }),
    );

    const promise = mixProjectAudio(project, 0, 1000, { sampleRate: 1000 });
    await flushPromises();
    expect(FakeOfflineAudioContext.last?.sources).toHaveLength(0);
    expect(FakeOfflineAudioContext.renderCalls).toBe(0);

    release([new Float32Array(500)]);
    await promise;
    const ctx = FakeOfflineAudioContext.last;
    expect(ctx?.sources).toHaveLength(1);
    const [source] = ctx?.sources ?? [];
    expect(source?.playbackRate.value).toBe(1);
    expect(source?.started).toEqual({ when: 0, offset: 0 });
    expect((source?.buffer as { length: number } | undefined)?.length).toBe(1000);
    expect(FakeOfflineAudioContext.renderCalls).toBe(1);
    expect(vi.mocked(stretchChannels)).toHaveBeenCalledTimes(1);
  });

  it('a prévia toca na velocidade comum enquanto o trecho não está pronto e usa o esticado depois', async () => {
    const clip = makeClip({
      id: 'p1',
      trackId: 't1',
      durationMs: 1000,
      speed: { mode: 'constant', value: 2, curve: [], preservePitch: true },
    });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    const engine = createPreviewAudioEngine();

    await engine.play(project, 0);
    await flushPromises();
    const context = FakeAudioContext.last;
    const first = context?.sources[0];
    expect(first?.playbackRate.value).toBe(2);
    expect(first?.buffer).toBe(previewBuffer);
    expect(vi.mocked(stretchChannels)).toHaveBeenCalledTimes(1);

    await flushPromises();
    engine.reschedule(project);
    await flushPromises();
    const latest = context?.sources[context.sources.length - 1];
    expect(latest?.playbackRate.value).toBe(1);
    expect(latest?.buffer).not.toBe(previewBuffer);
    engine.dispose();
  });
});

describe('efeitos de voz e redução de ruído: prévia e exportação', () => {
  it('prévia e mixagem criam a mesma cadeia de nós (redução de ruído e eco)', async () => {
    const audio = {
      ...defaultAudioFx(),
      denoise: true,
      voiceEffect: { id: 'v1', type: 'echo', params: { delayMs: 200, feedback: 0.3, mix: 0.5 } },
    };
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [makeClip({ id: 'c1', trackId: 't1', durationMs: 1000, audio })] })],
      [makeAsset('a1', 'audio')],
    );

    const engine = createPreviewAudioEngine();
    await engine.play(project, 0);
    await flushPromises();
    // O primeiro nó da prévia é o ganho mestre, criado antes de qualquer trecho.
    const previewKinds = FakeAudioContext.last?.created.slice(1) ?? [];
    engine.dispose();

    await mixProjectAudio(project, 0, 1000, { sampleRate: 1000 });
    const offlineKinds = FakeOfflineAudioContext.last?.created ?? [];

    expect(offlineKinds).toEqual(previewKinds);
    expect(offlineKinds).toContain('biquad');
    expect(offlineKinds).toContain('compressor');
    expect(offlineKinds).toContain('delay');
  });

  it('tom de +12 semitons estica o trecho por 0,5 e toca o dobro, sem mudar a duração', async () => {
    const audio = {
      ...defaultAudioFx(),
      voiceEffect: { id: 'v1', type: 'pitch', params: { semitones: 12 } },
    };
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [makeClip({ id: 'c1', trackId: 't1', durationMs: 1000, audio })] })],
      [makeAsset('a1', 'audio')],
    );

    await mixProjectAudio(project, 0, 1000, { sampleRate: 1000 });
    const [first] = FakeOfflineAudioContext.last?.sources ?? [];

    expect(vi.mocked(stretchChannels)).toHaveBeenCalledWith(expect.anything(), 1000, 0.5);
    expect(first?.playbackRate.value).toBeCloseTo(2, 6);
    expect(FakeOfflineAudioContext.last?.created).not.toContain('delay');
  });
});
