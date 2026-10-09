import { describe, expect, it } from 'vitest';
import { videoCodec, vp9ProfileFromFrame } from '../src/engine/decode/webmCodec';

const SYNC = '010010011000001101000010';

/** Empacota uma string de bits (MSB-first) em bytes, completando o último byte com zeros. */
function pack(bits: string): Uint8Array {
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
  return Uint8Array.from(padded.match(/.{8}/g) ?? [], (chunk) => Number.parseInt(chunk, 2));
}

/** Cabeçalho de quadro-chave VP9: marcador, perfil, show_existing=0, frame_type=0, sync code e tail de color_config. */
function keyFrame(profile: number, tail = ''): Uint8Array {
  const low = profile & 1;
  const high = profile >> 1;
  const reserved = profile === 3 ? '0' : '';
  return pack(`10${low}${high}${reserved}0010${SYNC}${tail}`);
}

describe('vp9ProfileFromFrame', () => {
  it('lê o perfil 0 com 8 bits', () => {
    expect(vp9ProfileFromFrame(keyFrame(0))).toEqual({ profile: 0, bitDepth: 8 });
  });

  it('lê o perfil 1 com 8 bits (4:4:4 sem bit de profundidade)', () => {
    expect(vp9ProfileFromFrame(keyFrame(1))).toEqual({ profile: 1, bitDepth: 8 });
  });

  it('lê o perfil 2 com 10 e com 12 bits pelo ten_or_twelve_bit', () => {
    expect(vp9ProfileFromFrame(keyFrame(2, '0'))).toEqual({ profile: 2, bitDepth: 10 });
    expect(vp9ProfileFromFrame(keyFrame(2, '1'))).toEqual({ profile: 2, bitDepth: 12 });
  });

  it('pula o bit reservado do perfil 3', () => {
    expect(vp9ProfileFromFrame(keyFrame(3, '1'))).toEqual({ profile: 3, bitDepth: 12 });
  });

  it('devolve null para quadro que não é chave', () => {
    expect(vp9ProfileFromFrame(pack(`1000011${SYNC}`))).toBeNull();
  });

  it('devolve null para show_existing_frame', () => {
    expect(vp9ProfileFromFrame(pack(`1000100${SYNC}`))).toBeNull();
  });

  it('devolve null para marcador inválido ou sync code errado', () => {
    expect(vp9ProfileFromFrame(pack(`01000010${SYNC}`))).toBeNull();
    expect(vp9ProfileFromFrame(pack('10000010' + '0'.repeat(24)))).toBeNull();
  });

  it('devolve null para quadro truncado ou vazio', () => {
    expect(vp9ProfileFromFrame(keyFrame(2).slice(0, 3))).toBeNull();
    expect(vp9ProfileFromFrame(new Uint8Array())).toBeNull();
  });
});

describe('videoCodec', () => {
  const noKeyframe = async () => undefined;

  it('VP8 vira vp8', async () => {
    expect(await videoCodec('V_VP8', undefined, noKeyframe)).toEqual({ codec: 'vp8', description: undefined });
  });

  it('VP9 sem CodecPrivate usa o perfil do primeiro quadro-chave', async () => {
    const codec = await videoCodec('V_VP9', undefined, async () => keyFrame(1));
    expect(codec).toEqual({ codec: 'vp09.01.10.08', description: undefined });
  });

  it('VP9 de perfil 2 com 12 bits no quadro-chave', async () => {
    const codec = await videoCodec('V_VP9', undefined, async () => keyFrame(2, '1'));
    expect(codec.codec).toBe('vp09.02.10.12');
  });

  it('VP9 sem quadro-chave legível cai no perfil 0', async () => {
    expect((await videoCodec('V_VP9', undefined, noKeyframe)).codec).toBe('vp09.00.10.08');
    expect((await videoCodec('V_VP9', undefined, async () => pack('0000'))).codec).toBe('vp09.00.10.08');
  });

  it('VP9 com vpcC válido ignora o quadro', async () => {
    let read = false;
    const vpcC = new Uint8Array([2, 41, 0x80, 0, 0, 0]);
    const codec = await videoCodec('V_VP9', vpcC, async () => {
      read = true;
      return keyFrame(1);
    });
    expect(codec.codec).toBe('vp09.02.41.08');
    expect(read).toBe(false);
  });

  it('AV1 com av1C válido devolve a descrição', async () => {
    const av1C = new Uint8Array([0x81, 0x04, 0x00, 0x00]);
    const codec = await videoCodec('V_AV1', av1C, noKeyframe);
    expect(codec.codec).toBe('av01.0.04M.08');
    expect(codec.description).toBe(av1C);
  });

  it('codec desconhecido lança erro', async () => {
    await expect(videoCodec('V_THEORA', undefined, noKeyframe)).rejects.toThrow(/V_THEORA/);
  });
});
