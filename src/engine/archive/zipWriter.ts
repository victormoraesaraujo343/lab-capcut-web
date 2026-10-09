// Gravador de ZIP no método STORE (sem compressão, a mídia já é comprimida), com ZIP64, nomes UTF-8 e CRC em pedaços.

import { crc32 } from './crc32';

/** Arquivo a incluir no ZIP: caminho dentro do arquivo e conteúdo. */
export interface ZipEntry {
  /** Caminho dentro do ZIP, com '/' como separador. */
  name: string;
  /** Conteúdo do arquivo; não é carregado inteiro na memória. */
  data: Blob;
}

/** Tamanho dos pedaços lidos de cada Blob ao calcular o CRC. */
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_U32 = 0xffffffff;
const MAX_U16 = 0xffff;
const FLAG_UTF8 = 0x0800;
const VERSION_STORE = 20;
const VERSION_ZIP64 = 45;
const ZIP64_EXTRA_ID = 0x0001;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const END_RECORD_BYTES = 22;

/** Posição e tamanhos de uma entrada já calculados antes de gravar. */
interface Layout {
  entry: ZipEntry;
  name: Uint8Array;
  size: number;
  crc: number;
  localOffset: number;
  sizeOverflow: boolean;
  offsetOverflow: boolean;
}

/** Monta um ZIP STORE; usa ZIP64 se algo passar de 4 GB (zip64Limit: total a partir do qual vira ZIP64, para testes). */
export async function createZip(
  entries: ZipEntry[],
  onProgress?: (fraction: number) => void,
  zip64Limit = MAX_U32,
): Promise<Blob> {
  const encoder = new TextEncoder();
  const layouts = planLayout(entries, encoder);
  const totalBytes = layouts.reduce((sum, item) => sum + item.size, 0);
  await computeCrcs(layouts, totalBytes, onProgress);

  const cdStart = layouts.reduce((sum, item) => sum + localLength(item) + item.size, 0);
  const cdRecords = layouts.map((item) => centralRecord(item));
  const cdSize = cdRecords.reduce((sum, record) => sum + record.byteLength, 0);
  const eocdOffset = cdStart + cdSize;
  const anyOverflow = layouts.some((item) => item.sizeOverflow || item.offsetOverflow);
  const archiveZip64 = anyOverflow || eocdOffset + END_RECORD_BYTES >= zip64Limit || entries.length >= MAX_U16;

  const { time, date } = dosDateTime(new Date());
  const parts: BlobPart[] = [];
  for (const item of layouts) {
    parts.push(localHeader(item, time, date), item.entry.data);
  }
  parts.push(...cdRecords);
  if (archiveZip64) {
    parts.push(zip64EndRecord(layouts.length, cdSize, cdStart), zip64Locator(eocdOffset));
  }
  parts.push(endRecord(layouts.length, cdSize, cdStart, archiveZip64));
  onProgress?.(1);
  return new Blob(parts, { type: 'application/zip' });
}

/** Calcula posições e flags de cada entrada sem ler o conteúdo. */
function planLayout(entries: ZipEntry[], encoder: TextEncoder): Layout[] {
  let offset = 0;
  return entries.map((entry) => {
    const name = encoder.encode(entry.name);
    if (name.length > MAX_U16) {
      throw new Error(`Nome de arquivo longo demais: ${entry.name.slice(0, 40)}`);
    }
    const size = entry.data.size;
    const item: Layout = {
      entry,
      name,
      size,
      crc: 0,
      localOffset: offset,
      sizeOverflow: size >= MAX_U32,
      offsetOverflow: offset >= MAX_U32,
    };
    offset += localLength(item) + size;
    return item;
  });
}

/** Lê cada Blob em pedaços para calcular o CRC-32 de cada entrada. */
async function computeCrcs(layouts: Layout[], totalBytes: number, onProgress?: (fraction: number) => void): Promise<void> {
  let done = 0;
  for (const item of layouts) {
    let crc = 0;
    for (let start = 0; start < item.size; start += CHUNK_BYTES) {
      const end = Math.min(start + CHUNK_BYTES, item.size);
      const chunk = new Uint8Array(await item.entry.data.slice(start, end).arrayBuffer());
      crc = crc32(chunk, crc);
      done += chunk.byteLength;
      onProgress?.(totalBytes > 0 ? done / totalBytes : 1);
    }
    item.crc = crc;
  }
}

