// Demux de MP4/MOV com mp4box: lê a trilha de vídeo, a configuração do codec e a tabela de amostras.
import { createFile, DataStream, Endianness } from 'mp4box';
import { MP4BoxBuffer } from 'mp4box';
import type { Movie } from 'mp4box';
import type { SampleInfo } from './sampleIndex';

const CHUNK_BYTES = 1024 * 1024;
const MICROS_PER_SECOND = 1_000_000;
const BOX_HEADER_BYTES = 8;

/** Informações da trilha de vídeo de um arquivo, prontas para configurar um VideoDecoder. */
export interface Mp4Info {
  /** Codec no formato WebCodecs (ex.: 'avc1.640028'). */
  codec: string;
  /** Largura codificada em pixels. */
  codedWidth: number;
  /** Altura codificada em pixels. */
  codedHeight: number;
  /** Registro de configuração do codec (avcC/hvcC/vpcC/av1C) sem o cabeçalho de 8 bytes; undefined se ausente. */
  description: Uint8Array | undefined;
  /** Escala de tempo da trilha (unidades por segundo). */
  timescale: number;
  /** Amostras em ordem de decodificação, com tempos em microssegundos a partir do primeiro quadro. */
  samples: SampleInfo[];
  /** Duração da trilha em microssegundos. */
  durationUs: number;
}

interface CodecBoxes {
  avcC?: Serializable;
  hvcC?: Serializable;
  vpcC?: Serializable;
  av1C?: Serializable;
}

interface Serializable {
  write(stream: DataStream): void;
}

/** Abre um MP4/MOV, lê a primeira trilha de vídeo e devolve configuração e amostras. */
export async function openMp4(file: File): Promise<Mp4Info> {
  const mp4 = createFile();
  let movie: Movie | undefined;
  let failure: Error | undefined;
  mp4.onError = (module: string, message: string) => {
    failure = new Error(`${module}: ${message}`);
  };
  mp4.onReady = (info: Movie) => {
    movie = info;
  };

  let position = 0;
  while (position < file.size && failure === undefined && !(movie && !movie.isFragmented)) {
    const end = Math.min(file.size, position + CHUNK_BYTES);
    const bytes = await file.slice(position, end).arrayBuffer();
    const next = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes, position));
    position = typeof next === 'number' && next > position ? next : end;
  }

  if (failure !== undefined) {
    throw failure;
  }
  const track = movie?.videoTracks[0];
  if (!movie || !track) {
    throw new Error('Arquivo sem trilha de vídeo');
  }

  const raw = mp4.getTrackSamplesInfo(track.id);
  let minCts = Number.POSITIVE_INFINITY;
  for (const sample of raw) {
    minCts = Math.min(minCts, sample.cts);
  }
  const base = Number.isFinite(minCts) ? minCts : 0;
  const samples: SampleInfo[] = raw.map((sample, index) => ({
    index,
    ctsUs: toMicros(sample.cts - base, sample.timescale),
    durationUs: toMicros(sample.duration, sample.timescale),
    isSync: sample.is_sync,
    offset: sample.offset,
    size: sample.size,
  }));

  const trak = mp4.getTrackById(track.id);
  const entry = trak.mdia.minf.stbl.stsd.entries[0] as unknown as CodecBoxes | undefined;
  return {
    codec: track.codec,
    codedWidth: track.video?.width ?? track.track_width,
    codedHeight: track.video?.height ?? track.track_height,
    description: serializeCodecBox(entry),
    timescale: track.timescale,
    samples,
    durationUs: toMicros(track.duration, track.timescale),
  };
}

/** Lê os bytes de uma amostra a partir do arquivo original. */
export async function readSampleData(file: File, sample: SampleInfo): Promise<Uint8Array> {
  const bytes = await file.slice(sample.offset, sample.offset + sample.size).arrayBuffer();
  return new Uint8Array(bytes);
}

/** Converte um valor em unidades de escala para microssegundos inteiros. */
function toMicros(value: number, timescale: number): number {
  return Math.round((value * MICROS_PER_SECOND) / timescale);
}

/** Serializa a caixa de configuração do codec, descartando o cabeçalho de 8 bytes. */
function serializeCodecBox(entry: CodecBoxes | undefined): Uint8Array | undefined {
  const box: Serializable | undefined = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC ?? entry?.av1C;
  if (!box) {
    return undefined;
  }
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, BOX_HEADER_BYTES);
}

/** Diz se o navegador decodifica a configuração; configurações inválidas contam como não suportadas. */
export async function isCodecSupported(config: VideoDecoderConfig): Promise<boolean> {
  try {
    const result = await VideoDecoder.isConfigSupported(config);
    return result.supported === true;
  } catch {
    return false;
  }
}
