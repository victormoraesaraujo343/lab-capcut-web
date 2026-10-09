// Testes do cliente de exportação: caminhos (wav, worker, ffmpeg), cancelamento, erros e projeto vazio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/engine/project/createProject';
import { mixProjectAudio } from '../src/engine/audio/offlineMix';
import { exportMp3 } from '../src/engine/export/mp3Export';
import { exportVideoWithFfmpeg } from '../src/engine/export/ffmpegVideoExport';
import { canEncodeAac } from '../src/engine/export/aacSupport';
import { muxAacWithFfmpeg } from '../src/engine/export/ffmpegAacMux';
import { DEFAULT_EXPORT_SETTINGS } from '../src/engine/export/exportSettings';
import { globalFraction, startExport } from '../src/features/export/exportClient';
import type { ExportSettings, MixedAudio } from '../src/types/export';
import type { Clip, Project } from '../src/types/project';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '../src/types/project';

vi.mock('../src/engine/audio/offlineMix', () => ({ mixProjectAudio: vi.fn() }));
vi.mock('../src/engine/export/wavEncoder', () => ({ encodeWav: vi.fn(() => new ArrayBuffer(44)) }));
vi.mock('../src/engine/export/mp3Export', () => ({ exportMp3: vi.fn() }));
vi.mock('../src/engine/export/ffmpegVideoExport', () => ({ exportVideoWithFfmpeg: vi.fn() }));
vi.mock('../src/engine/export/aacSupport', () => ({ canEncodeAac: vi.fn() }));
vi.mock('../src/engine/export/ffmpegAacMux', () => ({ muxAacWithFfmpeg: vi.fn() }));

const mixMock = vi.mocked(mixProjectAudio);
const exportMp3Mock = vi.mocked(exportMp3);
const ffmpegMock = vi.mocked(exportVideoWithFfmpeg);
const canEncodeAacMock = vi.mocked(canEncodeAac);
const muxMock = vi.mocked(muxAacWithFfmpeg);

/** Mistura de áudio de teste (estéreo, 4 amostras por canal). */
function testMix(): MixedAudio {
  return { sampleRate: 48000, channels: [new Float32Array(4), new Float32Array(4)] };
}

/** Worker falso: registra as mensagens e deixa o teste disparar as respostas. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  /** Cria o worker e o registra na lista de instâncias. */
  constructor() {
    FakeWorker.instances.push(this);
  }

  /** Simula uma mensagem vinda do worker. */
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

/** Projeto com um clipe de vídeo de 2 s (ou sem clipes, quando visual é false). */
function projectWith(visual: boolean): Project {
  const project = createProject('Teste');
  const clip: Clip = {
    id: 'c1',
    assetId: 'a1',
    trackId: project.tracks[0]?.id ?? 't1',
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
    audio: defaultAudioFx(),
    reversed: false,
  };
  const tracks = project.tracks.map((track, index) =>
    index === 0 && visual ? { ...track, clips: [clip] } : track,
  );
  return { ...project, tracks, durationMs: visual ? 2000 : 0 };
}

/** Ajustes de exportação com o formato dado. */
function settingsFor(format: ExportSettings['format'], fileName = 'saida'): ExportSettings {
  return { ...DEFAULT_EXPORT_SETTINGS, format, fileName };
}

beforeEach(() => {
  canEncodeAacMock.mockResolvedValue(true);
  muxMock.mockResolvedValue(new ArrayBuffer(9));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  FakeWorker.instances = [];
});

