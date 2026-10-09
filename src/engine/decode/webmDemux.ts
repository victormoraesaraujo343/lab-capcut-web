// Demux de WebM/Matroska próprio: percorre cabeçalhos e blocos da trilha de vídeo sem carregar o arquivo inteiro.
import { readSampleData, type Mp4Info } from './demux';
import type { SampleInfo } from './sampleIndex';
import { readBytes, readElementHeader, readFloat, readString, readUint } from './ebml';
import { buildSamples, makeFrame, readBlockGroup, readBlockHead, ticksToMicros, type BlockSource, type FrameDraft, type WebmElement } from './webmBlocks';
import { videoCodec } from './webmCodec';

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const CODEC_PRIVATE = 0x63a2;
const VIDEO = 0xe0;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;

const CONTAINERS = new Set<number>([SEGMENT, INFO, TRACKS, TRACK_ENTRY, VIDEO, CLUSTER]);
const VIDEO_TRACK_TYPE = 1;
const KEYFRAME_FLAG = 0x80;
const DEFAULT_TIMECODE_SCALE = 1_000_000;
const NANOS_PER_SECOND = 1_000_000_000;
const WINDOW_BYTES = 256;
const MAX_HEADER_BYTES = 12;
const MIN_ELEMENT_BYTES = 2;

/** Trilha como declarada em TrackEntry; campos preenchidos conforme aparecem no arquivo. */
interface TrackDraft {
  number?: number;
  type?: number;
  codecId?: string;
  codecPrivate?: Uint8Array;
  width?: number;
  height?: number;
}

/** Dados brutos do scan, antes de escolher a trilha de vídeo. */
interface ScanResult {
  timecodeScale: number;
  durationTicks: number | undefined;
  tracks: TrackDraft[];
  frames: FrameDraft[];
}

/** Abre um WebM/Matroska e devolve a trilha de vídeo (codec, dimensões, amostras) no formato do demux MP4. */
export async function openWebm(file: File): Promise<Mp4Info> {
  const scanner = new WebmScanner(file);
  await scanner.scan();
  return buildInfo(scanner.result(), file);
}

/** Lê o arquivo em janelas pequenas sob demanda, sem carregar tudo de uma vez. */
class FileWindow {
  private start = 0;
  private view = new DataView(new ArrayBuffer(0));

  constructor(private readonly file: File) {}

  /** Devolve exatamente `length` bytes a partir de `offset`, relendo do arquivo só quando a janela atual não cobre. */
  async bytes(offset: number, length: number): Promise<DataView> {
    if (offset < 0 || offset + length > this.file.size) {
      throw new Error('Arquivo WebM truncado');
    }
    const covered = offset >= this.start && offset + length <= this.start + this.view.byteLength;
    if (!covered) {
      const end = Math.min(this.file.size, offset + Math.max(length, WINDOW_BYTES));
      this.view = new DataView(await this.file.slice(offset, end).arrayBuffer());
      this.start = offset;
    }
    return new DataView(this.view.buffer, this.view.byteOffset + (offset - this.start), length);
  }
}

/** Percorre os elementos do arquivo em ordem: entra nos contêineres e pula o conteúdo dos demais. */
class WebmScanner {
  private readonly reader: FileWindow;
  private readonly size: number;
  private readonly blocks: BlockSource;
  private timecodeScale = DEFAULT_TIMECODE_SCALE;
  private durationTicks: number | undefined;
  private readonly tracks: TrackDraft[] = [];
  private readonly frames: FrameDraft[] = [];
  private currentTrack: TrackDraft | undefined;
  private clusterTicks = 0;

  constructor(file: File) {
    this.reader = new FileWindow(file);
    this.size = file.size;
    this.blocks = {
      bytes: (offset, length) => this.reader.bytes(offset, length),
      element: (offset) => this.element(offset),
    };
  }

  /** Varre o arquivo do cabeçalho EBML até o fim do arquivo. */
  async scan(): Promise<void> {
    const header = await this.element(0);
    if (header.id !== EBML_HEADER) {
      throw new Error('Arquivo não é WebM/Matroska');
    }
    const segment = await this.element(header.end);
    if (segment.id !== SEGMENT) {
      throw new Error('WebM sem segmento');
    }
    let offset = segment.dataStart;
    while (this.size - offset >= MIN_ELEMENT_BYTES) {
      const el = await this.element(offset);
      if (el.truncated && !CONTAINERS.has(el.id)) {
        break;
      }
      offset = await this.visit(el);
    }
  }

  /** Dados coletados pelo scan, prontos para montar as amostras da trilha de vídeo. */
  result(): ScanResult {
    return { timecodeScale: this.timecodeScale, durationTicks: this.durationTicks, tracks: this.tracks, frames: this.frames };
  }

