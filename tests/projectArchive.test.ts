import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProjectArchive, importProjectArchive } from '../src/engine/archive/projectArchive';
import { ArchiveError } from '../src/engine/archive/zipReader';
import { createZip } from '../src/engine/archive/zipWriter';
import { createProject, createTrack } from '../src/engine/project/createProject';
import { createClipFromAsset } from '../src/engine/timeline/clipFactory';
import { t } from '../src/i18n/pt-BR';
import type { Asset, Project } from '../src/types';

const memory = vi.hoisted(() => ({
  files: new Map<string, Uint8Array<ArrayBuffer>>(),
  projects: new Map<string, Project>(),
}));

vi.mock('../src/engine/storage/db', () => ({
  getProject: vi.fn((id: string) => Promise.resolve(memory.projects.get(id))),
  saveProject: vi.fn((project: Project) => {
    memory.projects.set(project.id, project);
    return Promise.resolve();
  }),
}));

vi.mock('../src/engine/storage/opfs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine/storage/opfs')>();
  return {
    ...actual,
    readFile: vi.fn((path: string) => {
      const bytes = memory.files.get(path);
      if (bytes === undefined) return Promise.reject(new actual.StorageError('notFound'));
      return Promise.resolve(new File([bytes], path.slice(path.lastIndexOf('/') + 1)));
    }),
    writeFile: vi.fn(async (path: string, data: Blob | ArrayBuffer | Uint8Array) => {
      const bytes: Uint8Array<ArrayBuffer> = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
      memory.files.set(path, bytes);
    }),
    deleteEntry: vi.fn((path: string) => {
      for (const key of [...memory.files.keys()]) {
        if (key.startsWith(path)) memory.files.delete(key);
      }
      return Promise.resolve();
    }),
  };
});

/** Projeto de exemplo com um vídeo (com miniaturas), uma máscara gerada e um clipe na trilha. */
function seedProject(): Project {
  const video: Asset = {
    id: 'a1',
    kind: 'video',
    name: 'praia.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'projects/p1/media/a1.mp4',
    sizeBytes: 9,
    durationMs: 4000,
    width: 1920,
    height: 1080,
    fps: 30,
    thumbnails: ['projects/p1/thumbs/a1/0.jpg', 'projects/p1/thumbs/a1/1.jpg'],
    createdAt: 1,
  };
  const matte: Asset = {
    id: 'a2',
    kind: 'image',
    role: 'matte',
    sourceAssetId: 'a1',
    name: 'mascara.png',
    mimeType: 'image/png',
    opfsPath: 'projects/p1/media/a2.png',
    sizeBytes: 3,
    thumbnails: [],
    createdAt: 2,
  };
  const track = createTrack('video', 'Vídeo');
  const clip = createClipFromAsset(video, track.id, 500);
  return {
    ...createProject('Viagem'),
    id: 'p1',
    assets: [video, matte],
    tracks: [{ ...track, clips: [clip] }],
    durationMs: clip.startMs + clip.durationMs,
  };
}

