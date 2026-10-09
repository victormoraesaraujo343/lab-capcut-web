import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/engine/project/createProject';
import { getProject, resetDbForTests } from '@/engine/storage/db';
import {
  clearOpenMarker,
  clearSnapshot,
  findRecovery,
  getSnapshot,
  hasOpenMarker,
  saveSnapshot,
  setOpenMarker,
  shouldOfferRecovery,
} from '@/engine/storage/recovery';
import type { Project } from '@/types';

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

/** Cria o banco na versão 1 (antes do store de recuperação) com um projeto salvo, como ele estava antes da migração. */
function createLegacyDatabase(project: Project): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('capcut-web', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('projects', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Projeto de teste com a data de alteração dada. */
function projectAt(updatedAt: number): Project {
  return { ...createProject('Teste'), updatedAt };
}

describe('recovery', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetDbForTests();
    await deleteDatabase();
  });

  it('oferece recuperação só quando a marca existe e o instantâneo é mais novo', () => {
    const saved = projectAt(1000);
    const newer = { ...saved, updatedAt: 2000 };
    const older = { ...saved, updatedAt: 500 };
    const snapshotOf = (project: Project) => ({ projectId: saved.id, savedAt: 0, project });

    expect(shouldOfferRecovery(saved, snapshotOf(newer), false)).toBe(false);
    expect(shouldOfferRecovery(saved, undefined, true)).toBe(false);
    expect(shouldOfferRecovery(saved, snapshotOf(older), true)).toBe(false);
    expect(shouldOfferRecovery(saved, snapshotOf(saved), true)).toBe(false);
    expect(shouldOfferRecovery(saved, snapshotOf(newer), true)).toBe(true);
  });

  it('marca e desmarca a sessão aberta', () => {
    setOpenMarker('p1');
    expect(hasOpenMarker('p1')).toBe(true);
    clearOpenMarker('p1');
    expect(hasOpenMarker('p1')).toBe(false);
  });

  it('grava, lê e apaga o instantâneo do projeto', async () => {
    const project = projectAt(1000);
    await saveSnapshot(project);
    const snapshot = await getSnapshot(project.id);
    expect(snapshot?.project).toEqual(project);
    expect(snapshot?.projectId).toBe(project.id);

    await clearSnapshot(project.id);
    expect(await getSnapshot(project.id)).toBeUndefined();
  });

  it('findRecovery devolve o instantâneo mais novo só com a marca presente', async () => {
    const saved = projectAt(1000);
    await saveSnapshot({ ...saved, name: 'Mais novo', updatedAt: 3000 });

    expect((await findRecovery(saved, true))?.project.name).toBe('Mais novo');
    expect(await findRecovery(saved, false)).toBeNull();
  });

  it('migra o banco da versão 1 sem perder os projetos salvos', async () => {
    const legacy = projectAt(1000);
    await createLegacyDatabase(legacy);

    expect(await getProject(legacy.id)).toEqual(legacy);
    await saveSnapshot(legacy);
    expect((await getSnapshot(legacy.id))?.project).toEqual(legacy);
  });
});