/** Tamanho cabeçalho local da entrada: 30 bytes, nome e, se preciso, o campo extra ZIP64. */
function localLength(item: Layout): number {
  return 30 + item.name.length + (item.sizeOverflow ? 20 : 0);
}

/** Cabeçalho local de uma entrada, seguido do conteúdo gravado pelo chamador. */
function localHeader(item: Layout, time: number, date: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(localLength(item));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SIG_LOCAL, true);
  view.setUint16(4, item.sizeOverflow ? VERSION_ZIP64 : VERSION_STORE, true);
  view.setUint16(6, FLAG_UTF8, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, item.crc, true);
  view.setUint32(18, item.sizeOverflow ? MAX_U32 : item.size, true);
  view.setUint32(22, item.sizeOverflow ? MAX_U32 : item.size, true);
  view.setUint16(26, item.name.length, true);
  view.setUint16(28, item.sizeOverflow ? 20 : 0, true);
  bytes.set(item.name, 30);
  if (item.sizeOverflow) {
    writeZip64Extra(view, 30 + item.name.length, [item.size, item.size]);
  }
  return bytes;
}

/** Registro do diretório central de uma entrada. */
function centralRecord(item: Layout): Uint8Array<ArrayBuffer> {
  const fields: number[] = [];
  if (item.sizeOverflow) fields.push(item.size, item.size);
  if (item.offsetOverflow) fields.push(item.localOffset);
  const extraLength = fields.length > 0 ? 4 + fields.length * 8 : 0;
  const bytes = new Uint8Array(46 + item.name.length + extraLength);
  const view = new DataView(bytes.buffer);
  const version = item.sizeOverflow || item.offsetOverflow ? VERSION_ZIP64 : VERSION_STORE;
  view.setUint32(0, SIG_CENTRAL, true);
  view.setUint16(4, version, true);
  view.setUint16(6, version, true);
  view.setUint16(8, FLAG_UTF8, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, item.crc, true);
  view.setUint32(20, item.sizeOverflow ? MAX_U32 : item.size, true);
  view.setUint32(24, item.sizeOverflow ? MAX_U32 : item.size, true);
  view.setUint16(28, item.name.length, true);
  view.setUint16(30, extraLength, true);
  view.setUint32(42, item.offsetOverflow ? MAX_U32 : item.localOffset, true);
  bytes.set(item.name, 46);
  if (extraLength > 0) {
    writeZip64Extra(view, 46 + item.name.length, fields);
  }
  return bytes;
}

/** Grava o campo extra ZIP64 com os valores dados em 64 bits. */
function writeZip64Extra(view: DataView, at: number, values: number[]): void {
  view.setUint16(at, ZIP64_EXTRA_ID, true);
  view.setUint16(at + 2, values.length * 8, true);
  values.forEach((value, index) => {
    view.setBigUint64(at + 4 + index * 8, BigInt(value), true);
  });
}

/** Registro ZIP64 de fim do diretório central. */
function zip64EndRecord(count: number, cdSize: number, cdStart: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(56);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SIG_ZIP64_EOCD, true);
  view.setBigUint64(4, BigInt(44), true);
  view.setUint16(12, VERSION_ZIP64, true);
  view.setUint16(14, VERSION_ZIP64, true);
  view.setBigUint64(24, BigInt(count), true);
  view.setBigUint64(32, BigInt(count), true);
  view.setBigUint64(40, BigInt(cdSize), true);
  view.setBigUint64(48, BigInt(cdStart), true);
  return bytes;
}

/** Localizador do registro ZIP64 de fim, que fica logo depois do diretório central. */
function zip64Locator(zip64EndOffset: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SIG_ZIP64_LOCATOR, true);
  view.setUint32(4, 0, true);
  view.setBigUint64(8, BigInt(zip64EndOffset), true);
  view.setUint32(16, 1, true);
  return bytes;
}

/** Registro de fim do ZIP; com ZIP64, os campos ficam marcados para o leitor buscar no registro ZIP64. */
function endRecord(count: number, cdSize: number, cdStart: number, zip64: boolean): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, SIG_EOCD, true);
  view.setUint16(8, zip64 ? MAX_U16 : count, true);
  view.setUint16(10, zip64 ? MAX_U16 : count, true);
  view.setUint32(12, zip64 ? MAX_U32 : cdSize, true);
  view.setUint32(16, zip64 ? MAX_U32 : cdStart, true);
  return bytes;
}

/** Data e hora no formato MS-DOS usado pelo ZIP. */
function dosDateTime(now: Date): { time: number; date: number } {
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
}