describe('startExport', () => {
  it('exporta WAV sem usar o worker', async () => {
    mixMock.mockResolvedValue(testMix());
    const handle = startExport(projectWith(false), settingsFor('wav'), () => undefined);
    const { blob, fileName } = await handle.result;
    expect(blob.type).toBe('audio/wav');
    expect(fileName).toBe('saida.wav');
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('exporta MP3 pelo conversor de áudio', async () => {
    mixMock.mockResolvedValue(testMix());
    exportMp3Mock.mockResolvedValue(new ArrayBuffer(8));
    const { blob, fileName } = await startExport(projectWith(false), settingsFor('mp3'), () => undefined).result;
    expect(blob.type).toBe('audio/mpeg');
    expect(fileName).toBe('saida.mp3');
    expect(exportMp3Mock).toHaveBeenCalledWith(expect.anything(), 192, expect.any(Function), expect.any(AbortSignal));
  });

  it('manda MP4 ao worker com os buffers do áudio transferidos', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    const mix = testMix();
    mixMock.mockResolvedValue(mix);
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    const [message, transfer] = worker?.postMessage.mock.calls[0] ?? [];
    expect(message).toMatchObject({ type: 'start', jobId: 1 });
    expect(transfer).toEqual(mix.channels.map((channel) => channel.buffer));
    worker?.emit({ type: 'done', jobId: 1, data: new ArrayBuffer(4), mimeType: 'video/mp4', fileName: 'saida.mp4' });
    const { blob, fileName } = await handle.result;
    expect(blob.type).toBe('video/mp4');
    expect(fileName).toBe('saida.mp4');
    expect(worker?.terminate).toHaveBeenCalled();
  });

  it('sem AAC no navegador manda o worker sem áudio e junta o AAC com ffmpeg', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    canEncodeAacMock.mockResolvedValue(false);
    const mix = testMix();
    mixMock.mockResolvedValue(mix);
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    const [message, transfer] = worker?.postMessage.mock.calls[0] ?? [];
    expect(message).toMatchObject({ type: 'start', audio: null });
    expect(transfer).toEqual([]);
    worker?.emit({ type: 'done', jobId: 1, data: new ArrayBuffer(4), mimeType: 'video/mp4', fileName: 'saida.mp4' });
    const { blob, fileName } = await handle.result;
    expect(muxMock).toHaveBeenCalledWith(expect.any(ArrayBuffer), mix, 192, expect.any(Function), expect.any(AbortSignal));
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(9);
    expect(fileName).toBe('saida.mp4');
  });

  it('com AAC no navegador manda o áudio ao worker e não chama o ffmpeg de áudio', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    canEncodeAacMock.mockResolvedValue(true);
    const mix = testMix();
    mixMock.mockResolvedValue(mix);
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    const [message] = worker?.postMessage.mock.calls[0] ?? [];
    expect(message).toMatchObject({ type: 'start', audio: expect.anything() });
    worker?.emit({ type: 'done', jobId: 1, data: new ArrayBuffer(4), mimeType: 'video/mp4', fileName: 'saida.mp4' });
    await handle.result;
    expect(muxMock).not.toHaveBeenCalled();
  });

  it('informa progresso e tempo restante vindos do worker', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    const updates: number[] = [];
    const handle = startExport(projectWith(true), settingsFor('webm'), (update) => updates.push(update.fraction));
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    worker?.emit({ type: 'progress', jobId: 1, phase: 'video', done: 5, total: 10 });
    expect(updates).toContain(globalFraction('video', 0.5));
    worker?.emit({ type: 'done', jobId: 1, data: new ArrayBuffer(4), mimeType: 'video/webm', fileName: 'saida.webm' });
    await handle.result;
  });

  it('cancelar envia o cancelamento, termina o worker e rejeita com cancelled', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    handle.cancel();
    await expect(handle.result).rejects.toThrow('cancelled');
    expect(worker?.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', jobId: 1 });
    expect(worker?.terminate).toHaveBeenCalled();
  });

  it('erro do worker vira erro com o código', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    worker?.emit({ type: 'error', jobId: 1, code: 'encode', message: 'falhou' });
    await expect(handle.result).rejects.toThrow('encode');
    expect(worker?.terminate).toHaveBeenCalled();
  });

  it('projeto sem camada visual nem som rejeita com empty', async () => {
    mixMock.mockResolvedValue(null);
    await expect(startExport(projectWith(false), settingsFor('wav'), () => undefined).result).rejects.toThrow('empty');
    await expect(startExport(projectWith(false), settingsFor('mp4'), () => undefined).result).rejects.toThrow('empty');
  });

  it('sem VideoEncoder o MP4 usa o ffmpeg na thread principal', async () => {
    mixMock.mockResolvedValue(testMix());
    ffmpegMock.mockResolvedValue(new ArrayBuffer(3));
    const { blob } = await startExport(projectWith(true), settingsFor('mp4'), () => undefined).result;
    expect(blob.type).toBe('video/mp4');
    expect(ffmpegMock).toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('GIF sem VideoEncoder rejeita com no-webcodecs', async () => {
    await expect(startExport(projectWith(true), settingsFor('gif'), () => undefined).result).rejects.toThrow(
      'no-webcodecs',
    );
  });
  it('cancelar enquanto testa o AAC não cria nenhum worker', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    let resolveAac: (value: boolean) => void = () => undefined;
    canEncodeAacMock.mockReturnValue(new Promise<boolean>((resolve) => { resolveAac = resolve; }));
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(canEncodeAacMock).toHaveBeenCalled());
    handle.cancel();
    resolveAac(true);
    await expect(handle.result).rejects.toThrow('cancelled');
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('encerra o worker de vídeo antes de juntar o áudio com ffmpeg', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    canEncodeAacMock.mockResolvedValue(false);
    mixMock.mockResolvedValue(testMix());
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    worker?.emit({ type: 'done', jobId: 1, data: new ArrayBuffer(4), mimeType: 'video/mp4', fileName: 'saida.mp4' });
    await handle.result;
    expect(worker?.terminate).toHaveBeenCalledTimes(1);
    expect(muxMock).toHaveBeenCalled();
  });

  it('worker sem o codec pedido cai para o ffmpeg e avisa a fase de vídeo', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    ffmpegMock.mockResolvedValue(new ArrayBuffer(3));
    const phases: string[] = [];
    const handle = startExport(projectWith(true), settingsFor('webm'), (update) => phases.push(update.phase));
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    const worker = FakeWorker.instances[0];
    worker?.emit({ type: 'error', jobId: 1, code: 'unsupported-codec', message: 'unsupported-codec' });
    const { blob, fileName } = await handle.result;
    expect(ffmpegMock).toHaveBeenCalled();
    expect(phases).toContain('video');
    expect(blob.type).toBe('video/webm');
    expect(fileName).toBe('saida.webm');
    expect(worker?.terminate).toHaveBeenCalled();
  });

  it('falha do ffmpeg depois do fallback rejeita com o erro do ffmpeg', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    ffmpegMock.mockRejectedValue(new Error('ffmpeg-exec-failed:1'));
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    FakeWorker.instances[0]?.emit({ type: 'error', jobId: 1, code: 'unsupported-codec', message: 'unsupported-codec' });
    await expect(handle.result).rejects.toThrow('ffmpeg-exec-failed:1');
  });

  it('erro do worker em exportação pequena vira generic', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    const handle = startExport(projectWith(true), settingsFor('mp4'), () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    FakeWorker.instances[0]?.onerror?.({} as ErrorEvent);
    await expect(handle.result).rejects.toThrow('generic');
  });

  it('erro do worker em exportação acima de 1,5 GB vira memory', async () => {
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('Worker', FakeWorker);
    mixMock.mockResolvedValue(testMix());
    const project = { ...projectWith(true), durationMs: 600_000 };
    const settings: ExportSettings = { ...settingsFor('mp4'), bitrate: 'custom', customBitrateMbps: 50 };
    const handle = startExport(project, settings, () => undefined);
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
    FakeWorker.instances[0]?.onmessageerror?.({} as MessageEvent);
    await expect(handle.result).rejects.toThrow('memory');
  });
});