  /** Trata um elemento e devolve a posição do próximo elemento a ler. */
  private async visit(el: WebmElement): Promise<number> {
    switch (el.id) {
      case TRACK_ENTRY:
        this.currentTrack = {};
        this.tracks.push(this.currentTrack);
        return el.dataStart;
      case SEGMENT:
      case INFO:
      case TRACKS:
      case VIDEO:
      case CLUSTER:
        return el.dataStart;
      case TIMECODE_SCALE:
        this.timecodeScale = await this.uint(el);
        return el.end;
      case DURATION:
        this.durationTicks = await this.float(el);
        return el.end;
      case CLUSTER_TIMECODE:
        this.clusterTicks = await this.uint(el);
        return el.end;
      case SIMPLE_BLOCK: {
        const head = await readBlockHead(this.blocks, el);
        this.frames.push(makeFrame(head, this.clusterTicks, (head.flags & KEYFRAME_FLAG) !== 0, undefined));
        return el.end;
      }
      case BLOCK_GROUP: {
        const frame = await readBlockGroup(this.blocks, el, this.clusterTicks);
        if (frame) {
          this.frames.push(frame);
        }
        return el.end;
      }
      case TRACK_NUMBER:
      case TRACK_TYPE:
      case CODEC_ID:
      case CODEC_PRIVATE:
      case PIXEL_WIDTH:
      case PIXEL_HEIGHT:
        await this.trackField(el);
        return el.end;
      default:
        if (el.size < 0) {
          throw new Error('Elemento WebM de tamanho desconhecido não suportado');
        }
        return el.end;
    }
  }

  /** Grava um campo de TrackEntry na trilha aberta por último. */
  private async trackField(el: WebmElement): Promise<void> {
    const track = this.currentTrack;
    if (!track) {
      return;
    }
    if (el.id === TRACK_NUMBER) track.number = await this.uint(el);
    else if (el.id === TRACK_TYPE) track.type = await this.uint(el);
    else if (el.id === CODEC_ID) track.codecId = await this.text(el);
    else if (el.id === CODEC_PRIVATE) track.codecPrivate = await this.raw(el);
    else if (el.id === PIXEL_WIDTH) track.width = await this.uint(el);
    else track.height = await this.uint(el);
  }

  /** Lê o cabeçalho (ID e tamanho) do elemento que começa na posição dada. */
  private async element(offset: number): Promise<WebmElement> {
    const head = await this.reader.bytes(offset, Math.min(MAX_HEADER_BYTES, this.size - offset));
    const header = readElementHeader(head, 0);
    const dataStart = offset + header.headerSize;
    const declaredEnd = header.size < 0 ? this.size : dataStart + header.size;
    return {
      id: header.id,
      size: header.size,
      dataStart,
      end: Math.min(this.size, declaredEnd),
      truncated: declaredEnd > this.size,
    };
  }

  /** Lê o corpo inteiro de um elemento folha. */
  private body(el: WebmElement): Promise<DataView> {
    return this.reader.bytes(el.dataStart, el.end - el.dataStart);
  }

  /** Lê um elemento folha como inteiro sem sinal. */
  private async uint(el: WebmElement): Promise<number> {
    const view = await this.body(el);
    return readUint(view, 0, view.byteLength);
  }

  /** Lê um elemento folha como ponto flutuante. */
  private async float(el: WebmElement): Promise<number> {
    const view = await this.body(el);
    return readFloat(view, 0, view.byteLength);
  }

  /** Lê um elemento folha como texto. */
  private async text(el: WebmElement): Promise<string> {
    const view = await this.body(el);
    return readString(view, 0, view.byteLength);
  }

  /** Lê um elemento folha como bytes brutos. */
  private async raw(el: WebmElement): Promise<Uint8Array> {
    const view = await this.body(el);
    return readBytes(view, 0, view.byteLength);
  }
}

/** Monta o Mp4Info da trilha de vídeo a partir do resultado do scan. */
async function buildInfo(scan: ScanResult, file: File): Promise<Mp4Info> {
  const video = scan.tracks.find((track) => track.type === VIDEO_TRACK_TYPE);
  if (!video || video.number === undefined) {
    throw new Error('Arquivo sem trilha de vídeo');
  }
  if (video.width === undefined || video.height === undefined) {
    throw new Error('Trilha de vídeo sem dimensões');
  }
  const frames = scan.frames.filter((frame) => frame.track === video.number);
  if (frames.length === 0) {
    throw new Error('Trilha de vídeo sem quadros');
  }
  if (frames.some((frame) => frame.lacing)) {
    throw new Error('Bloco com lacing não é suportado na trilha de vídeo do WebM');
  }
  const scale = scan.timecodeScale;
  const samples = buildSamples(frames, scale);
  const { codec, description } = await videoCodec(video.codecId, video.codecPrivate, () => firstKeyframe(file, samples));
  const lastEnd = samples.reduce((max, sample) => Math.max(max, sample.ctsUs + sample.durationUs), 0);
  const declared = scan.durationTicks !== undefined && scan.durationTicks > 0 ? ticksToMicros(scan.durationTicks, scale) : 0;
  return {
    codec,
    codedWidth: video.width,
    codedHeight: video.height,
    description,
    timescale: Math.round(NANOS_PER_SECOND / scale),
    samples,
    durationUs: declared > 0 ? declared : lastEnd,
  };
}

/** Bytes do primeiro quadro-chave da trilha, usados para descobrir o perfil do VP9 sem CodecPrivate. */
function firstKeyframe(file: File, samples: SampleInfo[]): Promise<Uint8Array | undefined> {
  const key = samples.find((sample) => sample.isSync);
  return key ? readSampleData(file, key) : Promise.resolve(undefined);
}
