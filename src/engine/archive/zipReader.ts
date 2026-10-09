// Leitor de ZIP: lê o diretório central (com ZIP64) e devolve cada arquivo como Blob, sem carregar o arquivo inteiro.

/** Código do erro de leitura de arquivo compactado ou de projeto. */
export type ArchiveErrorCode = 'zip-invalid' | 'zip-unsupported' | 'archive-invalid';

/** Erro de leitura do ZIP ou do projeto, com código para a interface decidir a mensagem. */
export class ArchiveError extends Error {
  constructor(public readonly code: ArchiveErrorCode) {
    super(`Archive error: ${code}`);
    this.name = 'ArchiveError';
  }
}

/** Entrada do diretório central, já com os tamanhos e posições lidos (inclusive ZIP64). */
interface DirectoryEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

/** Valores do registro de fim, já convertidos para ZIP64 quando necessário. */
interface EndRecord {
  count: number;
  cdSize: number;
  cdOffset: number;
}

const EOCD_SIG = 0x06054b50;
const EOCD_MIN_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_EOCD_BYTES = 56;
const CENTRAL_SIG = 0x02014b50;
const CENTRAL_FIXED_BYTES = 46;
const LOCAL_SIG = 0x04034b50;
const LOCAL_FIXED_BYTES = 30;
const ZIP64_EXTRA_ID = 0x0001;
const MAX_U32 = 0xffffffff;
const MAX_U16 = 0xffff;
const FLAG_ENCRYPTED = 0x0001;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** Lê um ZIP e devolve o conteúdo de cada arquivo (sem pastas) indexado pelo caminho dentro do ZIP. */
export async function readZip(file: Blob): Promise<Map<string, Blob>> {
  const end = await readEndRecord(file);
  const entries = await readDirectory(file, end);
  const files = new Map<string, Blob>();
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    files.set(entry.name, await readEntryData(file, entry));
  }
  return files;
}

/** Garante uma condição sobre a estrutura do ZIP; senão o arquivo é inválido. */
function ensure(condition: boolean): asserts condition {
  if (!condition) {
    throw new ArchiveError('zip-invalid');
  }
}

/** Lê uma faixa do arquivo como DataView, recusando faixas fora dos limites. */
async function readBytes(file: Blob, start: number, length: number): Promise<DataView> {
  ensure(start >= 0 && length >= 0 && start + length <= file.size);
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}

/** Encontra o registro de fim (procurando nos últimos 64 KB) e, se preciso, o registro ZIP64. */
async function readEndRecord(file: Blob): Promise<EndRecord> {
  ensure(file.size >= EOCD_MIN_BYTES);
  const tailStart = Math.max(0, file.size - EOCD_MIN_BYTES - MAX_COMMENT_BYTES);
  const tail = await readBytes(file, tailStart, file.size - tailStart);
  for (let i = tail.byteLength - EOCD_MIN_BYTES; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) !== EOCD_SIG) continue;
    const commentLength = tail.getUint16(i + 20, true);
    if (i + EOCD_MIN_BYTES + commentLength !== tail.byteLength) continue;
    const record = {
      count: tail.getUint16(i + 10, true),
      cdSize: tail.getUint32(i + 12, true),
      cdOffset: tail.getUint32(i + 16, true),
    };
    const eocdAt = tailStart + i;
    if (record.count === MAX_U16 || record.cdSize === MAX_U32 || record.cdOffset === MAX_U32) {
      return readZip64EndRecord(file, eocdAt);
    }
    return record;
  }
  throw new ArchiveError('zip-invalid');
}

/** Lê o registro ZIP64 de fim, apontado pelo localizador logo antes do registro comum. */
async function readZip64EndRecord(file: Blob, eocdAt: number): Promise<EndRecord> {
  ensure(eocdAt >= 20);
  const locator = await readBytes(file, eocdAt - 20, 20);
  ensure(locator.getUint32(0, true) === ZIP64_LOCATOR_SIG);
  const recordAt = Number(locator.getBigUint64(8, true));
  const record = await readBytes(file, recordAt, ZIP64_EOCD_BYTES);
  ensure(record.getUint32(0, true) === ZIP64_EOCD_SIG);
  return {
    count: Number(record.getBigUint64(32, true)),
    cdSize: Number(record.getBigUint64(40, true)),
    cdOffset: Number(record.getBigUint64(48, true)),
  };
}

