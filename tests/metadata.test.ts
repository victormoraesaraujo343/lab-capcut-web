import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMediaMetadata, snapFps } from '../src/engine/decode/metadata';

const createObjectURL = vi.fn((): string => 'blob:mock');
const revokeObjectURL = vi.fn();

/** Substitui os elementos de mídia de teste por instâncias sem reprodução real. */
function stubElement<T extends HTMLMediaElement>(element: T): T {
  element.pause = vi.fn();
  element.load = vi.fn();
  return element;
}

/**
 * Simula o currentTime de uma gravação do MediaRecorder: a posição longa faz a duração virar `durationAfterSeek`
 * (ou nada muda, se null). Devolve as posições atribuídas, na ordem.
 */
function stubSeek(element: HTMLMediaElement, durationAfterSeek: number | null): { seeks: number[] } {
  const seeks: number[] = [];
  let time = 0;
  Object.defineProperty(element, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      seeks.push(value);
      time = value;
      if (value > 1000 && durationAfterSeek !== null) {
        setTimeout(() => {
          Object.defineProperty(element, 'duration', { configurable: true, value: durationAfterSeek });
          element.dispatchEvent(new Event('durationchange'));
        }, 0);
      }
    },
  });
  return { seeks };
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe('snapFps', () => {
  it.each([
    [23.97, 23.976],
    [24.1, 24],
    [25, 25],
    [29.9, 29.97],
    [30.2, 30],
    [49.8, 50],
    [59.9, 59.94],
    [61, 60],
  ])('arredonda %s para %s', (measured, expected) => {
    expect(snapFps(measured)).toBe(expected);
  });

  it('usa 30 quando a medida é inválida', () => {
    expect(snapFps(0)).toBe(30);
    expect(snapFps(-5)).toBe(30);
    expect(snapFps(Number.NaN)).toBe(30);
  });
});

describe('readMediaMetadata para imagem', () => {
  it('lê largura e altura e fecha o bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close }) as unknown as ImageBitmap),
    );
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    const metadata = await readMediaMetadata(file, 'image');

    expect(metadata).toEqual({ width: 800, height: 600 });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejeita com decode quando o bitmap não pode ser criado', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    await expect(readMediaMetadata(file, 'image')).rejects.toMatchObject({ code: 'decode' });
  });
});

describe('readMediaMetadata para vídeo', () => {
  it('lê duração, dimensões e usa 30 fps sem requestVideoFrameCallback', async () => {
    const video = stubElement(document.createElement('video'));
    Object.defineProperty(video, 'duration', { value: 2.5 });
    Object.defineProperty(video, 'videoWidth', { value: 1920 });
    Object.defineProperty(video, 'videoHeight', { value: 1080 });
    vi.spyOn(document, 'createElement').mockReturnValueOnce(video);
    setTimeout(() => video.dispatchEvent(new Event('loadedmetadata')), 0);
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

    const metadata = await readMediaMetadata(file, 'video');

    expect(metadata).toEqual({ durationMs: 2500, width: 1920, height: 1080, fps: 30 });
    expect(video.pause).toHaveBeenCalled();
    expect(video.hasAttribute('src')).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('rejeita com decode quando a duração continua Infinity depois do seek', async () => {
    vi.useFakeTimers();
    const video = stubElement(document.createElement('video'));
    Object.defineProperty(video, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
    const { seeks } = stubSeek(video, null);
    vi.spyOn(document, 'createElement').mockReturnValueOnce(video);
    setTimeout(() => video.dispatchEvent(new Event('loadedmetadata')), 0);
    const file = new File(['x'], 'clip.webm', { type: 'video/webm' });

    const pending = readMediaMetadata(file, 'video');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'decode' });
    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
    expect(seeks).toEqual([1e101, 0]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('rejeita com timeout quando o vídeo nunca carrega e libera recursos', async () => {
    vi.useFakeTimers();
    const video = stubElement(document.createElement('video'));
    vi.spyOn(document, 'createElement').mockReturnValueOnce(video);
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

    const pending = readMediaMetadata(file, 'video', 1000);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(video.pause).toHaveBeenCalled();
    expect(video.hasAttribute('src')).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('readMediaMetadata com duração desconhecida (gravações)', () => {
  it('pula para o fim, espera a duração real e volta ao início', async () => {
    const video = stubElement(document.createElement('video'));
    Object.defineProperty(video, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    const { seeks } = stubSeek(video, 4.2);
    vi.spyOn(document, 'createElement').mockReturnValueOnce(video);
    setTimeout(() => video.dispatchEvent(new Event('loadedmetadata')), 0);
    const file = new File(['x'], 'gravacao.webm', { type: 'video/webm' });

    const metadata = await readMediaMetadata(file, 'video');

    expect(metadata).toEqual({ durationMs: 4200, width: 640, height: 480, fps: 30 });
    expect(seeks).toEqual([1e101, 0]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('resolve também a duração NaN de um áudio gravado', async () => {
    const audio = stubElement(document.createElement('audio'));
    Object.defineProperty(audio, 'duration', { value: Number.NaN, configurable: true });
    const { seeks } = stubSeek(audio, 12.345);
    vi.spyOn(document, 'createElement').mockReturnValueOnce(audio);
    setTimeout(() => audio.dispatchEvent(new Event('loadedmetadata')), 0);
    const file = new File(['x'], 'narracao.ogg', { type: 'audio/ogg' });

    const metadata = await readMediaMetadata(file, 'audio');

    expect(metadata).toEqual({ durationMs: 12345 });
    expect(seeks).toEqual([1e101, 0]);
  });
});
