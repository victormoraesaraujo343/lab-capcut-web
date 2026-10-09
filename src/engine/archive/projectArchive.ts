// Exporta um projeto como .zip (project.json, mídia e miniaturas) e importa esse .zip como projeto novo.

import { t } from '@/i18n/pt-BR';
import { createId } from '@/engine/project/createProject';
import { getProject, saveProject } from '@/engine/storage/db';
import { deleteEntry, readFile, StorageError, writeFile } from '@/engine/storage/opfs';
import { fileExtension, projectDir, thumbDir } from '@/engine/storage/paths';
import type { Asset, Project } from '@/types';
import { ArchiveError, readZip } from './zipReader';
import { createZip, type ZipEntry } from './zipWriter';

/** Nome do JSON do projeto dentro do .zip. */
const PROJECT_ENTRY = 'capcut-web-project.json';
/** Valor do campo 'format' que identifica o arquivo como projeto do editor. */
const FORMAT = 'capcut-web-project';
/** Versão do formato do .zip. */
const FORMAT_VERSION = 1;
/** Nome seguro para pastas e arquivos no OPFS: sem barras e sem '.' ou '..'. */
const SAFE_SEGMENT = /^[\w.-]{1,200}$/;

/** Monta o .zip de um projeto salvo; mídia que falta no OPFS é pulada e listada em onMissing. */
export async function exportProjectArchive(
  projectId: string,
  onProgress?: (fraction: number) => void,
  onMissing?: (paths: string[]) => void,
): Promise<Blob> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`);
  const body = JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, project });
  const entries: ZipEntry[] = [{ name: PROJECT_ENTRY, data: new Blob([body], { type: 'application/json' }) }];
  const missing: string[] = [];
  for (const asset of project.assets) {
    await addOptionalFile(entries, missing, asset.opfsPath, mediaEntryName(asset.id, asset.opfsPath));
    for (const [index, thumbnail] of asset.thumbnails.entries()) {
      const name = `thumbs/${asset.id}/${thumbFileName(index, thumbnail)}`;
      await addOptionalFile(entries, missing, thumbnail, name);
    }
  }
  if (missing.length > 0) onMissing?.(missing);
  return createZip(entries, onProgress);
}

/** Lê um .zip do editor, cria um projeto novo com id novo e grava a mídia no OPFS; devolve o id. */
export async function importProjectArchive(file: Blob): Promise<string> {
  const files = await readZip(file);
  const json = files.get(PROJECT_ENTRY);
  if (json === undefined) throw new ArchiveError('archive-invalid');
  const source = parseArchiveProject(new TextDecoder().decode(await json.arrayBuffer()));
  const newId = createId();
  try {
    const assets: Asset[] = [];
    for (const asset of source.assets) {
      assets.push(await restoreAsset(asset, newId, files));
    }
    const now = Date.now();
    const name = `${source.name.trim() === '' ? t.home.untitled : source.name} ${t.archive.importedSuffix}`;
    await saveProject({ ...source, id: newId, name, createdAt: now, updatedAt: now, assets });
  } catch (error) {
    await deleteEntry(projectDir(newId)).catch(() => undefined);
    throw error;
  }
  return newId;
}

/** Lê o arquivo do OPFS e o acrescenta ao zip; se não existir, anota o caminho em missing. */
async function addOptionalFile(entries: ZipEntry[], missing: string[], path: string, name: string): Promise<void> {
  try {
    entries.push({ name, data: await readFile(path) });
  } catch (error) {
    if (error instanceof StorageError && error.code === 'notFound') {
      missing.push(path);
      return;
    }
    throw error;
  }
}

/** Nome da mídia dentro do zip: media/<id do asset>/<nome do arquivo no OPFS>. */
function mediaEntryName(assetId: string, opfsPath: string): string {
  return `media/${assetId}/${baseName(opfsPath)}`;
}

/** Nome da miniatura dentro da pasta do asset: <índice>.<extensão>. */
function thumbFileName(index: number, path: string): string {
  const extension = fileExtension(path);
  return `${index}.${/^[a-z0-9]{1,8}$/.test(extension) ? extension : 'jpg'}`;
}

/** Último segmento de um caminho com '/'. */
function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Copia a mídia e as miniaturas de um asset para os caminhos do projeto novo; devolve o asset reescrito. */
async function restoreAsset(asset: Asset, newId: string, files: Map<string, Blob>): Promise<Asset> {
  const mediaName = baseName(asset.opfsPath);
  const opfsPath = `${projectDir(newId)}/media/${mediaName}`;
  const media = files.get(`media/${asset.id}/${mediaName}`);
  if (media !== undefined) {
    await writeFile(opfsPath, media);
  }
  const thumbnails: string[] = [];
  for (const [index, thumbnail] of asset.thumbnails.entries()) {
    const name = thumbFileName(index, thumbnail);
    const bytes = files.get(`thumbs/${asset.id}/${name}`);
    if (bytes === undefined) continue;
    const path = `${thumbDir(newId, asset.id)}/${name}`;
    await writeFile(path, bytes);
    thumbnails.push(path);
  }
  return { ...asset, opfsPath, thumbnails };
}

/** Lê o JSON do .zip e confere se é um projeto do editor; senão lança 'archive-invalid'. */
function parseArchiveProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ArchiveError('archive-invalid');
  }
  if (!isRecord(data) || data.format !== FORMAT || data.version !== FORMAT_VERSION) {
    throw new ArchiveError('archive-invalid');
  }
  const project = data.project;
  if (!isProject(project)) {
    throw new ArchiveError('archive-invalid');
  }
  return project;
}

/** Confere a forma dos campos do projeto que o editor usa logo na abertura. */
function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  return (
    isSafeSegment(value.id) &&
    isString(value.name) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    isNumber(value.fps) &&
    isNumber(value.durationMs) &&
    isNumber(value.createdAt) &&
    isNumber(value.updatedAt) &&
    isArrayOf(value.tracks, isTrack) &&
    isArrayOf(value.assets, isAsset) &&
    isArrayOf(value.folders, isRecord) &&
    isArrayOf(value.markers, isNumber)
  );
}

/** Confere a forma de uma trilha e dos clipes dela. */
function isTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.kind) &&
    isString(value.name) &&
    isArrayOf(value.clips, isClip)
  );
}

/** Confere os campos de posição e duração de um clipe. */
function isClip(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.trackId) &&
    isNumber(value.startMs) &&
    isNumber(value.durationMs)
  );
}

/** Confere um asset e os nomes que ele usa como pastas e arquivos no OPFS. */
function isAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSafeSegment(value.id) &&
    isString(value.kind) &&
    isString(value.name) &&
    isString(value.opfsPath) &&
    isSafeSegment(baseName(value.opfsPath)) &&
    isArrayOf(value.thumbnails, isString)
  );
}

/** Diz se o valor é um objeto simples (não nulo e não array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Diz se o valor é uma string. */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Diz se o valor é um número finito. */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Diz se o valor é uma string usável como nome de pasta ou arquivo. */
function isSafeSegment(value: unknown): value is string {
  return typeof value === 'string' && SAFE_SEGMENT.test(value) && value !== '.' && value !== '..';
}

/** Diz se o valor é array e todos os itens passam pelo teste dado. */
function isArrayOf(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && (value as unknown[]).every(test);
}
