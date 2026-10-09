import 'fake-indexeddb/auto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeIdbFiles } from '../src/engine/storage/idbFiles';
import {
  copyDir,
  deleteEntry,
  detectStorageBackend,
  fileExists,
  getObjectUrl,
  readFile,
  resetStorageBackend,
  revokeObjectUrl,
  writeFile,
} from '../src/engine/storage/opfs';

/** Simula o navegador aberto por file://: getDirectory existe mas lança SecurityError. */
function blockOpfs(): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: () => Promise.reject(new DOMException('blocked', 'SecurityError')) },
  });
}

describe('opfs em modo IndexedDB', () => {
  beforeEach(() => {
    // O structuredClone do fake-indexeddb só preserva o Blob do Node, não o do jsdom.
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('File', NodeFile);
    resetStorageBackend();
    blockOpfs();
  });

  afterEach(async () => {
    await closeIdbFiles();
    indexedDB = new IDBFactory();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('detecta idb quando getDirectory lança', async () => {
    expect(await detectStorageBackend()).toBe('idb');
  });

  it('grava e lê com nome e tipo', async () => {
    await writeFile('projects/p1/media/a1.mp4', new Uint8Array([1, 2, 3]));
    const file = await readFile('projects/p1/media/a1.mp4');
    expect(file.name).toBe('a1.mp4');
    expect(file.type).toBe('video/mp4');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('aceita Blob e ArrayBuffer', async () => {
    await writeFile('a/b.bin', new Blob([new Uint8Array([4, 5])]));
    await writeFile('a/c.bin', new Uint8Array([6]).buffer);
    expect(new Uint8Array(await (await readFile('a/b.bin')).arrayBuffer())).toEqual(new Uint8Array([4, 5]));
    expect(new Uint8Array(await (await readFile('a/c.bin')).arrayBuffer())).toEqual(new Uint8Array([6]));
  });

  it('lança notFound ao ler o que não existe', async () => {
    await expect(readFile('nada/x.bin')).rejects.toMatchObject({ code: 'notFound' });
  });

  it('informa se o arquivo existe', async () => {
    expect(await fileExists('p/x.bin')).toBe(false);
    await writeFile('p/x.bin', new Uint8Array([9]));
    expect(await fileExists('p/x.bin')).toBe(true);
  });

  it('apaga pasta por prefixo sem tocar em irmãs de nome parecido', async () => {
    await writeFile('projects/p1/media/a.mp4', new Uint8Array([1]));
    await writeFile('projects/p1/thumbs/a/0.jpg', new Uint8Array([2]));
    await writeFile('projects/p10/media/a.mp4', new Uint8Array([3]));
    await deleteEntry('projects/p1');
    expect(await fileExists('projects/p1/media/a.mp4')).toBe(false);
    expect(await fileExists('projects/p1/thumbs/a/0.jpg')).toBe(false);
    expect(await fileExists('projects/p10/media/a.mp4')).toBe(true);
    await expect(deleteEntry('nao/existe')).resolves.toBeUndefined();
  });

  it('copia a pasta recursivamente', async () => {
    await writeFile('projects/p1/media/a.mp4', new Uint8Array([7, 8]));
    await writeFile('projects/p1/thumbs/a/0.jpg', new Uint8Array([5]));
    await copyDir('projects/p1', 'projects/p2');
    expect(new Uint8Array(await (await readFile('projects/p2/media/a.mp4')).arrayBuffer())).toEqual(
      new Uint8Array([7, 8]),
    );
    expect(await fileExists('projects/p2/thumbs/a/0.jpg')).toBe(true);
    expect(await fileExists('projects/p1/media/a.mp4')).toBe(true);
  });

  it('reaproveita a object URL por caminho', async () => {
    await writeFile('p/a.mp4', new Uint8Array([1]));
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake/1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    expect(await getObjectUrl('p/a.mp4')).toBe('blob:fake/1');
    expect(await getObjectUrl('p/a.mp4')).toBe('blob:fake/1');
    expect(create).toHaveBeenCalledTimes(1);
    revokeObjectUrl('p/a.mp4');
    expect(revoke).toHaveBeenCalledWith('blob:fake/1');
  });
});
