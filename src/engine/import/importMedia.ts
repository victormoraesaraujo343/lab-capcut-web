// Importação de um arquivo de mídia: grava no OPFS, lê metadados, gera miniaturas e forma de onda.

import { animatedMimeOf, probeAnimation } from '@/engine/decode/animatedImage';
import { MediaImportError } from '@/engine/decode/errors';
import { detectAssetKind, type ImportableKind } from '@/engine/decode/mediaKind';
import { readMediaMetadata } from '@/engine/decode/metadata';
import { generateThumbnails, generateWaveform } from '@/engine/decode/mediaWorkerClient';
import { createId } from '@/engine/project/createProject';
import { StorageError, deleteEntry, writeFile } from '@/engine/storage/opfs';
import { fileExtension, mediaPath, thumbDir } from '@/engine/storage/paths';
import type { Asset } from '@/types';

/** Códigos de erro mostrados ao usuário quando uma importação falha. */
export type ImportErrorCode =
  | 'unsupported'
  | 'decode'
  | 'timeout'
  | 'quota'
  | 'unavailable'
  | 'notFound'
  | 'generic';

/** Extensões usadas quando o nome do arquivo não traz uma, indexadas pelo subtipo do MIME. */
const MIME_SUBTYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  quicktime: 'mov',
  jpeg: 'jpg',
  mpeg: 'mp3',
  wave: 'wav',
  'x-wav': 'wav',
  'x-m4a': 'm4a',
  'x-m4v': 'm4v',
};

/** Converte um erro capturado no código exibido na lista de erros de importação. */
export function toImportErrorCode(err: unknown): ImportErrorCode {
  if (err instanceof MediaImportError) return err.code;
  if (err instanceof StorageError) return err.code;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'quota';
  }
  return 'generic';
}

/** Descobre a extensão do arquivo pelo nome ou, na falta dela, pelo MIME. */
function extensionFor(file: File): string {
  const fromName = fileExtension(file.name);
  if (fromName !== '') return fromName;
  const subtype = (file.type.split(';')[0] ?? '').split('/')[1]?.trim().toLowerCase() ?? '';
  return MIME_SUBTYPE_EXTENSIONS[subtype] ?? (subtype !== '' ? subtype : 'bin');
}

/** Gera a forma de onda; devolve undefined em vez de falhar a importação inteira. */
async function tryWaveform(file: File): Promise<number[] | undefined> {
  try {
    const peaks = await generateWaveform(file);
    return peaks.length > 0 ? peaks : undefined;
  } catch {
    return undefined;
  }
}

/** Duração de um ciclo de GIF/WebP animado em ms; undefined para imagem parada ou se a medição falhar. */
async function animationCycleMs(kind: ImportableKind, file: File): Promise<number | undefined> {
  if (kind !== 'image') return undefined;
  const mimeType = animatedMimeOf(file.type, file.name);
  if (mimeType === null) return undefined;
  try {
    const timing = await probeAnimation(file, mimeType);
    return timing === null ? undefined : timing.totalMs;
  } catch {
    return undefined;
  }
}

/** Apaga a mídia e as miniaturas gravadas de um asset; ignora falhas para não esconder o erro original. */
async function removeImportedFiles(projectId: string, assetId: string, mediaFile: string): Promise<void> {
  try {
    await deleteEntry(mediaFile);
    await deleteEntry(thumbDir(projectId, assetId));
  } catch {
    // A falha de limpeza não deve substituir o erro que causou a reversão.
  }
}

/** Monta as miniaturas e a forma de onda conforme o tipo de mídia. */
async function buildVisuals(
  kind: ImportableKind,
  file: File,
  durationMs: number | undefined,
  projectId: string,
  assetId: string,
  opfsPath: string,
): Promise<{ thumbnails: string[]; waveform?: number[] }> {
  if (kind === 'image') return { thumbnails: [opfsPath] };
  if (kind === 'audio') return { thumbnails: [], waveform: await tryWaveform(file) };
  const thumbnails = await generateThumbnails(file, durationMs ?? 0, thumbDir(projectId, assetId));
  const waveform = await tryWaveform(file);
  return { thumbnails, waveform };
}

/** Importa um arquivo para o projeto e devolve o asset pronto; em falha, apaga o que foi gravado e relança o erro. */
export async function importOneFile(projectId: string, file: File): Promise<Asset> {
  const kind = detectAssetKind(file);
  if (kind === null) throw new MediaImportError('unsupported');

  const assetId = createId();
  const opfsPath = mediaPath(projectId, assetId, extensionFor(file));
  await writeFile(opfsPath, file);

  try {
    const metadata = await readMediaMetadata(file, kind);
    const visuals = await buildVisuals(kind, file, metadata.durationMs, projectId, assetId, opfsPath);
    const cycleMs = await animationCycleMs(kind, file);
    const asset: Asset = {
      id: assetId,
      kind,
      name: file.name,
      mimeType: file.type,
      opfsPath,
      sizeBytes: file.size,
      durationMs: metadata.durationMs ?? cycleMs,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      thumbnails: visuals.thumbnails,
      waveform: visuals.waveform,
      createdAt: Date.now(),
    };
    return asset;
  } catch (error) {
    await removeImportedFiles(projectId, assetId, opfsPath);
    throw error;
  }
}
