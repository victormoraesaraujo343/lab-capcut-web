import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviewFrameProvider } from '../src/engine/decode/previewFrameProvider';
import { readFile } from '../src/engine/storage/opfs';
import type { Asset } from '../src/types/project';

const mocks = vi.hoisted(() => {
  const webcodecs = {
    open: vi.fn(),
    getFrame: vi.fn(),
    prefetch: vi.fn(),
    close: vi.fn(),
    dispose: vi.fn(),
  };
  const element = {
    getFrame: vi.fn(),
    playSync: vi.fn(),
    pauseAll: vi.fn(),
    close: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    webcodecs,
    element,
    supported: vi.fn(() => true),
    demux: vi.fn<(asset: Asset) => boolean>(() => true),
  };
});

vi.mock('../src/engine/decode/webcodecsSource', () => ({
  isWebCodecsSupported: mocks.supported,
  canDemux: mocks.demux,
  createWebCodecsSource: () => mocks.webcodecs,
}));

vi.mock('../src/engine/decode/videoElementSource', () => ({
  createVideoElementSource: () => mocks.element,
}));

vi.mock('../src/engine/storage/opfs', () => ({
  readFile: vi.fn(),
}));

/** Cria um asset de teste do tipo informado. */
function makeAsset(id: string, kind: Asset['kind'], mimeType: string): Asset {
  return {
    id,
    kind,
    name: id,
    mimeType,
    opfsPath: `media/${id}`,
    sizeBytes: 10,
    thumbnails: [],
    createdAt: 0,
  };
}

const png = makeAsset('png', 'image', 'image/png');
const mp4 = makeAsset('mp4', 'video', 'video/mp4');
const webm = makeAsset('webm', 'video', 'video/webm');

