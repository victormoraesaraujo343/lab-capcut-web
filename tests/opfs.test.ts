import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyDir,
  deleteEntry,
  fileExists,
  getObjectUrl,
  isOpfsAvailable,
  readFile,
  revokeObjectUrl,
  StorageError,
  writeFile,
} from '../src/engine/storage/opfs';
import { fileExtension, mediaPath, projectDir, splitPath, thumbDir } from '../src/engine/storage/paths';

type ChunkInput = Blob | ArrayBuffer | Uint8Array;

async function toBytes(data: ChunkInput): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return data;
}

function domError(name: string): DOMException {
  return new DOMException(name, name);
}

class MemFile {
  readonly kind = 'file' as const;
  bytes: Uint8Array = new Uint8Array(0);

  constructor(public readonly name: string) {}

  async getFile(): Promise<File> {
    return new File([new Uint8Array(this.bytes)], this.name);
  }

  async createWritable(): Promise<{ write: (data: ChunkInput) => Promise<void>; close: () => Promise<void> }> {
    return {
      write: async (data: ChunkInput) => {
        this.bytes = await toBytes(data);
      },
      close: async () => {},
    };
  }
}

class MemDirectory {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, MemDirectory | MemFile>();

  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemDirectory> {
    const existing = this.children.get(name);
    if (existing instanceof MemDirectory) {
      return existing;
    }
    if (existing) {
      throw domError('TypeMismatchError');
    }
    if (!options?.create) {
      throw domError('NotFoundError');
    }
    const dir = new MemDirectory(name);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemFile> {
    const existing = this.children.get(name);
    if (existing instanceof MemFile) {
      return existing;
    }
    if (existing) {
      throw domError('TypeMismatchError');
    }
    if (!options?.create) {
      throw domError('NotFoundError');
    }
    const file = new MemFile(name);
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const child = this.children.get(name);
    if (!child) {
      throw domError('NotFoundError');
    }
    if (child instanceof MemDirectory && child.children.size > 0 && !options?.recursive) {
      throw domError('InvalidModificationError');
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, MemDirectory | MemFile]> {
    for (const entry of this.children.entries()) {
      yield entry;
    }
  }
}

let root: MemDirectory;

function installStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { value, configurable: true });
}

function installMemoryRoot(): void {
  root = new MemDirectory('');
  installStorage({ getDirectory: async () => root as unknown as FileSystemDirectoryHandle });
}

describe('paths', () => {
  it('monta o caminho do arquivo de mídia', () => {
    expect(mediaPath('p1', 'a1', 'mp4')).toBe('projects/p1/media/a1.mp4');
  });

  it('monta a pasta de miniaturas do asset', () => {
    expect(thumbDir('p1', 'a1')).toBe('projects/p1/thumbs/a1');
  });

  it('monta a pasta do projeto', () => {
    expect(projectDir('p1')).toBe('projects/p1');
  });

  it('separa o caminho ignorando segmentos vazios', () => {
    expect(splitPath('/projects//p1/media/')).toEqual(['projects', 'p1', 'media']);
    expect(splitPath('')).toEqual([]);
  });

  it('extrai a extensão em minúsculo sem ponto', () => {
    expect(fileExtension('Video.MP4')).toBe('mp4');
    expect(fileExtension('clip.final.Mov')).toBe('mov');
  });

  it('retorna vazio quando não há extensão', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('.bashrc')).toBe('');
    expect(fileExtension('arquivo.')).toBe('');
  });
});

describe('opfs', () => {
  beforeEach(() => {
    installMemoryRoot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('informa disponibilidade quando navigator.storage existe', () => {
    expect(isOpfsAvailable()).toBe(true);
  });

  it('grava e lê um arquivo criando pastas intermediárias', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await writeFile('projects/p1/media/a1.mp4', data);

    const file = await readFile('projects/p1/media/a1.mp4');
    expect(file.name).toBe('a1.mp4');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(data);
  });

  it('lança notFound ao ler arquivo inexistente', async () => {
    await expect(readFile('projects/nada/x.bin')).rejects.toMatchObject({ code: 'notFound' });
  });

  it('informa se o arquivo existe', async () => {
    expect(await fileExists('projects/p1/x.bin')).toBe(false);
    await writeFile('projects/p1/x.bin', new Uint8Array([9]));
    expect(await fileExists('projects/p1/x.bin')).toBe(true);
  });

  it('apaga uma pasta inteira recursivamente', async () => {
    await writeFile('projects/p1/media/a1.mp4', new Uint8Array([1]));
    await writeFile('projects/p1/thumbs/a1/0.jpg', new Uint8Array([2]));

    await deleteEntry('projects/p1');

    expect(await fileExists('projects/p1/media/a1.mp4')).toBe(false);
    expect(root.children.has('projects')).toBe(true);
    expect((root.children.get('projects') as MemDirectory).children.has('p1')).toBe(false);
  });

  it('não lança ao apagar algo inexistente', async () => {
    await expect(deleteEntry('projects/nao-existe')).resolves.toBeUndefined();
    await expect(deleteEntry('nao/existe/de/jeito/nenhum.bin')).resolves.toBeUndefined();
  });

  it('copia uma pasta recursivamente', async () => {
    await writeFile('projects/p1/media/a1.mp4', new Uint8Array([7, 8]));
    await writeFile('projects/p1/thumbs/a1/0.jpg', new Uint8Array([5]));

    await copyDir('projects/p1', 'projects/p2');

    const copied = await readFile('projects/p2/media/a1.mp4');
    expect(new Uint8Array(await copied.arrayBuffer())).toEqual(new Uint8Array([7, 8]));
    expect(await fileExists('projects/p2/thumbs/a1/0.jpg')).toBe(true);
    expect(await fileExists('projects/p1/media/a1.mp4')).toBe(true);
  });

  it('reutiliza a mesma object URL para o mesmo caminho e revoga ao soltar', async () => {
    await writeFile('projects/p1/media/a1.mp4', new Uint8Array([1]));
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake/1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const first = await getObjectUrl('projects/p1/media/a1.mp4');
    const second = await getObjectUrl('projects/p1/media/a1.mp4');
    expect(first).toBe('blob:fake/1');
    expect(second).toBe(first);
    expect(createSpy).toHaveBeenCalledTimes(1);

    revokeObjectUrl('projects/p1/media/a1.mp4');
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake/1');

    revokeObjectUrl('projects/p1/media/a1.mp4');
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('lança unavailable quando OPFS não existe', async () => {
    installStorage({});
    expect(isOpfsAvailable()).toBe(false);
    await expect(writeFile('a.bin', new Uint8Array([1]))).rejects.toBeInstanceOf(StorageError);
    await expect(writeFile('a.bin', new Uint8Array([1]))).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('converte QuotaExceededError em StorageError quota', async () => {
    vi.spyOn(MemFile.prototype, 'createWritable').mockRejectedValue(domError('QuotaExceededError'));

    await expect(writeFile('projects/p1/big.bin', new Uint8Array([1]))).rejects.toMatchObject({ code: 'quota' });
  });
});
