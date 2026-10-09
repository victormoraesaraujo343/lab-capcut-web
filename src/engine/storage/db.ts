// Repositório de projetos no IndexedDB: guarda o JSON do projeto; a mídia fica no OPFS.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '@/types';
import { createId } from '@/engine/project/createProject';
import { copyDir, deleteEntry } from '@/engine/storage/opfs';
import { projectDir } from '@/engine/storage/paths';

const DB_NAME = 'capcut-web';
const DB_VERSION = 2;
const STORE = 'projects';
const RECOVERY_STORE = 'recovery';

/** Instantâneo de recuperação de um projeto, gravado pelo salvamento automático. */
export interface RecoverySnapshot {
  /** Identificador do projeto ao qual o instantâneo pertence. */
  projectId: string;
  /** Momento em que o instantâneo foi gravado, em timestamp (ms). */
  savedAt: number;
  /** Cópia completa do projeto no momento do instantâneo. */
  project: Project;
}

/** Esquema tipado do banco 'capcut-web'. */
interface CapcutDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { updatedAt: number };
  };
  recovery: {
    key: string;
    value: RecoverySnapshot;
  };
}

/** Resumo de um projeto para listas, sem o conteúdo completo. */
export interface ProjectSummary {
  /** Identificador do projeto. */
  id: string;
  /** Nome do projeto. */
  name: string;
  /** Data de criação em timestamp (ms). */
  createdAt: number;
  /** Data da última alteração em timestamp (ms). */
  updatedAt: number;
  /** Duração total em ms. */
  durationMs: number;
  /** Quantidade de assets na biblioteca. */
  assetCount: number;
  /** Miniatura de capa: primeiro thumbnail do primeiro asset de vídeo ou imagem. */
  coverPath?: string;
}

let dbPromise: Promise<IDBPDatabase<CapcutDB>> | undefined;

/** Retorna a conexão única com o banco, abrindo-a na primeira vez. */
function getDb(): Promise<IDBPDatabase<CapcutDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CapcutDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Cada bloco cria só o que falta para a versão anterior, sem tocar nos projetos já salvos.
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore(RECOVERY_STORE, { keyPath: 'projectId' });
        }
      },
    }).catch((error: unknown) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

/** Converte um projeto completo no resumo usado nas listas. */
export function toSummary(p: Project): ProjectSummary {
  const summary: ProjectSummary = {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    durationMs: p.durationMs,
    assetCount: p.assets.length,
  };
  const cover = p.assets.find((asset) => asset.kind === 'video' || asset.kind === 'image');
  const coverPath = cover?.thumbnails[0];
  if (coverPath !== undefined) summary.coverPath = coverPath;
  return summary;
}

/** Lista os resumos de todos os projetos, do mais recente para o mais antigo. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const projects = await db.getAllFromIndex(STORE, 'updatedAt');
  return projects.reverse().map(toSummary);
}

/** Busca um projeto pelo id, ou undefined se não existir. */
export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get(STORE, id);
}

/** Salva (cria ou substitui) um projeto no banco. */
export async function saveProject(p: Project): Promise<void> {
  const db = await getDb();
  await db.put(STORE, p);
}

/** Grava (ou substitui) o instantâneo de recuperação de um projeto. */
export async function putRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
  const db = await getDb();
  await db.put(RECOVERY_STORE, snapshot);
}

/** Lê o instantâneo de recuperação de um projeto, ou undefined se não houver. */
export async function getRecoverySnapshot(projectId: string): Promise<RecoverySnapshot | undefined> {
  const db = await getDb();
  return db.get(RECOVERY_STORE, projectId);
}

/** Apaga o instantâneo de recuperação de um projeto; não faz nada se não existir. */
export async function deleteRecoverySnapshot(projectId: string): Promise<void> {
  const db = await getDb();
  await db.delete(RECOVERY_STORE, projectId);
}

/** Remove o projeto do banco e apaga a pasta dele no OPFS. */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
  await deleteEntry(projectDir(id));
}

/** Duplica um projeto com novo id e nome, copiando a pasta de mídia e reescrevendo os caminhos. */
export async function duplicateProject(id: string, newName: string): Promise<Project> {
  const original = await getProject(id);
  if (!original) throw new Error(`Projeto não encontrado: ${id}`);

  const newId = createId();
  const oldPrefix = `${projectDir(id)}/`;
  const newPrefix = `${projectDir(newId)}/`;
  const rebase = (path: string): string =>
    path.startsWith(oldPrefix) ? `${newPrefix}${path.slice(oldPrefix.length)}` : path;

  await copyDir(projectDir(id), projectDir(newId));

  const now = Date.now();
  const copy: Project = {
    ...original,
    id: newId,
    name: newName,
    createdAt: now,
    updatedAt: now,
    assets: original.assets.map((asset) => ({
      ...asset,
      opfsPath: rebase(asset.opfsPath),
      thumbnails: asset.thumbnails.map(rebase),
    })),
  };
  await saveProject(copy);
  return copy;
}

/** Renomeia um projeto no banco e atualiza sua data de alteração. */
export async function renameProjectInDb(id: string, name: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const project = await tx.store.get(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);
  await tx.store.put({ ...project, name, updatedAt: Date.now() });
  await tx.done;
}

/** Zera a conexão cacheada e fecha a anterior, para os testes. */
export function resetDbForTests(): void {
  const previous = dbPromise;
  dbPromise = undefined;
  previous?.then((db) => db.close()).catch(() => undefined);
}
