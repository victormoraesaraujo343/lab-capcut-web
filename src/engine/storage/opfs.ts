import {
  idbCopyDir,
  idbDeleteEntry,
  idbFileExists,
  idbReadFile,
  idbWriteFile,
  isIdbAvailable,
} from './idbFiles';
import { splitPath } from './paths';

/** Error raised by the OPFS layer, carrying a machine-readable code. */
export class StorageError extends Error {
  constructor(public readonly code: 'quota' | 'unavailable' | 'notFound') {
    super(`Storage error: ${code}`);
    this.name = 'StorageError';
  }
}

type WritableData = Blob | ArrayBuffer | Uint8Array;

interface SyncAccessHandleLike {
  write(buffer: ArrayBuffer | ArrayBufferView, options?: { at?: number }): number;
  truncate(newSize: number): void;
  flush(): void;
  close(): void;
}

interface WritableCapable {
  createWritable?: () => Promise<FileSystemWritableFileStream>;
  createSyncAccessHandle?: () => Promise<SyncAccessHandleLike>;
}

interface AsyncEntriesCapable {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
}

const objectUrlCache = new Map<string, string>();

/** Onde os arquivos ficam: OPFS (normal) ou IndexedDB (quando o OPFS lança erro, ex.: página aberta por file://). */
export type StorageBackend = 'opfs' | 'idb';

/** Detecção já feita, ligada à função getDirectory que ela testou (se o navegador trocar, detecta de novo). */
let detection: { probe: unknown; result: Promise<StorageBackend> } | null = null;

/** Diz qual armazenamento está em uso; testa o OPFS uma vez (cache) e cai para IndexedDB se ele não funcionar. */
export function detectStorageBackend(): Promise<StorageBackend> {
  const probe: unknown = typeof navigator !== 'undefined' ? navigator.storage?.getDirectory : undefined;
  if (detection !== null && detection.probe === probe) return detection.result;
  const result = probeBackend();
  detection = { probe, result };
  return result;
}

/** Esquece a detecção guardada; usado nos testes. */
export function resetStorageBackend(): void {
  detection = null;
}

/** Testa o OPFS de verdade (getDirectory pode lançar SecurityError por file://). */
async function probeBackend(): Promise<StorageBackend> {
  if (isOpfsAvailable()) {
    try {
      await navigator.storage.getDirectory();
      return 'opfs';
    } catch {
      // OPFS bloqueado neste contexto: segue para o IndexedDB.
    }
  }
  return isIdbAvailable() ? 'idb' : 'opfs';
}

/** Returns true when the Origin Private File System can be used in this context. */
export function isOpfsAvailable(): boolean {
  const storage: StorageManager | undefined = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  return typeof storage?.getDirectory === 'function';
}

/** Writes data to a file, creating intermediate folders as needed. */
export async function writeFile(path: string, data: WritableData): Promise<void> {
  const segments = splitPath(path);
  const name = segments.pop();
  if (name === undefined) {
    throw new Error('File path must not be empty');
  }
  await guard(async () => {
    if ((await detectStorageBackend()) === 'idb') {
      await idbWriteFile(path, data);
      return;
    }
    const parent = await resolveDirectory(segments, true);
    const handle = await parent.getFileHandle(name, { create: true });
    await writeToFileHandle(handle, data);
  });
}

/** Reads a file and returns it as a File object. */
export async function readFile(path: string): Promise<File> {
  return guard(async () => {
    if ((await detectStorageBackend()) === 'idb') {
      const stored = await idbReadFile(path);
      if (stored === undefined) throw new StorageError('notFound');
      return stored;
    }
    const { parent, name } = await resolveParent(path, false);
    const handle = await parent.getFileHandle(name);
    return handle.getFile();
  });
}

/** Returns true when a file exists at the given path. */
export async function fileExists(path: string): Promise<boolean> {
  if ((await detectStorageBackend()) === 'idb') {
    return guard(() => idbFileExists(path));
  }
  try {
    const { parent, name } = await resolveParent(path, false);
    await parent.getFileHandle(name);
    return true;
  } catch (error) {
    if (errorName(error) === 'NotFoundError' || errorName(error) === 'TypeMismatchError') {
      return false;
    }
    throw mapError(error);
  }
}

