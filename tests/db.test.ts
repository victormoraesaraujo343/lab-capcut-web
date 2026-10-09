import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/engine/project/createProject';
import {
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  renameProjectInDb,
  resetDbForTests,
  saveProject,
} from '@/engine/storage/db';
import { copyDir, deleteEntry } from '@/engine/storage/opfs';
import type { Asset, Project } from '@/types';

vi.mock('@/engine/storage/opfs', () => ({
  deleteEntry: vi.fn(async () => undefined),
  copyDir: vi.fn(async () => undefined),
}));

/** Apaga o banco 'capcut-web' e espera a remoção terminar. */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('capcut-web');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Remoção do banco bloqueada'));
  });
}

/** Cria um asset de vídeo com caminhos OPFS dentro da pasta do projeto. */
function videoAsset(projectId: string, id: string): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `projects/${projectId}/media/${id}.mp4`,
    sizeBytes: 1024,
    thumbnails: [`projects/${projectId}/thumbs/${id}-0.jpg`, `projects/${projectId}/thumbs/${id}-1.jpg`],
    createdAt: 1,
  };
}

describe('db', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetDbForTests();
    await deleteDatabase();
  });

  it('salva e busca um projeto pelo id', async () => {
    const project = createProject('Meu vídeo');
    await saveProject(project);
    const found = await getProject(project.id);
    expect(found).toEqual(project);
  });

  it('retorna undefined para um id inexistente', async () => {
    expect(await getProject('nao-existe')).toBeUndefined();
  });

  it('lista os projetos do mais recente para o mais antigo', async () => {
    const older: Project = { ...createProject('Antigo'), updatedAt: 1000 };
    const newer: Project = { ...createProject('Novo'), updatedAt: 3000 };
    const middle: Project = { ...createProject('Meio'), updatedAt: 2000 };
    await saveProject(older);
    await saveProject(newer);
    await saveProject(middle);

    const names = (await listProjects()).map((summary) => summary.name);
    expect(names).toEqual(['Novo', 'Meio', 'Antigo']);
  });

  it('renomeia o projeto e atualiza updatedAt', async () => {
    const project: Project = { ...createProject('Original'), updatedAt: 1 };
    await saveProject(project);
    await renameProjectInDb(project.id, 'Renomeado');

    const found = await getProject(project.id);
    expect(found?.name).toBe('Renomeado');
    expect(found?.updatedAt).toBeGreaterThan(1);
  });

  it('remove o projeto do banco e apaga a pasta no OPFS', async () => {
    const project = createProject('Para apagar');
    await saveProject(project);
    await deleteProject(project.id);

    expect(await getProject(project.id)).toBeUndefined();
    expect(deleteEntry).toHaveBeenCalledWith(`projects/${project.id}`);
  });

  it('duplica o projeto com novo id, pasta copiada e caminhos reescritos', async () => {
    const base = createProject('Origem');
    const original: Project = { ...base, assets: [videoAsset(base.id, 'a1')] };
    await saveProject(original);

    const copy = await duplicateProject(original.id, 'Cópia');

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Cópia');
    expect(copyDir).toHaveBeenCalledWith(`projects/${original.id}`, `projects/${copy.id}`);

    const asset = copy.assets[0];
    expect(asset?.opfsPath).toBe(`projects/${copy.id}/media/a1.mp4`);
    expect(asset?.thumbnails).toEqual([
      `projects/${copy.id}/thumbs/a1-0.jpg`,
      `projects/${copy.id}/thumbs/a1-1.jpg`,
    ]);

    expect(await getProject(copy.id)).toEqual(copy);
    expect(await getProject(original.id)).toBeDefined();
  });
});
