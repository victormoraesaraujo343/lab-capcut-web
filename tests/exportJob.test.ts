import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportResponse, MixedAudio, ResolvedExport } from '../src/types/export';
import type { Project } from '../src/types/project';
import type { FrameProvider } from '../src/types/render';
import { runExportJob } from '../src/engine/export/exportJob';
import { encodeAudio } from '../src/engine/export/audioEncode';
import { createExportFrameProvider } from '../src/engine/export/exportFrameProvider';
import { exportGif } from '../src/engine/export/gifExport';
import { createMuxer } from '../src/engine/export/muxers';
import type { ExportMuxer } from '../src/engine/export/muxers';
import { encodeVideo } from '../src/engine/export/videoEncode';
import { ensureProjectFonts } from '../src/engine/text/fontLoader';

vi.mock('../src/engine/export/videoEncode', () => ({ encodeVideo: vi.fn() }));
vi.mock('../src/engine/export/audioEncode', () => ({ encodeAudio: vi.fn() }));
vi.mock('../src/engine/export/muxers', () => ({ createMuxer: vi.fn() }));
vi.mock('../src/engine/export/exportFrameProvider', () => ({ createExportFrameProvider: vi.fn() }));
vi.mock('../src/engine/export/gifExport', () => ({ exportGif: vi.fn() }));
vi.mock('../src/engine/text/fontLoader', () => ({ ensureProjectFonts: vi.fn(async () => undefined) }));

const encodeVideoMock = vi.mocked(encodeVideo);
const encodeAudioMock = vi.mocked(encodeAudio);
const createMuxerMock = vi.mocked(createMuxer);
const createProviderMock = vi.mocked(createExportFrameProvider);
const exportGifMock = vi.mocked(exportGif);
const ensureFontsMock = vi.mocked(ensureProjectFonts);

/** URL base usada nos pedidos de teste. */
const BASE = 'https://app.test/';

const config: ResolvedExport = {
  format: 'mp4',
  width: 1280,
  height: 720,
  fps: 30,
  videoBitrate: 5_000_000,
  audioBitrate: 128_000,
  videoCodec: 'avc1.640028',
  audioCodec: 'mp4a.40.2',
  keyFrameInterval: 60,
  startMs: 0,
  endMs: 1000,
  fileName: 'video.mp4',
  mimeType: 'video/mp4',
};

const audio: MixedAudio = { sampleRate: 48000, channels: [new Float32Array(10), new Float32Array(10)] };

/** Projeto com uma trilha de vídeo que cruza o intervalo. */
function projectWithVideo(): Project {
  return {
    width: 1280,
    height: 720,
    tracks: [
      {
        id: 't1',
        kind: 'video',
        hidden: false,
        clips: [{ id: 'c1', startMs: 0, durationMs: 2000 }],
      },
    ],
  } as unknown as Project;
}

/** Projeto sem nenhum clipe visual nem de áudio no intervalo. */
function emptyProject(): Project {
  return { width: 1280, height: 720, tracks: [] } as unknown as Project;
}

/** Provedor de quadros falso com dispose espionado. */
function fakeProvider(): { provider: FrameProvider; dispose: ReturnType<typeof vi.fn> } {
  const dispose = vi.fn();
  return { provider: { dispose } as unknown as FrameProvider, dispose };
}

/** Muxer falso que devolve o buffer dado ao finalizar. */
function fakeMuxer(buffer: ArrayBuffer): ExportMuxer {
  return {
    addVideoChunk: vi.fn(),
    addAudioChunk: vi.fn(),
    finalize: () => buffer,
  };
}