describe('createPreviewFrameProvider', () => {
  let bitmapClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.supported.mockReturnValue(true);
    mocks.demux.mockImplementation((asset: Asset) => asset.mimeType === 'video/mp4');
    mocks.webcodecs.open.mockReset().mockResolvedValue(true);
    mocks.webcodecs.getFrame.mockReset();
    mocks.element.getFrame.mockReset();
    mocks.element.playSync.mockReset();
    bitmapClose = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: bitmapClose }) as unknown as ImageBitmap));
    vi.mocked(readFile).mockResolvedValue(new File(['x'], 'a.png', { type: 'image/png' }));
  });

  it('roteia imagem para o cache de imagens sem abrir WebCodecs', async () => {
    const provider = createPreviewFrameProvider();
    const frame = await provider.getFrame(png, 0, { exact: true });
    expect(frame).not.toBeNull();
    expect(mocks.webcodecs.open).not.toHaveBeenCalled();
    expect(mocks.element.getFrame).not.toHaveBeenCalled();
  });

  it('roteia mp4 demuxável para WebCodecs', async () => {
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    mocks.webcodecs.getFrame.mockResolvedValue(frame);
    const provider = createPreviewFrameProvider();
    expect(await provider.getFrame(mp4, 1000, { exact: true })).toBe(frame);
    expect(mocks.webcodecs.getFrame).toHaveBeenCalledWith(mp4, 1000, true);
    expect(mocks.element.getFrame).not.toHaveBeenCalled();
  });

  it('roteia webm para o elemento de vídeo', async () => {
    const element = {} as HTMLVideoElement;
    mocks.element.getFrame.mockResolvedValue(element);
    const provider = createPreviewFrameProvider();
    expect(await provider.getFrame(webm, 500, { exact: false })).toBe(element);
    expect(mocks.element.getFrame).toHaveBeenCalledWith(webm, 500, false);
    expect(mocks.webcodecs.open).not.toHaveBeenCalled();
  });

  it('cai no elemento e fica em fallback quando open devolve false', async () => {
    const element = {} as HTMLVideoElement;
    mocks.webcodecs.open.mockResolvedValue(false);
    mocks.element.getFrame.mockResolvedValue(element);
    const provider = createPreviewFrameProvider();
    expect(await provider.getFrame(mp4, 0, { exact: true })).toBe(element);
    expect(await provider.getFrame(mp4, 100, { exact: true })).toBe(element);
    expect(mocks.webcodecs.open).toHaveBeenCalledTimes(1);
    expect(mocks.element.getFrame).toHaveBeenCalledTimes(2);
  });

  it('cai no elemento quando open lança erro', async () => {
    const element = {} as HTMLVideoElement;
    mocks.webcodecs.open.mockRejectedValue(new Error('boom'));
    mocks.element.getFrame.mockResolvedValue(element);
    const provider = createPreviewFrameProvider();
    expect(await provider.getFrame(mp4, 0, { exact: true })).toBe(element);
    expect(mocks.element.getFrame).toHaveBeenCalledTimes(1);
  });

  it('pede exact:false ao WebCodecs e usa playSync durante a reprodução', async () => {
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    mocks.webcodecs.getFrame.mockResolvedValue(frame);
    const element = {} as HTMLVideoElement;
    mocks.element.playSync.mockResolvedValue(element);
    const provider = createPreviewFrameProvider();
    provider.setPlaying(true);
    await provider.getFrame(mp4, 700, { exact: true });
    expect(mocks.webcodecs.getFrame).toHaveBeenCalledWith(mp4, 700, false);
    expect(await provider.getFrame(webm, 800, { exact: true, rate: 2 })).toBe(element);
    expect(mocks.element.playSync).toHaveBeenCalledWith(webm, 800, 2);
    expect(mocks.element.getFrame).not.toHaveBeenCalled();
  });

  it('usa a velocidade do pedido no playSync, com padrão 1 quando não informada', async () => {
    const element = {} as HTMLVideoElement;
    mocks.element.playSync.mockResolvedValue(element);
    const provider = createPreviewFrameProvider();
    provider.setPlaying(true);
    await provider.getFrame(webm, 100, { exact: false, rate: 0.5 });
    expect(mocks.element.playSync).toHaveBeenLastCalledWith(webm, 100, 0.5);
    await provider.getFrame(webm, 200, { exact: false });
    expect(mocks.element.playSync).toHaveBeenLastCalledWith(webm, 200, 1);
  });

  it('closeAsset fecha WebCodecs, elemento e bitmap do asset e esquece o fallback', async () => {
    mocks.webcodecs.open.mockResolvedValue(false);
    mocks.element.getFrame.mockResolvedValue({} as HTMLVideoElement);
    const provider = createPreviewFrameProvider();
    await provider.getFrame(png, 0, { exact: true });
    await provider.getFrame(mp4, 0, { exact: true });
    provider.closeAsset('png');
    provider.closeAsset('mp4');
    expect(bitmapClose).toHaveBeenCalledTimes(1);
    expect(mocks.webcodecs.close).toHaveBeenCalledWith('png');
    expect(mocks.webcodecs.close).toHaveBeenCalledWith('mp4');
    expect(mocks.element.close).toHaveBeenCalledWith('png');
    expect(mocks.element.close).toHaveBeenCalledWith('mp4');
    // Sem o fallback guardado, o mp4 volta a tentar WebCodecs.
    mocks.webcodecs.open.mockResolvedValue(true);
    mocks.webcodecs.getFrame.mockResolvedValue({ close: vi.fn() } as unknown as VideoFrame);
    await provider.getFrame(mp4, 0, { exact: true });
    expect(mocks.webcodecs.open).toHaveBeenCalledTimes(2);
  });

  it('pausa os elementos ao parar a reprodução', () => {
    const provider = createPreviewFrameProvider();
    provider.setPlaying(true);
    provider.setPlaying(false);
    expect(mocks.element.pauseAll).toHaveBeenCalledTimes(1);
  });

  it('fecha VideoFrame no releaseFrame', () => {
    const provider = createPreviewFrameProvider();
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    provider.releaseFrame(frame);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it('não fecha bitmap do cache no releaseFrame', async () => {
    const provider = createPreviewFrameProvider();
    const bitmap = await provider.getFrame(png, 0, { exact: true });
    provider.releaseFrame(bitmap as ImageBitmap);
    expect(bitmapClose).not.toHaveBeenCalled();
  });

  it('repassa prefetch ao WebCodecs quando o asset usa WebCodecs', async () => {
    const provider = createPreviewFrameProvider();
    provider.prefetch(mp4, 2000, 1);
    await vi.waitFor(() => expect(mocks.webcodecs.prefetch).toHaveBeenCalledWith(mp4, 2000, 1));
  });

  it('libera elementos, bitmaps e WebCodecs no dispose', async () => {
    const provider = createPreviewFrameProvider();
    await provider.getFrame(png, 0, { exact: true });
    await provider.getFrame(mp4, 0, { exact: true });
    provider.dispose();
    expect(mocks.element.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.webcodecs.dispose).toHaveBeenCalledTimes(1);
    expect(bitmapClose).toHaveBeenCalledTimes(1);
  });
});
