// Comandos de alto nível da timeline: cada um calcula a edição com as funções puras e a aplica via timelineStore.edit.
import type { Asset, Track } from '@/types';
import { defaultTransform, type Transform } from '@/types';
import { t } from '@/i18n/pt-BR';
import {
  findClip,
  splitAt,
  trimClipEnd,
  trimClipStart,
  trimToTime,
  updateClip,
} from '@/engine/timeline/clipOps';
import { createClipFromAsset, trackKindForAsset } from '@/engine/timeline/clipFactory';
import { findEdge } from '@/engine/timeline/snap';
import {
  copyClips,
  duplicateClips,
  expandWithGroups,
  groupClips,
  pasteClips,
  ungroupClips,
  type ClipboardData,
} from '@/engine/timeline/selectionOps';
import { addTrack, deleteClips, moveClips, placeClip, pruneEmptyTracks, setTrackFlag } from '@/engine/timeline/trackOps';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Flag de trilha que pode ser alternada. */
type TrackFlag = 'muted' | 'locked' | 'hidden';

/** Modo de colocação de clipe: sobrescrever ou inserir empurrando o que vem depois. */
type PlaceMode = 'overwrite' | 'insert';

/** Resultado de um comando: trilhas novas e, opcionalmente, a nova seleção. */
interface EditResult {
  /** Trilhas depois do comando. */
  tracks: Track[];
  /** Nova seleção, aplicada só se as trilhas mudarem. */
  selection?: string[];
}

/** Calcula uma edição a partir das trilhas atuais e a aplica pelo timelineStore. */
function runEdit(label: string, run: (tracks: Track[]) => EditResult): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const result = run(project.tracks);
  useTimelineStore.getState().edit(label, () => result.tracks, result.selection);
}

/** Ids dos clipes selecionados agora. */
function selectedIds(): string[] {
  return useTimelineStore.getState().selectedClipIds;
}

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Posição atual do cursor, em ms. */
function playhead(): number {
  return usePlaybackStore.getState().currentTimeMs;
}

/** Remove clipes dados, com ou sem ripple, e limpa a seleção. */
function removeClipsEdit(label: string, ids: string[], ripple: boolean): void {
  runEdit(label, (tracks) => {
    if (ids.length === 0) return { tracks };
    return { tracks: pruneEmptyTracks(deleteClips(tracks, ids, ripple)), selection: [] };
  });
}

/** Coloca um clipe novo do asset na trilha dada e seleciona-o. */
function placeNewClip(
  tracks: Track[],
  asset: Asset,
  trackId: string,
  startMs: number,
  mode: PlaceMode,
): EditResult {
  const clip = createClipFromAsset(asset, trackId, startMs);
  return { tracks: placeClip(tracks, clip, trackId, startMs, mode), selection: [clip.id] };
}

/** Divide os clipes selecionados (com grupos) que contêm o cursor; sem seleção, divide todos sob o cursor. */
export function splitAtPlayhead(): void {
  const at = playhead();
  runEdit('split', (tracks) => {
    const ids = selectedIds();
    const targets = ids.length > 0 ? expandWithGroups(tracks, ids) : undefined;
    return { tracks: splitAt(tracks, at, targets) };
  });
}

/** Divide o clipe dado (com seu grupo) no instante informado, como a lâmina. */
export function splitClipAtTime(clipId: string, atMs: number): void {
  runEdit('split', (tracks) => ({
    tracks: splitAt(tracks, atMs, expandWithGroups(tracks, [clipId])),
  }));
}

/** Apaga os clipes selecionados (com grupos), opcionalmente com ripple. */
export function deleteSelected(ripple: boolean): void {
  removeClipsEdit('delete', expandWithGroups(currentTracks(), selectedIds()), ripple);
}

/** Duplica os clipes selecionados (com grupos) e seleciona as cópias. */
export function duplicateSelected(): void {
  runEdit('duplicate', (tracks) => {
    const ids = expandWithGroups(tracks, selectedIds());
    if (ids.length === 0) return { tracks };
    const result = duplicateClips(tracks, ids);
    return { tracks: result.tracks, selection: result.newIds };
  });
}

/** Copia os clipes selecionados (com grupos) para a área de transferência. */
export function copySelected(): void {
  const tracks = currentTracks();
  const data = copyClips(tracks, expandWithGroups(tracks, selectedIds()));
  if (data !== null) useTimelineStore.getState().setClipboard(data);
}

/** Recorta os clipes selecionados: copia e apaga sem ripple, só se houver o que copiar. */
export function cutSelected(): void {
  const tracks = currentTracks();
  const ids = expandWithGroups(tracks, selectedIds());
  const data: ClipboardData | null = copyClips(tracks, ids);
  if (data === null) return;
  useTimelineStore.getState().setClipboard(data);
  removeClipsEdit('cut', ids, false);
}

/** Cola a área de transferência no cursor e seleciona os clipes colados. */
export function pasteAtPlayhead(): void {
  const data = useTimelineStore.getState().clipboard;
  if (data === null) return;
  const at = playhead();
  runEdit('paste', (tracks) => {
    const result = pasteClips(tracks, data, at);
    return { tracks: result.tracks, selection: result.newIds };
  });
}

/** Corta o começo ou o fim dos clipes selecionados (com grupos) até o cursor. */
export function trimSelectedToPlayhead(side: 'start' | 'end'): void {
  const at = playhead();
  runEdit('trim', (tracks) => ({
    tracks: trimToTime(tracks, expandWithGroups(tracks, selectedIds()), at, side),
  }));
}

/** Agrupa os clipes selecionados. */
export function groupSelected(): void {
  runEdit('group', (tracks) => ({ tracks: groupClips(tracks, selectedIds()) }));
}