/** Grava no OPFS fake os arquivos do projeto de exemplo, com bytes conhecidos. */
function seedFiles(): void {
  memory.files.set('projects/p1/media/a1.mp4', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  memory.files.set('projects/p1/media/a2.png', new Uint8Array([9, 8, 7]));
  memory.files.set('projects/p1/thumbs/a1/0.jpg', new Uint8Array([10, 11]));
  memory.files.set('projects/p1/thumbs/a1/1.jpg', new Uint8Array([12]));
}

/** Monta um .zip com só o JSON do projeto dado, para testar a validação da importação. */
async function archiveWithJson(json: unknown): Promise<Blob> {
  return createZip([{ name: 'capcut-web-project.json', data: new Blob([JSON.stringify(json)]) }]);
}

describe('projectArchive', () => {
  beforeEach(() => {
    memory.files.clear();
    memory.projects.clear();
    memory.projects.set('p1', seedProject());
    seedFiles();
  });

  it('exporta e importa preservando trilhas, clipes e mídia, com id e caminhos novos', async () => {
    const original = memory.projects.get('p1')!;
    const archive = await exportProjectArchive('p1');
    const newId = await importProjectArchive(archive);

    expect(newId).not.toBe('p1');
    const saved = memory.projects.get(newId)!;
    expect(saved.id).toBe(newId);
    expect(saved.name).toBe(`Viagem ${t.archive.importedSuffix}`);
    expect(saved.tracks).toEqual(original.tracks);
    expect(saved.assets.map((asset) => asset.id)).toEqual(['a1', 'a2']);
    expect(saved.assets[1]).toMatchObject({ role: 'matte', sourceAssetId: 'a1' });
    expect(saved.assets[0]!.opfsPath).toBe(`projects/${newId}/media/a1.mp4`);
    expect(saved.assets[0]!.thumbnails).toEqual([
      `projects/${newId}/thumbs/a1/0.jpg`,
      `projects/${newId}/thumbs/a1/1.jpg`,
    ]);
    expect(Array.from(memory.files.get(`projects/${newId}/media/a1.mp4`)!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(memory.files.get(`projects/${newId}/media/a2.png`)!)).toEqual([9, 8, 7]);
    expect(Array.from(memory.files.get(`projects/${newId}/thumbs/a1/1.jpg`)!)).toEqual([12]);
    expect(memory.projects.get('p1')!.id).toBe('p1');
  });

  it('avisa os arquivos de mídia que faltam e importa o restante', async () => {
    memory.files.delete('projects/p1/media/a2.png');
    const onMissing = vi.fn();
    const archive = await exportProjectArchive('p1', undefined, onMissing);
    expect(onMissing).toHaveBeenCalledWith(['projects/p1/media/a2.png']);

    const newId = await importProjectArchive(archive);
    expect(memory.files.has(`projects/${newId}/media/a2.png`)).toBe(false);
    expect(Array.from(memory.files.get(`projects/${newId}/media/a1.mp4`)!)).toHaveLength(9);
  });

  it('exportar um projeto que não existe falha', async () => {
    await expect(exportProjectArchive('nao-existe')).rejects.toThrow('Projeto não encontrado');
  });

  it('um arquivo que não é ZIP gera zip-invalid', async () => {
    await expect(importProjectArchive(new Blob(['lixo']))).rejects.toMatchObject({ code: 'zip-invalid' });
  });

  it('um ZIP sem o JSON do projeto gera archive-invalid', async () => {
    const zip = await createZip([{ name: 'outro.txt', data: new Blob(['x']) }]);
    await expect(importProjectArchive(zip)).rejects.toBeInstanceOf(ArchiveError);
    await expect(importProjectArchive(zip)).rejects.toMatchObject({ code: 'archive-invalid' });
  });

  it('JSON com formato ou versão errados é recusado', async () => {
    const project = seedProject();
    await expect(
      importProjectArchive(await archiveWithJson({ format: 'outro', version: 1, project })),
    ).rejects.toMatchObject({ code: 'archive-invalid' });
    await expect(
      importProjectArchive(await archiveWithJson({ format: 'capcut-web-project', version: 2, project })),
    ).rejects.toMatchObject({ code: 'archive-invalid' });
  });

  it('projeto com campos faltando é recusado sem gravar nada', async () => {
    const before = memory.projects.size;
    const broken = { format: 'capcut-web-project', version: 1, project: { id: 'x', name: 'sem trilhas' } };
    await expect(importProjectArchive(await archiveWithJson(broken))).rejects.toMatchObject({
      code: 'archive-invalid',
    });
    expect(memory.projects.size).toBe(before);
  });

  it('asset com caminho inseguro é recusado e nada é gravado', async () => {
    const project = seedProject();
    const unsafe = { ...project, assets: [{ ...project.assets[0]!, id: '../fora' }] };
    const before = memory.projects.size;
    await expect(
      importProjectArchive(await archiveWithJson({ format: 'capcut-web-project', version: 1, project: unsafe })),
    ).rejects.toMatchObject({ code: 'archive-invalid' });
    expect(memory.projects.size).toBe(before);
    expect(memory.files.size).toBe(4);
  });
});