describe('runExportJob', () => {
  let posted: ExportResponse[];
  let post: (response: ExportResponse) => void;

  beforeEach(() => {
    vi.stubGlobal('VideoEncoder', function VideoEncoderStub() {});
    vi.stubGlobal('AudioEncoder', function AudioEncoderStub() {});
    vi.stubGlobal('VideoFrame', function VideoFrameStub() {});
    vi.stubGlobal('AudioData', function AudioDataStub() {});
    posted = [];
    post = (response) => {
      posted.push(response);
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('roda as fases na ordem e posta done com o próprio buffer', async () => {
    const order: string[] = [];
    const buffer = new ArrayBuffer(16);
    const { provider, dispose } = fakeProvider();
    createProviderMock.mockReturnValue(provider);
    const muxer = fakeMuxer(buffer);
    createMuxerMock.mockReturnValue(muxer);
    encodeAudioMock.mockImplementation(async () => {
      order.push('audio');
    });
    encodeVideoMock.mockImplementation(async () => {
      order.push('video');
    });
    const finalize = vi.spyOn(muxer, 'finalize');

    await runExportJob({ project: projectWithVideo(), config, audio, assetBaseUrl: BASE }, post, () => false, 7);

    expect(order).toEqual(['audio', 'video']);
    expect(finalize).toHaveBeenCalledTimes(1);
    const done = posted.at(-1);
    expect(done).toEqual({
      type: 'done',
      jobId: 7,
      data: buffer,
      mimeType: 'video/mp4',
      fileName: 'video.mp4',
    });
    expect(posted.some((r) => r.type === 'progress' && r.phase === 'finalizing')).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('pula o áudio quando não há áudio', async () => {
    const { provider } = fakeProvider();
    createProviderMock.mockReturnValue(provider);
    createMuxerMock.mockReturnValue(fakeMuxer(new ArrayBuffer(1)));
    encodeVideoMock.mockResolvedValue(undefined);

    await runExportJob({ project: projectWithVideo(), config, audio: null, assetBaseUrl: BASE }, post, () => false, 1);

    expect(encodeAudioMock).not.toHaveBeenCalled();
    expect(encodeVideoMock).toHaveBeenCalledTimes(1);
  });

  it('posta cancelled e não codifica quando cancelado logo no início', async () => {
    const { provider, dispose } = fakeProvider();
    createProviderMock.mockReturnValue(provider);

    await runExportJob({ project: projectWithVideo(), config, audio, assetBaseUrl: BASE }, post, () => true, 3);

    expect(posted.at(-1)).toEqual({ type: 'cancelled', jobId: 3 });
    expect(encodeVideoMock).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('posta cancelled quando o cancelamento chega durante a codificação', async () => {
    let cancelledFlag = false;
    const { provider } = fakeProvider();
    createProviderMock.mockReturnValue(provider);
    createMuxerMock.mockReturnValue(fakeMuxer(new ArrayBuffer(1)));
    encodeVideoMock.mockImplementation(async () => {
      cancelledFlag = true;
    });

    await runExportJob({ project: projectWithVideo(), config, audio: null, assetBaseUrl: BASE }, post, () => cancelledFlag, 4);

    expect(posted.at(-1)).toEqual({ type: 'cancelled', jobId: 4 });
    expect(posted.some((r) => r.type === 'done')).toBe(false);
  });

  it('mapeia erros para os códigos de exportação e sempre libera o provedor', async () => {
    const cases: Array<[unknown, string]> = [
      [new Error('unsupported-codec'), 'unsupported-codec'],
      [new Error('decode:asset-1'), 'decode'],
      [new Error('encode:bad frame'), 'encode'],
      [new RangeError('Array buffer allocation failed'), 'memory'],
      [new Error('algo inesperado'), 'generic'],
    ];
    for (const [error, code] of cases) {
      posted = [];
      const { provider, dispose } = fakeProvider();
      createProviderMock.mockReturnValue(provider);
      encodeVideoMock.mockRejectedValueOnce(error);
      createMuxerMock.mockReturnValue(fakeMuxer(new ArrayBuffer(1)));

      await runExportJob({ project: projectWithVideo(), config, audio: null, assetBaseUrl: BASE }, post, () => false, 9);

      expect(posted.at(-1)).toMatchObject({ type: 'error', jobId: 9, code });
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('posta empty quando não há camada visual nem áudio', async () => {
    await runExportJob({ project: emptyProject(), config, audio: null, assetBaseUrl: BASE }, post, () => false, 2);

    expect(posted).toEqual([expect.objectContaining({ type: 'error', code: 'empty' })]);
    expect(encodeVideoMock).not.toHaveBeenCalled();
  });

  it('posta no-webcodecs quando faltam os codificadores do formato', async () => {
    vi.unstubAllGlobals();

    await runExportJob({ project: projectWithVideo(), config, audio: null, assetBaseUrl: BASE }, post, () => false, 5);

    expect(posted).toEqual([expect.objectContaining({ type: 'error', code: 'no-webcodecs' })]);
  });

  it('exporta GIF pela rota de GIF, sem áudio', async () => {
    const gifBuffer = new ArrayBuffer(8);
    const { provider, dispose } = fakeProvider();
    createProviderMock.mockReturnValue(provider);
    exportGifMock.mockResolvedValue(gifBuffer);

    await runExportJob(
      { project: projectWithVideo(), config: { ...config, format: 'gif', mimeType: 'image/gif', fileName: 'a.gif' }, audio, assetBaseUrl: BASE },
      post,
      () => false,
      6,
    );

    expect(encodeAudioMock).not.toHaveBeenCalled();
    expect(posted.at(-1)).toEqual({ type: 'done', jobId: 6, data: gifBuffer, mimeType: 'image/gif', fileName: 'a.gif' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('carrega as fontes do projeto antes de criar o provedor de quadros', async () => {
    const { provider } = fakeProvider();
    createProviderMock.mockReturnValue(provider);
    createMuxerMock.mockReturnValue(fakeMuxer(new ArrayBuffer(1)));
    encodeVideoMock.mockResolvedValue(undefined);
    const project = projectWithVideo();

    await runExportJob({ project, config, audio: null, assetBaseUrl: BASE }, post, () => false, 10);

    expect(ensureFontsMock).toHaveBeenCalledWith(project, BASE);
    expect(ensureFontsMock.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      createProviderMock.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
