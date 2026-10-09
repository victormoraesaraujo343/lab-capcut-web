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