/** Lê o diretório central inteiro e devolve as entradas com nome, método e posições. */
async function readDirectory(file: Blob, end: EndRecord): Promise<DirectoryEntry[]> {
  ensure(end.cdOffset + end.cdSize <= file.size);
  const bytes = new Uint8Array(await file.slice(end.cdOffset, end.cdOffset + end.cdSize).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder('utf-8');
  const entries: DirectoryEntry[] = [];
  let pos = 0;
  for (let index = 0; index < end.count; index += 1) {
    ensure(pos + CENTRAL_FIXED_BYTES <= bytes.byteLength);
    ensure(view.getUint32(pos, true) === CENTRAL_SIG);
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const nameStart = pos + CENTRAL_FIXED_BYTES;
    ensure(nameStart + nameLength + extraLength + commentLength <= bytes.byteLength);
    if ((flags & FLAG_ENCRYPTED) !== 0) throw new ArchiveError('zip-unsupported');
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) throw new ArchiveError('zip-unsupported');
    const extraStart = nameStart + nameLength;
    const extra = { start: extraStart, end: extraStart + extraLength };
    const zip64 = readZip64Extra(view, extra, {
      compressed: view.getUint32(pos + 20, true),
      uncompressed: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
    });
    entries.push({
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      method,
      compressedSize: zip64.compressed,
      localOffset: zip64.offset,
    });
    pos = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Campos de tamanho e posição de uma entrada do diretório central. */
interface EntryFields {
  compressed: number;
  uncompressed: number;
  offset: number;
}

/** Substitui pelos valores 64 bits do campo extra ZIP64 os campos marcados com 0xFFFFFFFF. */
function readZip64Extra(view: DataView, extra: { start: number; end: number }, fields: EntryFields): EntryFields {
  const result = { ...fields };
  let cursor = extra.start;
  while (cursor + 4 <= extra.end) {
    const id = view.getUint16(cursor, true);
    const size = view.getUint16(cursor + 2, true);
    const body = cursor + 4;
    ensure(body + size <= extra.end);
    if (id === ZIP64_EXTRA_ID) {
      let p = body;
      const take = (): number => {
        ensure(p + 8 <= body + size);
        const value = Number(view.getBigUint64(p, true));
        p += 8;
        return value;
      };
      if (result.uncompressed === MAX_U32) result.uncompressed = take();
      if (result.compressed === MAX_U32) result.compressed = take();
      if (result.offset === MAX_U32) result.offset = take();
      return result;
    }
    cursor = body + size;
  }
  ensure(result.uncompressed !== MAX_U32 && result.compressed !== MAX_U32 && result.offset !== MAX_U32);
  return result;
}

/** Devolve o conteúdo de uma entrada: fatia direta para STORE; descompacta deflate-raw. */
async function readEntryData(file: Blob, entry: DirectoryEntry): Promise<Blob> {
  const local = await readBytes(file, entry.localOffset, LOCAL_FIXED_BYTES);
  ensure(local.getUint32(0, true) === LOCAL_SIG);
  const start =
    entry.localOffset + LOCAL_FIXED_BYTES + local.getUint16(26, true) + local.getUint16(28, true);
  ensure(start + entry.compressedSize <= file.size);
  const raw = file.slice(start, start + entry.compressedSize);
  if (entry.method === METHOD_STORE) {
    return raw;
  }
  if (typeof DecompressionStream !== 'function') {
    throw new ArchiveError('zip-unsupported');
  }
  // Entradas deflate são lidas inteiras (o editor só grava STORE); o trecho compactado é pequeno o bastante.
  const packed = new Uint8Array(await raw.arrayBuffer());
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(packed);
      controller.close();
    },
  });
  try {
    return await new Response(source.pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  } catch {
    throw new ArchiveError('zip-invalid');
  }
}
