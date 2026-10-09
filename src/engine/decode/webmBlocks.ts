// Percurso dos blocos do WebM: lê cabeçalhos de SimpleBlock/BlockGroup e monta as amostras da trilha de vídeo.
import type { SampleInfo } from './sampleIndex';
import { readUint, readVint } from './ebml';

const BLOCK = 0xa1;
const BLOCK_DURATION = 0x9b;
const REFERENCE_BLOCK = 0xfb;
const BLOCK_HEADER_BYTES = 16;
const LACING_MASK = 0x06;
const DEFAULT_FRAME_US = 33_333;
const MICROS_PER_TICK_UNIT = 1000;

/** Elemento EBML já lido: dados começam em dataStart e terminam em end (limitado ao arquivo). */
export interface WebmElement {
  /** ID do elemento, com os bits de marcação. */
  id: number;
  /** Tamanho declarado dos dados; -1 quando desconhecido. */
  size: number;
  /** Posição do primeiro byte dos dados. */
  dataStart: number;
  /** Posição do fim dos dados (limitada ao tamanho do arquivo). */
  end: number;
  /** Verdadeiro quando o tamanho declarado passa do fim do arquivo. */
  truncated: boolean;
}

/** Acesso aos bytes e aos cabeçalhos do arquivo, usado pelo percurso de blocos. */
export interface BlockSource {
  /** Devolve exatamente `length` bytes a partir de `offset`. */
  bytes(offset: number, length: number): Promise<DataView>;
  /** Lê o cabeçalho do elemento que começa em `offset`. */
  element(offset: number): Promise<WebmElement>;
}

/** Cabeçalho de um bloco: trilha, tempo relativo ao cluster, flags e onde começam os dados do quadro. */
export interface BlockHead {
  /** Número da trilha dona do bloco. */
  track: number;
  /** Tempo do quadro relativo ao cluster, em unidades de TimecodeScale. */
  relative: number;
  /** Byte de flags do bloco (keyframe, lacing). */
  flags: number;
  /** Posição do primeiro byte de dados do quadro. */
  dataOffset: number;
  /** Tamanho dos dados do quadro em bytes. */
  size: number;
}

/** Quadro de qualquer trilha, ainda com tempo bruto em unidades de TimecodeScale. */
export interface FrameDraft {
  /** Número da trilha dona do quadro. */
  track: number;
  /** Tempo bruto (cluster + relativo) em unidades de TimecodeScale. */
  ticks: number;
  /** Verdadeiro para quadro-chave. */
  keyframe: boolean;
  /** Posição dos dados do quadro no arquivo. */
  offset: number;
  /** Tamanho dos dados do quadro em bytes. */
  size: number;
  /** Verdadeiro quando o bloco usa lacing (não suportado na trilha de vídeo). */
  lacing: boolean;
  /** Duração do quadro em unidades de TimecodeScale, quando o BlockGroup informa. */
  durationTicks: number | undefined;
}

/** Lê o cabeçalho de um SimpleBlock ou Block (trilha, tempo, flags) sem ler os dados do quadro. */
export async function readBlockHead(source: BlockSource, el: WebmElement): Promise<BlockHead> {
  const head = await source.bytes(el.dataStart, Math.min(BLOCK_HEADER_BYTES, el.end - el.dataStart));
  const track = readVint(head, 0);
  const timeAt = track.length;
  if (head.byteLength < timeAt + 3) {
    throw new Error('Bloco WebM truncado');
  }
  const dataOffset = el.dataStart + timeAt + 3;
  return {
    track: track.value,
    relative: head.getInt16(timeAt, false),
    flags: head.getUint8(timeAt + 2),
    dataOffset,
    size: el.end - dataOffset,
  };
}

/** Lê um BlockGroup: o quadro é keyframe quando não há ReferenceBlock dentro do grupo. */
export async function readBlockGroup(source: BlockSource, group: WebmElement, clusterTicks: number): Promise<FrameDraft | undefined> {
  let head: BlockHead | undefined;
  let duration: number | undefined;
  let hasReference = false;
  let offset = group.dataStart;
  while (offset < group.end) {
    const child = await source.element(offset);
    if (child.id === BLOCK) {
      head = await readBlockHead(source, child);
    } else if (child.id === BLOCK_DURATION) {
      const view = await source.bytes(child.dataStart, child.end - child.dataStart);
      duration = readUint(view, 0, view.byteLength);
    } else if (child.id === REFERENCE_BLOCK) {
      hasReference = true;
    }
    offset = child.end;
  }
  return head ? makeFrame(head, clusterTicks, !hasReference, duration) : undefined;
}

/** Monta um quadro a partir do cabeçalho do bloco e do cluster corrente. */
export function makeFrame(head: BlockHead, clusterTicks: number, keyframe: boolean, durationTicks: number | undefined): FrameDraft {
  return {
    track: head.track,
    ticks: clusterTicks + head.relative,
    keyframe,
    offset: head.dataOffset,
    size: head.size,
    lacing: (head.flags & LACING_MASK) !== 0,
    durationTicks,
  };
}

/** Converte unidades de TimecodeScale (nanossegundos por unidade) para microssegundos inteiros. */
export function ticksToMicros(ticks: number, scale: number): number {
  return Math.round((ticks * scale) / MICROS_PER_TICK_UNIT);
}

/** Converte os quadros em amostras: tempo normalizado pelo menor cts, duração até o próximo quadro de apresentação. */
export function buildSamples(frames: FrameDraft[], scale: number): SampleInfo[] {
  const base = frames.reduce((min, frame) => Math.min(min, frame.ticks), Number.POSITIVE_INFINITY);
  const ctsUs = frames.map((frame) => ticksToMicros(frame.ticks - base, scale));
  const presentation = ctsUs.map((cts, index) => ({ index, cts })).sort((a, b) => a.cts - b.cts || a.index - b.index);

  const gaps: number[] = [];
  for (let position = 0; position + 1 < presentation.length; position++) {
    const current = presentation[position];
    const next = presentation[position + 1];
    if (current && next && next.cts > current.cts) {
      gaps.push(next.cts - current.cts);
    }
  }
  const average = gaps.length > 0 ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : DEFAULT_FRAME_US;

  const durationUs: number[] = frames.map(() => average);
  presentation.forEach((entry, position) => {
    const frame = frames[entry.index];
    const next = presentation[position + 1];
    if (!frame) {
      return;
    }
    if (frame.durationTicks !== undefined) {
      durationUs[entry.index] = ticksToMicros(frame.durationTicks, scale);
    } else if (next && next.cts > entry.cts) {
      durationUs[entry.index] = next.cts - entry.cts;
    }
  });

  return frames.map((frame, index) => ({
    index,
    ctsUs: ctsUs[index] ?? 0,
    durationUs: durationUs[index] ?? average,
    isSync: frame.keyframe,
    offset: frame.offset,
    size: frame.size,
  }));
}
