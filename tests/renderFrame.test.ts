import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchAround, renderFrame } from '../src/engine/render/renderFrame';
import { resolveLayers } from '../src/engine/render/composition';
import { defaultTransform, type Asset, type Project, type TextData } from '../src/types/project';
import type { CompositeOptions, Compositor, FrameImage, FrameProvider, Layer, TextRasterizer } from '../src/types/render';
import type { ShapeRasterizer } from '../src/engine/shapes/shapeRasterizer';

vi.mock('../src/engine/render/composition', () => ({
  resolveLayers: vi.fn(),
}));

const resolveLayersMock = vi.mocked(resolveLayers);

function makeAsset(id: string): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}.mp4`,
    sizeBytes: 1000,
    thumbnails: [],
    createdAt: 0,
  };
}

function makeLayer(clipId: string, assetId: string | undefined, zIndex: number): Layer {
  return {
    clipId,
    assetId,
    kind: 'video',
    mediaTimeMs: 1000,
    localTimeMs: 0,
    transform: defaultTransform(),
    sourceWidth: 1920,
    sourceHeight: 1080,
    filters: [],
    effects: [],
    zIndex,
    playbackRate: 1,
    fit: 'contain',
  };
}

function makeProject(assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Projeto',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 5000,
    tracks: [],
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

interface FakeCompositor extends Compositor {
  calls: Array<{ layers: Layer[]; keys: string[]; options: CompositeOptions }>;
}

function makeCompositor(throwOnDraw = false): FakeCompositor {
  const calls: FakeCompositor['calls'] = [];
  return {
    calls,
    canvas: document.createElement('canvas'),
    draw(layers, images, options) {
      calls.push({ layers: [...layers], keys: [...images.keys()], options });
      if (throwOnDraw) throw new Error('draw-failed');
    },
    dispose() {
      calls.length = 0;
    },
  };
}

interface FakeProvider extends FrameProvider {
  released: FrameImage[];
  prefetched: Array<{ assetId: string; mediaTimeMs: number; direction: 1 | -1 }>;
  requested: string[];
  closed: string[];
}

function makeProvider(frames: Map<string, FrameImage | null>, rejectAssetId?: string): FakeProvider {
  const released: FrameImage[] = [];
  const prefetched: FakeProvider['prefetched'] = [];
  const requested: string[] = [];
  const closed: string[] = [];
  return {
    released,
    prefetched,
    requested,
    closed,
    async getFrame(asset) {
      requested.push(asset.id);
      if (asset.id === rejectAssetId) throw new Error('decode-failed');
      return frames.get(asset.id) ?? null;
    },
    prefetch(asset, mediaTimeMs, direction) {
      prefetched.push({ assetId: asset.id, mediaTimeMs, direction });
    },
    releaseFrame(frame) {
      released.push(frame);
    },
    closeAsset(assetId) {
      closed.push(assetId);
    },
    dispose() {
      released.length = 0;
    },
  };
}

describe('renderFrame', () => {
  beforeEach(() => {
    resolveLayersMock.mockReset();
  });

  it('repassa a velocidade da camada ao getFrame', async () => {
    const layer = { ...makeLayer('c1', 'a1', 0), playbackRate: 2 };
    resolveLayersMock.mockReturnValue([layer]);
    const provider = makeProvider(new Map([['a1', document.createElement('canvas')]]));
    const spy = vi.spyOn(provider, 'getFrame');
    await renderFrame(makeCompositor(), makeProject([makeAsset('a1')]), 0, provider, { scale: 1, exact: false });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 1000, { exact: false, rate: 2 });
  });

  it('desenha na escala pedida e com fundo padrão', async () => {
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0)]);
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map([['a1', frame]]));
    const compositor = makeCompositor();

    await renderFrame(compositor, makeProject([makeAsset('a1')]), 0, provider, { scale: 0.5, exact: true });

    expect(compositor.calls).toHaveLength(1);
    expect(compositor.calls[0]?.options).toEqual({ width: 960, height: 540, background: '#000000', frameWidth: 1920, frameHeight: 1080 });
  });

  it('usa o fundo informado nas opções', async () => {
    resolveLayersMock.mockReturnValue([]);
    const compositor = makeCompositor();
    await renderFrame(compositor, makeProject([]), 0, makeProvider(new Map()), {
      scale: 1,
      exact: false,
      background: '#112233',
    });
    expect(compositor.calls[0]?.options.background).toBe('#112233');
  });

  it('mantém a ordem das layers desenhadas', async () => {
    const layers = [makeLayer('c1', 'a1', 0), makeLayer('c2', 'a2', 1), makeLayer('c3', 'a3', 2)];
    resolveLayersMock.mockReturnValue(layers);
    const frames = new Map<string, FrameImage | null>([
      ['a1', document.createElement('canvas')],
      ['a2', document.createElement('canvas')],
      ['a3', document.createElement('canvas')],
    ]);
    const compositor = makeCompositor();

    const drawn = await renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('a2'), makeAsset('a3')]), 0, makeProvider(frames), {
      scale: 1,
      exact: true,
    });

    expect(compositor.calls[0]?.layers.map((l) => l.clipId)).toEqual(['c1', 'c2', 'c3']);
    expect(drawn.map((l) => l.clipId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('libera todos os quadros obtidos, mesmo quando draw lança', async () => {
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0), makeLayer('c2', 'a2', 1)]);
    const f1 = document.createElement('canvas');
    const f2 = document.createElement('canvas');
    const provider = makeProvider(
      new Map<string, FrameImage | null>([
        ['a1', f1],
        ['a2', f2],
      ]),
    );
    const compositor = makeCompositor(true);

    await expect(
      renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('a2')]), 0, provider, { scale: 1, exact: true }),
    ).rejects.toThrow('draw-failed');
    expect(provider.released).toEqual([f1, f2]);
  });

  it('pula layers sem asset e layers cujo quadro é null', async () => {
    resolveLayersMock.mockReturnValue([
      makeLayer('texto', undefined, 0),
      makeLayer('vazio', 'a2', 1),
      makeLayer('ok', 'a1', 2),
    ]);
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map<string, FrameImage | null>([['a1', frame], ['a2', null]]));
    const compositor = makeCompositor();

    const drawn = await renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('a2')]), 0, provider, {
      scale: 1,
      exact: true,
    });

    expect(provider.requested.sort()).toEqual(['a1', 'a2']);
    expect(compositor.calls[0]?.layers.map((l) => l.clipId)).toEqual(['ok']);
    expect(compositor.calls[0]?.keys).toEqual(['ok']);
    expect(drawn.map((l) => l.clipId)).toEqual(['ok']);
    expect(provider.released).toEqual([frame]);
  });

  it('libera os quadros que já chegaram quando um pedido falha', async () => {
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0), makeLayer('c2', 'a2', 1)]);
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map<string, FrameImage | null>([['a1', frame]]), 'a2');
    const compositor = makeCompositor();

    await expect(
      renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('a2')]), 0, provider, { scale: 1, exact: true }),
    ).rejects.toThrow('decode-failed');
    expect(provider.released).toEqual([frame]);
    expect(compositor.calls).toHaveLength(0);
  });

  it('pede prefetch com a direção certa para layers com asset', () => {
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0), makeLayer('texto', undefined, 1)]);
    const provider = makeProvider(new Map());

    prefetchAround(makeProject([makeAsset('a1')]), 0, provider, -1);

    expect(provider.prefetched).toEqual([{ assetId: 'a1', mediaTimeMs: 1000, direction: -1 }]);
  });
  it('rasteriza a camada de texto, usa o tamanho da imagem e não a libera no provider', async () => {
    const data = { content: 'oi' } as unknown as TextData;
    const textLayer: Layer = {
      ...makeLayer('t1', undefined, 0),
      kind: 'text',
      fit: 'none',
      sourceWidth: 0,
      sourceHeight: 0,
      text: { data, reveal: 0.5 },
    };
    resolveLayersMock.mockReturnValue([textLayer]);
    const image = document.createElement('canvas');
    image.width = 320;
    image.height = 80;
    const rasterizer: TextRasterizer = {
      rasterize: vi.fn(() => image),
      measure: vi.fn(() => ({ width: 320, height: 80 })),
      dispose: vi.fn(),
    };
    const provider = makeProvider(new Map());
    const compositor = makeCompositor();

    const drawn = await renderFrame(compositor, makeProject([]), 0, provider, { scale: 1, exact: true }, rasterizer);

    expect(rasterizer.rasterize).toHaveBeenCalledWith(data, 0.5);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ clipId: 't1', sourceWidth: 320, sourceHeight: 80 });
    expect(compositor.calls[0]?.keys).toEqual(['t1']);
    expect(provider.released).toEqual([]);
  });

  it('desenha o texto na ordem de zIndex junto com os quadros de vídeo', async () => {
    const data = { content: 'oi' } as unknown as TextData;
    const text: Layer = { ...makeLayer('t1', undefined, 1), kind: 'text', fit: 'none', text: { data, reveal: 1 } };
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0), text]);
    const image = document.createElement('canvas');
    const rasterizer: TextRasterizer = { rasterize: () => image, measure: () => ({ width: 1, height: 1 }), dispose: () => undefined };
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map<string, FrameImage | null>([['a1', frame]]));
    const compositor = makeCompositor();

    await renderFrame(compositor, makeProject([makeAsset('a1')]), 0, provider, { scale: 1, exact: true }, rasterizer);

    expect(compositor.calls[0]?.layers.map((layer) => layer.clipId)).toEqual(['c1', 't1']);
    expect(provider.released).toEqual([frame]);
  });

  it('busca a imagem da camada que entra numa transição e a entrega junto da que sai', async () => {
    const incoming = { ...makeLayer('c2', 'a2', 0), mediaTimeMs: 2000 };
    const outgoing: Layer = {
      ...makeLayer('c1', 'a1', 0),
      transition: { type: 'fade', params: {}, progress: 0.25, incoming },
    };
    resolveLayersMock.mockReturnValue([outgoing]);
    const f1 = document.createElement('canvas');
    const f2 = document.createElement('canvas');
    const provider = makeProvider(
      new Map<string, FrameImage | null>([
        ['a1', f1],
        ['a2', f2],
      ]),
    );
    const compositor = makeCompositor();

    const drawn = await renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('a2')]), 0, provider, {
      scale: 1,
      exact: true,
    });

    expect(provider.requested.sort()).toEqual(['a1', 'a2']);
    expect(compositor.calls[0]?.keys.sort()).toEqual(['c1', 'c2']);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.transition?.incoming.clipId).toBe('c2');
    expect(provider.released).toEqual([f1, f2]);
  });

  it('rasteriza o texto que entra numa transição e atualiza o tamanho dele', async () => {
    const data = { content: 'oi' } as unknown as TextData;
    const incoming: Layer = { ...makeLayer('t2', undefined, 0), kind: 'text', fit: 'none', text: { data, reveal: 1 } };
    const outgoing: Layer = { ...makeLayer('c1', 'a1', 0), transition: { type: 'wipe', params: {}, progress: 0.5, incoming } };
    resolveLayersMock.mockReturnValue([outgoing]);
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map<string, FrameImage | null>([['a1', frame]]));
    const compositor = makeCompositor();
    const image = document.createElement('canvas');
    image.width = 200;
    image.height = 50;
    const rasterizer: TextRasterizer = {
      rasterize: vi.fn(() => image),
      measure: vi.fn(() => ({ width: 200, height: 50 })),
      dispose: vi.fn(),
    };

    const drawn = await renderFrame(compositor, makeProject([makeAsset('a1')]), 0, provider, { scale: 1, exact: true }, rasterizer);

    expect(rasterizer.rasterize).toHaveBeenCalledWith(data, 1);
    expect(drawn[0]?.transition?.incoming).toMatchObject({ clipId: 't2', sourceWidth: 200, sourceHeight: 50 });
    expect(compositor.calls[0]?.keys.sort()).toEqual(['c1', 't2']);
  });

  it('busca a máscara da camada, passa como `${clipId}:matte` e a libera depois', async () => {
    const withMatte: Layer = { ...makeLayer('c1', 'a1', 0), matte: { assetId: 'm1', mediaTimeMs: 500 } };
    resolveLayersMock.mockReturnValue([withMatte]);
    const frame = document.createElement('canvas');
    const matte = document.createElement('canvas');
    const provider = makeProvider(
      new Map<string, FrameImage | null>([
        ['a1', frame],
        ['m1', matte],
      ]),
    );
    const spy = vi.spyOn(provider, 'getFrame');
    const compositor = makeCompositor();

    await renderFrame(compositor, makeProject([makeAsset('a1'), makeAsset('m1')]), 0, provider, { scale: 1, exact: true });

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 500, { exact: true, rate: 1 });
    expect(compositor.calls[0]?.keys.sort()).toEqual(['c1', 'c1:matte']);
    expect(provider.released).toEqual([frame, matte]);
  });
});

describe('renderFrame com formas', () => {
  beforeEach(() => {
    resolveLayersMock.mockReset();
  });

  it('rasteriza a camada de forma, usa o tamanho da imagem e não a libera no provider', async () => {
    const shape = { shape: 'circle', width: 400, height: 400, cornerRadius: 0, fill: '#f43f5e', stroke: '#ffffff', strokeWidth: 0 } as const;
    const shapeLayer: Layer = { ...makeLayer('s1', undefined, 0), kind: 'shape', fit: 'none', shape: { ...shape } };
    resolveLayersMock.mockReturnValue([shapeLayer]);
    const image = document.createElement('canvas');
    image.width = 400;
    image.height = 400;
    const shapeRasterizer: ShapeRasterizer = {
      rasterize: vi.fn(() => image),
      measure: vi.fn(() => ({ width: 400, height: 400 })),
      dispose: vi.fn(),
    };
    const provider = makeProvider(new Map());
    const compositor = makeCompositor();

    const drawn = await renderFrame(
      compositor,
      makeProject([]),
      0,
      provider,
      { scale: 1, exact: true },
      undefined,
      shapeRasterizer,
    );

    expect(shapeRasterizer.rasterize).toHaveBeenCalledWith(expect.objectContaining({ shape: 'circle', width: 400 }));
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ clipId: 's1', sourceWidth: 400, sourceHeight: 400 });
    expect(compositor.calls[0]?.keys).toEqual(['s1']);
    expect(provider.released).toEqual([]);
    expect(provider.requested).toEqual([]);
  });

  it('desenha a forma na ordem de zIndex junto com os quadros de vídeo', async () => {
    const shapeLayer: Layer = {
      ...makeLayer('s1', undefined, 1),
      kind: 'shape',
      fit: 'none',
      shape: { shape: 'rectangle', width: 100, height: 50, cornerRadius: 0, fill: '#fff', stroke: '#000', strokeWidth: 0 },
    };
    resolveLayersMock.mockReturnValue([makeLayer('c1', 'a1', 0), shapeLayer]);
    const frame = document.createElement('canvas');
    const provider = makeProvider(new Map<string, FrameImage | null>([['a1', frame]]));
    const compositor = makeCompositor();
    const shapeRasterizer: ShapeRasterizer = {
      rasterize: () => document.createElement('canvas'),
      measure: () => ({ width: 1, height: 1 }),
      dispose: () => undefined,
    };

    const drawn = await renderFrame(compositor, makeProject([makeAsset('a1')]), 0, provider, { scale: 1, exact: true }, undefined, shapeRasterizer);

    expect(drawn.map((layer) => layer.clipId)).toEqual(['c1', 's1']);
    expect(compositor.calls[0]?.keys).toEqual(['c1', 's1']);
  });
});

