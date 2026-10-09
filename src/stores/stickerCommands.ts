// Comandos de figurinhas: adicionar uma do catálogo na linha do tempo e importar um arquivo próprio como sticker.
import type { Asset, Clip, Project, Track } from '@/types';
import { defaultTransform } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createClipFromAsset } from '@/engine/timeline/clipFactory';
import { placeClip, addTrack } from '@/engine/timeline/trackOps';
import { findSticker } from '@/engine/stickers/stickerCatalog';
import { rasterizeSvg } from '@/engine/stickers/rasterizeSvg';
import { scheduleSave } from './projectPersistence';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { selectClip } from './timelineCommands';
import { useTimelineStore } from './timelineStore';

/** Duração padrão de uma figurinha na linha do tempo, em ms. */
const STICKER_DURATION_MS = 3000;

/** Escala padrão de uma figurinha na tela (fração do tamanho original). */
const STICKER_SCALE = 0.35;

/** Tipos de arquivo aceitos como figurinha própria. */
const CUSTOM_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

/** Acha o asset de figurinha do catálogo já presente no projeto, se houver. */
function findStickerAsset(project: Project, stickerId: string): Asset | undefined {
  return project.assets.find((a) => a.kind === 'sticker' && a.name === stickerId);
}

/** Importa o arquivo pela fila e marca o asset novo como figurinha com o nome dado; devolve o asset ou null. */
async function importAsSticker(file: File, name: string): Promise<Asset | null> {
  const store = useProjectStore.getState();
  const before = new Set(store.project?.assets.map((a) => a.id));
  await store.importFiles([file]);
  const current = useProjectStore.getState();
  const project = current.project;
  if (project === null) return null;
  const imported = project.assets.find((a) => !before.has(a.id) && a.name === file.name);
  if (imported === undefined) return null;
  const next: Project = {
    ...project,
    updatedAt: Date.now(),
    assets: project.assets.map((a) => (a.id === imported.id ? { ...a, kind: 'sticker' as const, name } : a)),
  };
  current.setProject(next);
  scheduleSave(next);
  return { ...imported, kind: 'sticker', name };
}

/** Diz se a trilha é de figurinha, não travada, e sem clipe que cruze o intervalo de uma figurinha que começa em startMs. */
function isFreeStickerTrack(track: Track, startMs: number): boolean {
  const endMs = startMs + STICKER_DURATION_MS;
  return (
    track.kind === 'sticker' &&
    !track.locked &&
    track.clips.every((clip) => clip.startMs + clip.durationMs <= startMs || clip.startMs >= endMs)
  );
}

/** Acha uma trilha de figurinha desbloqueada que esteja livre no intervalo; devolve o id ou null. */
function freeStickerTrack(tracks: Track[], startMs: number): string | null {
  return tracks.find((track) => isFreeStickerTrack(track, startMs))?.id ?? null;
}

/** Põe a figurinha na trilha preferida se ela estiver livre; senão numa trilha livre, ou numa trilha nova no topo. Devolve as trilhas e o clipe. */
function placeSticker(
  tracks: Track[],
  asset: Asset,
  startMs: number,
  preferredTrackId?: string,
): { tracks: Track[]; clip: Clip } {
  const preferred = tracks.find((track) => track.id === preferredTrackId);
  const existing =
    preferred !== undefined && isFreeStickerTrack(preferred, startMs) ? preferred.id : freeStickerTrack(tracks, startMs);
  const added =
    existing === null
      ? addTrack(tracks, 'sticker', 0, t.timeline.trackKinds.sticker)
      : { tracks, trackId: existing };
  const base = createClipFromAsset(asset, added.trackId, startMs);
  const clip: Clip = {
    ...base,
    durationMs: STICKER_DURATION_MS,
    transform: { ...defaultTransform(), scaleX: STICKER_SCALE, scaleY: STICKER_SCALE },
  };
  return { tracks: placeClip(added.tracks, clip, added.trackId, startMs, 'overwrite'), clip };
}

/** Põe um asset de figurinha já importado na linha do tempo, em atMs (ou no cursor), na trilha preferida se estiver livre; devolve o id do clipe ou null. */
export function placeStickerAsset(assetId: string, atMs?: number, trackId?: string): string | null {
  const startMs = Math.max(0, Math.round(atMs ?? usePlaybackStore.getState().currentTimeMs));
  const placedRef: { clipId: string | null } = { clipId: null };
  useTimelineStore.getState().edit('add-sticker', (tracks) => {
    const target = useProjectStore.getState().project?.assets.find((a) => a.id === assetId);
    if (target === undefined) return tracks;
    const placed = placeSticker(tracks, target, startMs, trackId);
    placedRef.clipId = placed.clip.id;
    return placed.tracks;
  });
  const clipId = placedRef.clipId;
  if (clipId !== null) selectClip(clipId, false);
  return clipId;
}

/** Importações de figurinhas do catálogo em andamento, por id: cliques seguidos reaproveitam o mesmo asset. */
const pendingImports = new Map<string, Promise<Asset | null>>();

/** Rasteriza e importa a figurinha do catálogo uma única vez enquanto a importação está em andamento. */
function importCatalogSticker(stickerId: string, svg: string): Promise<Asset | null> {
  const running = pendingImports.get(stickerId);
  if (running !== undefined) return running;
  const started = (async () => {
    const png = await rasterizeSvg(svg);
    return importAsSticker(new File([png], `${stickerId}.png`, { type: 'image/png' }), stickerId);
  })().finally(() => pendingImports.delete(stickerId));
  pendingImports.set(stickerId, started);
  return started;
}

/** Adiciona uma figurinha do catálogo ao projeto e à linha do tempo no cursor (ou em atMs, na trilha dada se livre); devolve o id do clipe ou null. */
export async function addSticker(stickerId: string, atMs?: number, trackId?: string): Promise<string | null> {
  const sticker = findSticker(stickerId);
  const project = useProjectStore.getState().project;
  if (sticker === undefined || project === null) return null;

  let asset = findStickerAsset(project, stickerId);
  if (asset === undefined) {
    const imported = await importCatalogSticker(stickerId, sticker.svg());
    if (imported === null) return null;
    asset = imported;
  }

  return placeStickerAsset(asset.id, atMs, trackId);
}

/** Importa um arquivo próprio (PNG, GIF, WebP ou SVG) como figurinha; SVG é rasterizado antes. Devolve o id do asset ou null. */
export async function importCustomSticker(file: File): Promise<string | null> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  if (!isSvg && !CUSTOM_TYPES.includes(file.type)) return null;
  const source = isSvg
    ? new File([await rasterizeSvg(await file.text())], `${file.name.replace(/\.svg$/i, '')}.png`, { type: 'image/png' })
    : file;
  const imported = await importAsSticker(source, file.name);
  return imported?.id ?? null;
}
