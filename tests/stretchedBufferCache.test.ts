import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStretchedSegments,
  getStretchedSegment,
  peekStretchedSegment,
  setStretchCacheLimit,
} from '../src/engine/audio/stretchedBufferCache';
import { stretchChannels } from '../src/engine/audio/stretchClient';
import type { Asset } from '../src/types/project';

// Worker substituído pelo WSOLA na própria thread; a contagem de chamadas mostra quantas vezes o trabalho pesado roda.
vi.mock('../src/engine/audio/stretchClient', async () => {
  const { wsolaStretch } = await import('../src/engine/audio/timeStretch');
  return {
    stretchChannels: vi.fn(async (channels: Float32Array<ArrayBuffer>[], sampleRate: number, rate: number) =>
      channels.map((channel) => wsolaStretch(channel, sampleRate, rate)),
    ),
  };
});

/** Buffer de áudio falso de 1 kHz com amostras 0, 1, 2... (fácil de conferir o corte). */
function rampBuffer(samples: number, channels = 1): AudioBuffer {
  const data = Array.from({ length: channels }, () => Float32Array.from({ length: samples }, (_, i) => i));
  return {
    numberOfChannels: channels,
    sampleRate: 1000,
    length: samples,
    duration: samples / 1000,
    getChannelData: (channel: number) => data[channel] ?? new Float32Array(0),
  } as unknown as AudioBuffer;
}

function makeAsset(id: string): Asset {
  return {
    id,
    kind: 'audio',
    name: `${id}.wav`,
    mimeType: 'audio/wav',
    opfsPath: `media/${id}`,
    sizeBytes: 1000,
    thumbnails: [],
    createdAt: 0,
  };
}

afterEach(() => {
  clearStretchedSegments();
  vi.mocked(stretchChannels).mockClear();
});

describe('stretchedBufferCache', () => {
  it('guarda o trecho sem depender de contexto: o segundo pedido não volta ao worker', async () => {
    const asset = makeAsset('a1');
    const buffer = rampBuffer(2000);
    const first = await getStretchedSegment(asset, buffer, 100, 400, 2);
    const second = await getStretchedSegment(asset, buffer, 100, 400, 2);
    expect(second).toBe(first);
    expect(vi.mocked(stretchChannels)).toHaveBeenCalledTimes(1);
    expect(peekStretchedSegment(asset, 100, 400, 2)).toBe(first);
    expect(first.sampleRate).toBe(1000);
  });

  it('arredonda a taxa a 0,01 para a chave, mas separa trechos de início ou duração diferentes', async () => {
    const asset = makeAsset('a2');
    const buffer = rampBuffer(2000);
    const first = await getStretchedSegment(asset, buffer, 0, 400, 2.001);
    const sameKey = await getStretchedSegment(asset, buffer, 0, 400, 2.004);
    expect(sameKey).toBe(first);
    expect(vi.mocked(stretchChannels)).toHaveBeenCalledTimes(1);

    await getStretchedSegment(asset, buffer, 50, 400, 2);
    await getStretchedSegment(asset, buffer, 0, 300, 2);
    expect(vi.mocked(stretchChannels)).toHaveBeenCalledTimes(3);
  });

  it('corta só o trecho pedido, com 50 ms de folga para o worker, e devolve exatamente o intervalo', async () => {
    const asset = makeAsset('a3');
    const buffer = rampBuffer(2000);
    const segment = await getStretchedSegment(asset, buffer, 100, 200, 1);
    // O worker recebeu [50, 350) ms: 200 amostras de trecho mais 50 de folga em cada lado.
    const sent = vi.mocked(stretchChannels).mock.calls[0]?.[0][0];
    expect(sent?.length).toBe(300);
    expect(sent?.[0]).toBe(50);
    // Sem esticar (taxa 1), o resultado é exatamente [100, 300) do buffer original.
    const [channel] = segment.channels;
    expect(channel?.length).toBe(200);
    expect(channel?.[0]).toBe(100);
    expect(channel?.[199]).toBe(299);
  });

  it('esticar à taxa 2 gera metade das amostras do trecho', async () => {
    const asset = makeAsset('a4');
    const buffer = rampBuffer(4000, 2);
    const segment = await getStretchedSegment(asset, buffer, 0, 1000, 2);
    expect(segment.channels).toHaveLength(2);
    expect(segment.channels[0]?.length).toBe(500);
    expect(segment.channels[1]?.length).toBe(500);
  });

  it('descarta o trecho mais antigo quando passa do limite de memória', async () => {
    // Cada trecho de 100 amostras mono ocupa 400 bytes; limite de 1000 bytes cabe dois.
    setStretchCacheLimit(1000);
    const asset = makeAsset('a5');
    const buffer = rampBuffer(4000);
    await getStretchedSegment(asset, buffer, 0, 100, 1);
    await getStretchedSegment(asset, buffer, 200, 100, 1);
    await getStretchedSegment(asset, buffer, 400, 100, 1);
    expect(peekStretchedSegment(asset, 0, 100, 1)).toBeNull();
    expect(peekStretchedSegment(asset, 200, 100, 1)).not.toBeNull();
    expect(peekStretchedSegment(asset, 400, 100, 1)).not.toBeNull();
    setStretchCacheLimit(200 * 1024 * 1024);
  });

  it('peek devolve null antes de o trecho ficar pronto', async () => {
    const asset = makeAsset('a6');
    const buffer = rampBuffer(2000);
    expect(peekStretchedSegment(asset, 0, 500, 2)).toBeNull();
    await getStretchedSegment(asset, buffer, 0, 500, 2);
    expect(peekStretchedSegment(asset, 0, 500, 2)).not.toBeNull();
  });
});
