// Codec do vídeo WebM para o WebCodecs: string a partir do ID do Matroska e, no VP9 sem CodecPrivate, do primeiro quadro-chave.

const DEFAULT_VP9 = 'vp09.00.10.08';
const DEFAULT_AV1 = 'av01.0.04M.08';
const VP9_LEVEL = 10;
const VP9_FRAME_MARKER = 0b10;
const VP9_KEY_FRAME = 0;
const VP9_SYNC_CODE = [0x49, 0x83, 0x42];
const VP9_RESERVED_PROFILE = 3;
const VP9_HIGH_BIT_PROFILE = 2;

/** Codec WebCodecs do vídeo WebM e, quando existe, a descrição de configuração (só AV1 usa). */
export interface WebmVideoCodec {
  /** Codec no formato WebCodecs (ex.: 'vp09.01.10.08'). */
  codec: string;
  /** Registro av1C sem o cabeçalho de 8 bytes; undefined quando não se aplica. */
  description: Uint8Array | undefined;
}

/** Leitor de bits MSB-first sobre bytes; lança erro se os bytes acabarem antes do pedido. */
class BitReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  /** Lê `count` bits e devolve como inteiro sem sinal. */
  read(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index++) {
      const byte = this.bytes[this.position >> 3];
      if (byte === undefined) {
        throw new Error('Quadro VP9 truncado');
      }
      value = (value << 1) | ((byte >> (7 - (this.position & 7))) & 1);
      this.position++;
    }
    return value;
  }
}

/** Codec WebCodecs do vídeo WebM; no VP9 sem CodecPrivate usa `firstKeyframe` para descobrir o perfil. */
export async function videoCodec(
  codecId: string | undefined,
  privateData: Uint8Array | undefined,
  firstKeyframe: () => Promise<Uint8Array | undefined>,
): Promise<WebmVideoCodec> {
  if (codecId === 'V_VP8') {
    return { codec: 'vp8', description: undefined };
  }
  if (codecId === 'V_VP9') {
    const configured = vp9CodecString(privateData);
    if (configured !== null) {
      return { codec: configured, description: undefined };
    }
    const keyframe = await firstKeyframe();
    const profile = keyframe ? vp9ProfileFromFrame(keyframe) : null;
    const codec = profile ? `vp09.${pad2(profile.profile)}.${pad2(VP9_LEVEL)}.${pad2(profile.bitDepth)}` : DEFAULT_VP9;
    return { codec, description: undefined };
  }
  if (codecId === 'V_AV1') {
    const codec = av1CodecString(privateData);
    return { codec: codec ?? DEFAULT_AV1, description: codec ? privateData : undefined };
  }
  throw new Error(`Codec de vídeo não suportado no WebM: ${codecId ?? 'desconhecido'}`);
}

/** Perfil e profundidade de bits do VP9 pelo cabeçalho não comprimido de um quadro-chave; null se não for quadro-chave válido. */
export function vp9ProfileFromFrame(data: Uint8Array): { profile: number; bitDepth: number } | null {
  try {
    const bits = new BitReader(data);
    if (bits.read(2) !== VP9_FRAME_MARKER) {
      return null;
    }
    const low = bits.read(1);
    const high = bits.read(1);
    const profile = low | (high << 1);
    if (profile === VP9_RESERVED_PROFILE) {
      bits.read(1);
    }
    if (bits.read(1) === 1) {
      return null;
    }
    if (bits.read(1) !== VP9_KEY_FRAME) {
      return null;
    }
    bits.read(2);
    for (const expected of VP9_SYNC_CODE) {
      if (bits.read(8) !== expected) {
        return null;
      }
    }
    const bitDepth = profile >= VP9_HIGH_BIT_PROFILE ? (bits.read(1) === 1 ? 12 : 10) : 8;
    return { profile, bitDepth };
  } catch {
    return null;
  }
}

/** Codec string do VP9 a partir do registro vpcC (perfil, nível, profundidade); null se inválido ou ausente. */
function vp9CodecString(privateData: Uint8Array | undefined): string | null {
  if (!privateData || privateData.byteLength < 3) {
    return null;
  }
  const profile = privateData[0] ?? -1;
  const level = privateData[1] ?? 0;
  const bitDepth = (privateData[2] ?? 0) >> 4;
  if (profile < 0 || profile > 3 || level === 0 || ![8, 10, 12].includes(bitDepth)) {
    return null;
  }
  return `vp09.${pad2(profile)}.${pad2(level)}.${pad2(bitDepth)}`;
}

/** Codec string do AV1 a partir do av1C (perfil, nível, tier, profundidade); null se inválido ou ausente. */
function av1CodecString(privateData: Uint8Array | undefined): string | null {
  if (!privateData || privateData.byteLength < 4) {
    return null;
  }
  const marker = privateData[0] ?? 0;
  if ((marker & 0x80) === 0 || (marker & 0x7f) !== 1) {
    return null;
  }
  const profileLevel = privateData[1] ?? 0;
  const flags = privateData[2] ?? 0;
  const profile = profileLevel >> 5;
  const level = profileLevel & 0x1f;
  const tier = (flags & 0x80) !== 0 ? 'H' : 'M';
  const highBitDepth = (flags & 0x40) !== 0;
  const twelveBit = (flags & 0x20) !== 0;
  const bitDepth = highBitDepth ? (twelveBit ? 12 : 10) : 8;
  return `av01.${profile}.${pad2(level)}${tier}.${pad2(bitDepth)}`;
}

/** Preenche um número com zero à esquerda até dois dígitos. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
