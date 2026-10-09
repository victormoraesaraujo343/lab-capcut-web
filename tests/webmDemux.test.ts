import { describe, expect, it } from 'vitest';
import { openWebm } from '../src/engine/decode/webmDemux';
import fixtureDataUrl from './fixtures/media/video-c.webm?inline';

/** Bytes do arquivo de teste VP9, decodificados da data URL que o Vite embute. */
function fixtureBytes(): Uint8Array<ArrayBuffer> {
  const base64 = fixtureDataUrl.slice(fixtureDataUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Tamanho de 8 bytes (VINT longo) para um número. */
function size8(value: number): number[] {
  const bytes = [0x01];
  for (let shift = 48; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(value / 2 ** shift) & 0xff);
  }
  return bytes;
}

/** Tamanho desconhecido (todos os bits de valor em 1). */
const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

/** Elemento EBML com ID, tamanho de 8 bytes e conteúdo. */
function element(id: number[], payload: number[]): number[] {
  return [...id, ...size8(payload.length), ...payload];
}

/** Float de 8 bytes big-endian. */
function float64(value: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return [...new Uint8Array(view.buffer)];
}

/** Bloco simples (ou bloco de grupo) com trilha de 1 byte, tempo relativo, flags e dados de 3 bytes. */
function block(track: number, relative: number, flags: number, marker: number): number[] {
  const high = (relative >> 8) & 0xff;
  const low = relative & 0xff;
  return [0x80 | track, high, low, flags, marker, marker, marker];
}

/** Trilha de vídeo e de áudio, para testar que o áudio é ignorado. */
function tracks(): number[] {
  const video = element([0xae], [
    ...element([0xd7], [1]),
    ...element([0x83], [1]),
    ...element([0x86], [...new TextEncoder().encode('V_VP8')]),
    ...element([0xe0], [...element([0xb0], [0x01, 0x40]), ...element([0xba], [0x00, 0xf0])]),
  ]);
  const audio = element([0xae], [...element([0xd7], [2]), ...element([0x83], [2])]);
  return element([0x16, 0x54, 0xae, 0x6b], [...video, ...audio]);
}

/** WebM sintético: cluster de tamanho desconhecido, cluster com BlockGroup e um bloco de áudio. */
function buildWebm(firstFlags = 0x80): File {
  const header = element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x82], [...new TextEncoder().encode('webm')]));
  const info = element([0x15, 0x49, 0xa9, 0x66], [
    ...element([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]),
    ...element([0x44, 0x89], float64(200)),
  ]);
  const clusterOne = [
    0x1f, 0x43, 0xb6, 0x75,
    ...UNKNOWN_SIZE,
    ...element([0xe7], [0]),
    ...element([0xec], [0, 0, 0]),
    ...element([0xa3], block(1, 0, firstFlags, 0x11)),
    ...element([0xa3], block(2, 0, 0x80, 0x22)),
    ...element([0xa3], block(1, 33, 0x00, 0x33)),
  ];
  const clusterTwo = element([0x1f, 0x43, 0xb6, 0x75], [
    ...element([0xe7], [0x00, 0x64]),
    ...element([0xa0], [...element([0xa1], block(1, 0, 0x00, 0x44)), ...element([0x9b], [0x21])]),
    ...element([0xa0], [...element([0xa1], block(1, 33, 0x00, 0x55)), ...element([0xfb], [0xff])]),
  ]);
  const segmentBody = [...info, ...tracks(), ...clusterOne, ...clusterTwo];
  const bytes = [...header, 0x18, 0x53, 0x80, 0x67, ...UNKNOWN_SIZE, ...segmentBody];
  return new File([new Uint8Array(bytes)], 'v.webm', { type: 'video/webm' });
}

describe('openWebm com o arquivo de teste', () => {
  it('lê a trilha VP9 720x1280 com 150 quadros em ordem', async () => {
    const buffer = fixtureBytes();
    const file = new File([buffer], 'v.webm', { type: 'video/webm' });
    const info = await openWebm(file);

    expect(info.codec).toBe('vp09.01.10.08');
    expect(info.codedWidth).toBe(720);
    expect(info.codedHeight).toBe(1280);
    expect(info.description).toBeUndefined();
    expect(info.samples).toHaveLength(150);
    expect(info.samples[0]?.isSync).toBe(true);
    expect(info.samples[0]?.ctsUs).toBe(0);
    expect(info.samples[149]?.ctsUs).toBe(4_967_000);
    expect(Math.abs(info.durationUs - 5_000_000)).toBeLessThanOrEqual(200_000);

    for (let index = 1; index < info.samples.length; index++) {
      expect(info.samples[index]?.ctsUs ?? 0).toBeGreaterThan(info.samples[index - 1]?.ctsUs ?? 0);
    }
    for (const sample of info.samples) {
      expect(sample.offset + sample.size).toBeLessThanOrEqual(file.size);
    }
  });

  it('bate com o ffprobe nos primeiros quadros, tamanhos, keyframes e tempos', async () => {
    const buffer = fixtureBytes();
    const info = await openWebm(new File([buffer], 'v.webm', { type: 'video/webm' }));
    const sizes = info.samples.slice(0, 5).map((sample) => sample.size);
    expect(sizes).toEqual([145693, 3839, 5032, 3294, 1486]);
    const syncIndexes = info.samples.flatMap((sample) => (sample.isSync ? [sample.index] : []));
    expect(syncIndexes).toEqual([0, 128]);
    const times = info.samples.slice(0, 5).map((sample) => sample.ctsUs);
    expect(times).toEqual([0, 33_000, 67_000, 100_000, 133_000]);
  });
});

describe('openWebm com arquivos sintéticos', () => {
  it('monta os quadros de vídeo, ignora o áudio e respeita BlockGroup e ReferenceBlock', async () => {
    const file = buildWebm();
    const info = await openWebm(file);

    expect(info.codec).toBe('vp8');
    expect(info.codedWidth).toBe(320);
    expect(info.codedHeight).toBe(240);
    expect(info.timescale).toBe(1000);
    expect(info.durationUs).toBe(200_000);
    expect(info.samples.map((sample) => sample.ctsUs)).toEqual([0, 33_000, 100_000, 133_000]);
    expect(info.samples.map((sample) => sample.isSync)).toEqual([true, false, true, false]);
    expect(info.samples.map((sample) => sample.durationUs)).toEqual([33_000, 67_000, 33_000, 44_333]);
    expect(info.samples.map((sample) => sample.index)).toEqual([0, 1, 2, 3]);
  });

  it('aponta os dados de cada quadro para os bytes corretos do arquivo', async () => {
    const file = buildWebm();
    const info = await openWebm(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const markers = info.samples.map((sample) => bytes[sample.offset]);
    expect(markers).toEqual([0x11, 0x33, 0x44, 0x55]);
    for (const sample of info.samples) {
      expect(sample.size).toBe(3);
    }
  });

  it('recusa bloco com lacing na trilha de vídeo', async () => {
    await expect(openWebm(buildWebm(0x82))).rejects.toThrow(/lacing/);
  });

  it('recusa arquivo que não é WebM', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'x.webm', { type: 'video/webm' });
    await expect(openWebm(file)).rejects.toThrow();
  });
});