/** Desfaz o agrupamento dos clipes selecionados. */
export function ungroupSelected(): void {
  runEdit('ungroup', (tracks) => ({ tracks: ungroupClips(tracks, selectedIds()) }));
}

/** Seleciona todos os clipes de todas as trilhas. */
export function selectAll(): void {
  useTimelineStore.getState().selectClips(currentTracks().flatMap((t) => t.clips.map((c) => c.id)));
}

/** Leva o cursor à borda de clipe anterior ('prev') ou seguinte ('next'), se existir. */
export function goToEdge(direction: 'prev' | 'next'): void {
  const edge = findEdge(currentTracks(), playhead(), direction);
  if (edge !== null) usePlaybackStore.getState().seek(edge);
}

/** Leva o cursor ao início da timeline. */
export function goToStart(): void {
  usePlaybackStore.getState().seek(0);
}

/** Leva o cursor ao fim do projeto. */
export function goToEnd(): void {
  const project = useProjectStore.getState().project;
  if (project !== null) usePlaybackStore.getState().seek(project.durationMs);
}

/** Adiciona um clipe do asset na timeline; sem trilha, usa a primeira compatível e livre ou cria uma nova. */
export function addAssetToTimeline(
  assetId: string,
  trackId: string | null,
  startMs: number,
  mode: PlaceMode,
): void {
  const asset = useProjectStore.getState().project?.assets.find((a) => a.id === assetId);
  if (asset === undefined) return;
  const kind = trackKindForAsset(asset.kind);
  runEdit('add', (tracks) => {
    const existing =
      trackId === null
        ? tracks.find((t) => t.kind === kind && !t.locked)
        : tracks.find((t) => t.id === trackId && t.kind === kind);
    if (existing === undefined) {
      const added = addTrack(tracks, kind, undefined, t.timeline.trackKinds[kind]);
      return placeNewClip(added.tracks, asset, added.trackId, startMs, mode);
    }
    if (existing.locked) return { tracks };
    return placeNewClip(tracks, asset, existing.id, startMs, mode);
  });
}

/** Cria uma trilha nova do tipo do asset e põe o clipe nela. Áudio vai ao fim; vídeo e sticker ficam acima da principal (índice 0). */
export function addAssetToNewTrack(assetId: string, startMs: number): void {
  const asset = useProjectStore.getState().project?.assets.find((a) => a.id === assetId);
  if (asset === undefined) return;
  const kind = trackKindForAsset(asset.kind);
  const index = kind === 'audio' ? undefined : 0;
  runEdit('add', (tracks) => {
    const added = addTrack(tracks, kind, index, t.timeline.trackKinds[kind]);
    return placeNewClip(added.tracks, asset, added.trackId, startMs, 'overwrite');
  });
}

/** Move os clipes selecionados (com grupos) no tempo e entre trilhas. */
export function moveSelected(deltaMs: number, trackDelta: number, mode: PlaceMode): void {
  runEdit('move', (tracks) => ({
    tracks: moveClips(tracks, expandWithGroups(tracks, selectedIds()), deltaMs, trackDelta, mode),
  }));
}

/** Ajusta a borda inicial ('start') ou final ('end') de um clipe até o instante, respeitando a mídia. */
export function trimClip(clipId: string, edge: 'start' | 'end', toMs: number): void {
  const project = useProjectStore.getState().project;
  const assetId = findClip(currentTracks(), clipId)?.clip.assetId;
  const durationMs = project?.assets.find((a) => a.id === assetId)?.durationMs;
  runEdit('trim', (tracks) => ({
    tracks:
      edge === 'start'
        ? trimClipStart(tracks, clipId, toMs, durationMs)
        : trimClipEnd(tracks, clipId, toMs, durationMs),
  }));
}

/** Alterna uma flag da trilha (mudo, travada ou oculta). */
export function toggleTrackFlag(trackId: string, flag: TrackFlag): void {
  runEdit(`toggle-${flag}`, (tracks) => {
    const track = tracks.find((t) => t.id === trackId);
    if (track === undefined) return { tracks };
    return { tracks: setTrackFlag(tracks, trackId, flag, !track[flag]) };
  });
}

/** Seleciona um clipe com seu grupo; com additive, soma à seleção atual em vez de substituí-la. */
export function selectClip(id: string, additive: boolean): void {
  const ids = expandWithGroups(currentTracks(), [id]);
  const store = useTimelineStore.getState();
  store.selectClips(additive ? [...new Set([...store.selectedClipIds, ...ids])] : ids);
}

/** Campos de transformação a alterar; o recorte pode vir parcial e é mesclado com o atual. */
export type TransformPatch = Partial<Omit<Transform, 'crop'>> & { crop?: Partial<Transform['crop']> };

/** Troca a transformação inteira de um clipe, em um passo de histórico. */
export function setClipTransform(clipId: string, transform: Transform, label = 'transform'): void {
  runEdit(label, (tracks) => ({
    tracks: updateClip(tracks, clipId, (c) => ({ ...c, transform })),
  }));
}

/** Mescla campos na transformação de um clipe, em um passo de histórico. */
export function patchClipTransform(clipId: string, patch: TransformPatch): void {
  runEdit('transform', (tracks) => ({
    tracks: updateClip(tracks, clipId, (c) => ({
      ...c,
      transform: {
        ...c.transform,
        ...patch,
        crop: { ...c.transform.crop, ...patch.crop },
      },
    })),
  }));
}

/** Volta a transformação de um clipe aos valores padrão, em um passo de histórico. */
export function resetClipTransform(clipId: string): void {
  runEdit('reset-transform', (tracks) => ({
    tracks: updateClip(tracks, clipId, (c) => ({ ...c, transform: defaultTransform() })),
  }));
}