/** Deletes a file or folder recursively; does nothing when it does not exist. */
export async function deleteEntry(path: string): Promise<void> {
  const segments = splitPath(path);
  const name = segments.pop();
  if (name === undefined) {
    throw new Error('Cannot delete the OPFS root');
  }
  try {
    if ((await detectStorageBackend()) === 'idb') {
      await idbDeleteEntry(path);
      return;
    }
    const parent = await resolveDirectory(segments, false);
    await parent.removeEntry(name, { recursive: true });
  } catch (error) {
    if (errorName(error) === 'NotFoundError') {
      return;
    }
    throw mapError(error);
  }
}

/** Copies a folder and all its contents recursively to another path. */
export async function copyDir(fromPath: string, toPath: string): Promise<void> {
  await guard(async () => {
    if ((await detectStorageBackend()) === 'idb') {
      await idbCopyDir(fromPath, toPath);
      return;
    }
    const source = await resolveDirectory(splitPath(fromPath), false);
    const target = await resolveDirectory(splitPath(toPath), true);
    await copyDirectoryContents(source, target);
  });
}

/** Returns an object URL for a file, reusing the same URL for the same path. */
export async function getObjectUrl(path: string): Promise<string> {
  const cached = objectUrlCache.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const file = await readFile(path);
  const existing = objectUrlCache.get(path);
  if (existing !== undefined) {
    return existing;
  }
  const url = URL.createObjectURL(file);
  objectUrlCache.set(path, url);
  return url;
}

/** Revokes the cached object URL of a path and forgets it. */
export function revokeObjectUrl(path: string): void {
  const url = objectUrlCache.get(path);
  if (url === undefined) {
    return;
  }
  URL.revokeObjectURL(url);
  objectUrlCache.delete(path);
}

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsAvailable()) {
    throw new StorageError('unavailable');
  }
  return navigator.storage.getDirectory();
}

async function resolveDirectory(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let current = await getRoot();
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function resolveParent(
  path: string,
  create: boolean,
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const segments = splitPath(path);
  const name = segments.pop();
  if (name === undefined) {
    throw new StorageError('notFound');
  }
  const parent = await resolveDirectory(segments, create);
  return { parent, name };
}

async function writeToFileHandle(handle: FileSystemFileHandle, data: WritableData): Promise<void> {
  const capable: WritableCapable = handle;
  if (typeof capable.createWritable === 'function') {
    const stream = await capable.createWritable();
    await stream.write(toWritableChunk(data));
    await stream.close();
    return;
  }
  if (typeof capable.createSyncAccessHandle !== 'function') {
    throw new StorageError('unavailable');
  }
  const bytes = await toBytes(data);
  const sync = await capable.createSyncAccessHandle();
  try {
    sync.write(bytes, { at: 0 });
    sync.truncate(bytes.byteLength);
    sync.flush();
  } finally {
    sync.close();
  }
}

/** Narrows a Uint8Array to an ArrayBuffer-backed view, which the Storage API requires. */
function toWritableChunk(data: WritableData): Blob | ArrayBuffer | Uint8Array<ArrayBuffer> {
  if (data instanceof Uint8Array) {
    return data as Uint8Array<ArrayBuffer>;
  }
  return data;
}

async function toBytes(data: WritableData): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return data;
}

async function copyDirectoryContents(
  source: FileSystemDirectoryHandle,
  target: FileSystemDirectoryHandle,
): Promise<void> {
  const entries = source as unknown as AsyncEntriesCapable;
  for await (const [name, child] of entries.entries()) {
    if (child.kind === 'directory') {
      const nextTarget = await target.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(child as FileSystemDirectoryHandle, nextTarget);
    } else {
      const file = await (child as FileSystemFileHandle).getFile();
      const out = await target.getFileHandle(name, { create: true });
      await writeToFileHandle(out, file);
    }
  }
}

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error);
  }
}

function errorName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return undefined;
}

function mapError(error: unknown): unknown {
  const name = errorName(error);
  if (name === 'QuotaExceededError') {
    return new StorageError('quota');
  }
  if (name === 'NotFoundError') {
    return new StorageError('notFound');
  }
  return error;
}
