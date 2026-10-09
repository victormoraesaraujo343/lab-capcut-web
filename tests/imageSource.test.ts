import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageSource } from '../src/engine/decode/imageSource';
import { readFile } from '../src/engine/storage/opfs';
import type { Asset } from '../src/types/project';

vi.mock('../src/engine/storage/opfs', () => ({
  readFile: vi.fn(),
}));

/** Cria um asset de imagem de teste. */
function makeAsset(id: string): Asset {
  return {
    id,
    kind: 'image',
    name: `${id}.png`,
    mimeType: 'image/png',
    opfsPath: `media/${id}.png`,
    sizeBytes: 10,
    thumbnails: [],
    createdAt: 0,
  };
}

describe('createImageSource', () => {
  let bitmapClose: ReturnType<typeof vi.fn>;
  let decodeBitmap: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bitmapClose = vi.fn();
    decodeBitmap = vi.fn(async () => ({ close: bitmapClose }) as unknown as ImageBitmap);
    vi.stubGlobal('createImageBitmap', decodeBitmap);
    vi.mocked(readFile).mockImplementation(async () => new File(['x'], 'a.png', { type: 'image/png' }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('decodifica uma vez e reaproveita o bitmap do cache', async () => {
    const source = createImageSource();
    const asset = makeAsset('a');
    const first = await source.getImage(asset);
    const second = await source.getImage(asset);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(decodeBitmap).toHaveBeenCalledTimes(1);
  });

  it('compartilha a mesma promise entre pedidos simultâneos', async () => {
    const source = createImageSource();
    const asset = makeAsset('b');
    const [first, second] = await Promise.all([source.getImage(asset), source.getImage(asset)]);
    expect(second).toBe(first);
    expect(decodeBitmap).toHaveBeenCalledTimes(1);
  });

  it('marca o bitmap do cache como dono', async () => {
    const source = createImageSource();
    const bitmap = await source.getImage(makeAsset('c'));
    expect(bitmap).not.toBeNull();
    expect(source.owns(bitmap as ImageBitmap)).toBe(true);
    expect(source.owns({})).toBe(false);
  });

  it('devolve null quando o arquivo não pode ser lido e tenta de novo depois', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('missing'));
    const source = createImageSource();
    const asset = makeAsset('d');
    expect(await source.getImage(asset)).toBeNull();
    expect(await source.getImage(asset)).not.toBeNull();
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('close fecha só o bitmap do asset e decodifica de novo depois', async () => {
    const source = createImageSource();
    const asset = makeAsset('h');
    const first = await source.getImage(asset);
    await source.getImage(makeAsset('i'));
    source.close('h');
    expect(bitmapClose).toHaveBeenCalledTimes(1);
    expect(source.owns(first as ImageBitmap)).toBe(false);
    const again = await source.getImage(asset);
    expect(again).not.toBeNull();
    expect(again).not.toBe(first);
    expect(decodeBitmap).toHaveBeenCalledTimes(3);
  });

  it('fecha todos os bitmaps no dispose e recusa pedidos depois', async () => {
    const source = createImageSource();
    await source.getImage(makeAsset('e'));
    await source.getImage(makeAsset('f'));
    source.dispose();
    expect(bitmapClose).toHaveBeenCalledTimes(2);
    expect(await source.getImage(makeAsset('g'))).toBeNull();
  });
});

/** Dimensões e durações usadas pelo decodificador falso de animação. */
interface FakeAnimationOptions {
  /** Duração de cada quadro em ms; null = imagem parada (um quadro só). */
  durationsMs: number[] | null;
  width?: number;
  height?: number;
}

/** Instala um ImageDecoder falso no escopo global; o quadro i dura durationsMs[i]. */
function stubImageDecoder(options: FakeAnimationOptions): void {
  const { durationsMs, width = 16, height = 16 } = options;
  const frameCount = durationsMs?.length ?? 1;
  class FakeImageDecoder {
    static isTypeSupported = vi.fn(async () => true);
    readonly tracks: { ready: Promise<void>; selectedTrack: { animated: boolean; frameCount: number } };

    constructor() {
      this.tracks = {
        ready: Promise.resolve(),
        selectedTrack: { animated: durationsMs !== null && frameCount > 1, frameCount },
      };
    }

    async decode({ frameIndex }: { frameIndex: number }): Promise<{ image: unknown }> {
      const ms = durationsMs?.[frameIndex] ?? 100;
      return {
        image: { duration: ms * 1000, displayWidth: width, displayHeight: height, close: vi.fn() },
      };
    }

    close(): void {
      return;
    }
  }
  vi.stubGlobal('ImageDecoder', FakeImageDecoder);
}

/** Cria um asset GIF animado de teste. */
function makeGifAsset(id: string): Asset {
  return { ...makeAsset(id), name: `${id}.gif`, mimeType: 'image/gif', opfsPath: `media/${id}.gif` };
}

describe('createImageSource com imagens animadas', () => {
  let bitmapClose: ReturnType<typeof vi.fn>;
  let decodeBitmap: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bitmapClose = vi.fn();
    decodeBitmap = vi.fn(async () => ({ close: bitmapClose }) as unknown as ImageBitmap);
    vi.stubGlobal('createImageBitmap', decodeBitmap);
    vi.mocked(readFile).mockImplementation(async () => new File(['x'], 'a.gif', { type: 'image/gif' }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('devolve o quadro do instante pedido e dá a volta no ciclo', async () => {
    stubImageDecoder({ durationsMs: [100, 200, 100] });
    const source = createImageSource();
    const asset = makeGifAsset('anim1');
    const first = await source.getImage(asset, 0);
    const middle = await source.getImage(asset, 150);
    const last = await source.getImage(asset, 350);
    expect(first).not.toBeNull();
    expect(middle).not.toBe(first);
    expect(last).not.toBe(middle);
    expect(await source.getImage(asset, 400)).toBe(first);
    expect(await source.getImage(asset, 550)).toBe(middle);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(source.owns(middle as ImageBitmap)).toBe(true);
  });

  it('não fecha os quadros no pedido, só no close do asset', async () => {
    stubImageDecoder({ durationsMs: [100, 100] });
    const source = createImageSource();
    const asset = makeGifAsset('anim2');
    await source.getImage(asset, 0);
    await source.getImage(asset, 100);
    expect(bitmapClose).not.toHaveBeenCalled();
    source.close('anim2');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bitmapClose).toHaveBeenCalledTimes(2);
  });

  it('imagem não animada segue pelo caminho antigo (um bitmap só)', async () => {
    stubImageDecoder({ durationsMs: null });
    const source = createImageSource();
    const asset = makeGifAsset('still1');
    const bitmap = await source.getImage(asset, 500);
    expect(bitmap).not.toBeNull();
    expect(await source.getImage(asset, 900)).toBe(bitmap);
    expect(decodeBitmap).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('sem ImageDecoder, imagem PNG usa o caminho antigo', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    const source = createImageSource();
    const bitmap = await source.getImage(makeAsset('png1'), 300);
    expect(bitmap).not.toBeNull();
    expect(decodeBitmap).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
