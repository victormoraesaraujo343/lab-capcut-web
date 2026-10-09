// Armazenamento de arquivos em IndexedDB: reserva do OPFS quando ele não pode ser usado (ex.: página aberta por file://).
// Um registro por caminho ('projects/p1/media/a.mp4') guardando o Blob; pastas são só prefixos do caminho.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { splitPath } from './paths';

/** Nome do banco de arquivos, separado do banco de projetos. */
const DB_NAME = 'capcut-web-files';
const DB_VERSION = 1;
const STORE = 'files';

interface FilesSchema extends DBSchema {
  files: { key: string; value: Blob };
}

/** Tipos MIME por extensão, já que um Blob gravado como bytes não tem tipo. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  json: 'application/json',
};

let dbPromise: Promise<IDBPDatabase<FilesSchema>> | null = null;

/** Diz se este contexto tem IndexedDB. */
export function isIdbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Abre (uma vez) o banco de arquivos. */
function getDb(): Promise<IDBPDatabase<FilesSchema>> {
  dbPromise ??= openDB<FilesSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/** Fecha a conexão guardada; usado nos testes para reiniciar o banco. */
export async function closeIdbFiles(): Promise<void> {
  const current = dbPromise;
  dbPromise = null;
  if (current) (await current.catch(() => null))?.close();
}

/** Normaliza o caminho: segmentos sem barras vazias, unidos por '/'. */
function keyOf(path: string): string {
  return splitPath(path).join('/');
}

/** Faixa de chaves que são filhas de uma pasta (key + '/' até key + '0', o caractere seguinte). */
function childRange(key: string): IDBKeyRange {
  return IDBKeyRange.bound(`${key}/`, `${key}0`, false, true);
}

/** Grava os dados no caminho, substituindo o que houver. */
export async function idbWriteFile(path: string, data: Blob | ArrayBuffer | Uint8Array): Promise<void> {
  const key = keyOf(path);
  if (key === '') throw new Error('File path must not be empty');
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
  const db = await getDb();
  await db.put(STORE, blob, key);
}

/** Lê o arquivo como File (com nome e tipo); devolve undefined se não existir. */
export async function idbReadFile(path: string): Promise<File | undefined> {
  const key = keyOf(path);
  const db = await getDb();
  const blob = await db.get(STORE, key);
  if (blob === undefined) return undefined;
  const name = key.slice(key.lastIndexOf('/') + 1);
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const type = blob.type !== '' ? blob.type : (MIME_BY_EXTENSION[extension] ?? '');
  return new File([blob], name, { type });
}

/** Diz se há um arquivo no caminho. */
export async function idbFileExists(path: string): Promise<boolean> {
  const db = await getDb();
  return (await db.getKey(STORE, keyOf(path))) !== undefined;
}

/** Apaga o arquivo e tudo que estiver sob o caminho (como pasta); não faz nada se não existir. */
export async function idbDeleteEntry(path: string): Promise<void> {
  const key = keyOf(path);
  if (key === '') throw new Error('Cannot delete the storage root');
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all([tx.store.delete(key), tx.store.delete(childRange(key)), tx.done]);
}

/** Copia tudo que estiver sob a pasta de origem para a pasta de destino. */
export async function idbCopyDir(fromPath: string, toPath: string): Promise<void> {
  const from = keyOf(fromPath);
  const to = keyOf(toPath);
  const db = await getDb();
  const range = childRange(from);
  const keys = await db.getAllKeys(STORE, range);
  const blobs = await db.getAll(STORE, range);
  const tx = db.transaction(STORE, 'readwrite');
  keys.forEach((key, index) => {
    const blob = blobs[index];
    if (blob !== undefined) void tx.store.put(blob, `${to}/${key.slice(from.length + 1)}`);
  });
  await tx.done;
}
