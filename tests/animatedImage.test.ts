import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animatedMimeOf, decodeAnimatedImage, frameIndexAt, probeAnimation } from '../src/engine/decode/animatedImage';

/** Instala um ImageDecoder falso; o quadro i dura durationsMs[i] e tem o tamanho dado. */
function stubImageDecoder(durationsMs: number[] | null, width = 16, height = 16, supported = true): void {
  const frameCount = durationsMs?.length ?? 1;
  class FakeImageDecoder {
    static isTypeSupported = vi.fn(async () => supported);
    readonly tracks: { ready: Promise<void>; selectedTrack: { animated: boolean; frameCount: number } };

    constructor() {
      this.tracks = {
        ready: Promise.resolve(),
        selectedTrack: { animated: durationsMs !== null && frameCount > 1, frameCount },
      };
    }

    async decode({ frameIndex }: { frameIndex: number }): Promise<{ image: unknown }> {
      const ms = durationsMs?.[frameIndex] ?? 100;
      return { image: { duration: ms * 1000, displayWidth: width, displayHeight: height, close: vi.fn() } };
    }

    close(): void {
      return;
    }
  }
  vi.stubGlobal('ImageDecoder', FakeImageDecoder);
}

describe('frameIndexAt', () => {
  const durations = [100, 200, 100];

  it('dá a volta pelo total do ciclo quando há loop', () => {
    expect(frameIndexAt(durations, 0)).toBe(0);
    expect(frameIndexAt(durations, 99)).toBe(0);
    expect(frameIndexAt(durations, 100)).toBe(1);
    expect(frameIndexAt(durations, 299)).toBe(1);
    expect(frameIndexAt(durations, 300)).toBe(2);
    expect(frameIndexAt(durations, 400)).toBe(0);
    expect(frameIndexAt(durations, 750)).toBe(2);
    expect(frameIndexAt(durations, -50)).toBe(2);
  });

  it('sem loop, fica no último quadro depois do ciclo', () => {
    expect(frameIndexAt(durations, 0, false)).toBe(0);
    expect(frameIndexAt(durations, 150, false)).toBe(1);
    expect(frameIndexAt(durations, 399, false)).toBe(2);
    expect(frameIndexAt(durations, 400, false)).toBe(2);
    expect(frameIndexAt(durations, 10000, false)).toBe(2);
    expect(frameIndexAt(durations, -10, false)).toBe(0);
  });

  it('trata durações desiguais com quadros curtos e longos', () => {
    const uneven = [20, 500, 30];
    expect(frameIndexAt(uneven, 19)).toBe(0);
    expect(frameIndexAt(uneven, 20)).toBe(1);
    expect(frameIndexAt(uneven, 519)).toBe(1);
    expect(frameIndexAt(uneven, 520)).toBe(2);
    expect(frameIndexAt(uneven, 550)).toBe(0);
  });

  it('devolve 0 sem quadros ou com tempo não finito', () => {
    expect(frameIndexAt([], 500)).toBe(0);
    expect(frameIndexAt(durations, Number.NaN)).toBe(0);
  });
});

describe('animatedMimeOf', () => {
  it('usa o MIME quando é animável e a extensão quando ele falta', () => {
    expect(animatedMimeOf('image/gif', 'a.gif')).toBe('image/gif');
    expect(animatedMimeOf('IMAGE/WEBP; charset=x', 'a.webp')).toBe('image/webp');
    expect(animatedMimeOf('', 'figurinha.GIF')).toBe('image/gif');
    expect(animatedMimeOf('image/jpeg', 'foto.jpg')).toBeNull();
  });
});

describe('decodeAnimatedImage e probeAnimation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ close: vi.fn() }) as unknown as ImageBitmap),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('devolve os quadros com durações em ms, com mínimo de 20 ms', async () => {
    stubImageDecoder([50, 10, 100]);
    const result = await decodeAnimatedImage(new Blob(['gif']), 'image/gif');
    expect(result).not.toBeNull();
    expect(result?.frames).toHaveLength(3);
    expect(result?.durationsMs).toEqual([50, 20, 100]);
    expect(result?.totalMs).toBe(170);
  });

  it('devolve null quando a imagem não é animada', async () => {
    stubImageDecoder(null);
    expect(await decodeAnimatedImage(new Blob(['png']), 'image/png')).toBeNull();
  });

  it('devolve null sem suporte ao tipo', async () => {
    stubImageDecoder([100, 100], 16, 16, false);
    expect(await decodeAnimatedImage(new Blob(['webp']), 'image/webp')).toBeNull();
  });

  it('devolve null sem ImageDecoder no ambiente', async () => {
    vi.stubGlobal('ImageDecoder', undefined);
    expect(await decodeAnimatedImage(new Blob(['gif']), 'image/gif')).toBeNull();
  });

  it('mede o ciclo sem criar bitmaps', async () => {
    stubImageDecoder([100, 250]);
    const timing = await probeAnimation(new Blob(['gif']), 'image/gif');
    expect(timing?.totalMs).toBe(350);
    expect(timing?.durationsMs).toEqual([100, 250]);
    expect(vi.mocked(createImageBitmap)).not.toHaveBeenCalled();
  });

  it('reduz os quadros para 1024 px no lado maior quando há mais de 300', async () => {
    stubImageDecoder(Array.from({ length: 301 }, () => 40), 2048, 1024);
    const result = await decodeAnimatedImage(new Blob(['gif']), 'image/gif');
    expect(result?.frames).toHaveLength(301);
    expect(vi.mocked(createImageBitmap)).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ resizeWidth: 1024, resizeHeight: 512 }),
    );
  });

  it('mantém o tamanho quando a animação é pequena', async () => {
    stubImageDecoder([40, 40], 300, 200);
    await decodeAnimatedImage(new Blob(['gif']), 'image/gif');
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledWith(expect.anything());
  });
});
