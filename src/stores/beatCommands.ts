// Comandos de batidas: detecta as batidas do trecho de mídia de um clipe e grava os marcadores da linha do tempo.
import { detectAssetBeats } from '@/engine/audio/beatsClient';
import { clipMediaTime } from '@/engine/render/composition';
import type { Asset, Clip, Project } from '@/types';
import { scheduleSave } from './projectPersistence';
import { useProjectStore } from './projectStore';

/** Distância mínima entre dois marcadores; batidas mais próximas que isso não se repetem, em ms. */
const DUPLICATE_MARKER_MS = 30;
/** Sensibilidade padrão da detecção. */
const DEFAULT_SENSITIVITY = 0.5;
/** Diferença máxima, em ms, para considerar que o clipe não mudou durante a análise. */
const TIMING_TOLERANCE_MS = 0.5;

/** Resultado da detecção: quantas batidas caíram no clipe e o BPM estimado. */
export interface DetectBeatsResult {
  /** Batidas encontradas dentro do clipe. */
  count: number;
  /** BPM estimado, ou null. */
  bpm: number | null;
}

/** Resultado vazio, usado quando não há o que detectar. */
const NOTHING: DetectBeatsResult = { count: 0, bpm: null };

/**
 * Detecta as batidas do trecho de mídia que o clipe toca e acrescenta os marcadores na linha do tempo.
 * A conversão de tempo de mídia para linha do tempo é linear entre o início e o fim do trecho (velocidade média),
 * então clipes com curva de velocidade ficam aproximados pela média.
 */
export async function detectBeats(clipId: string, sensitivity: number = DEFAULT_SENSITIVITY): Promise<DetectBeatsResult> {
  const snapshot = findClipWithAsset(clipId);
  if (snapshot === null) return NOTHING;
  const { clip, asset } = snapshot;
  if (asset.kind !== 'audio' && asset.kind !== 'video') return NOTHING;
  if (!(clip.durationMs > 0)) return NOTHING;

  const mediaStart = clipMediaTime(clip, 0, asset.durationMs);
  const mediaEnd = clipMediaTime(clip, clip.durationMs, asset.durationMs);
  const span = mediaEnd - mediaStart;
  if (Math.abs(span) < 1) return NOTHING;

  const range = { startMs: Math.min(mediaStart, mediaEnd), endMs: Math.max(mediaStart, mediaEnd) };
  const detected = await detectAssetBeats(asset, range, sensitivity);
  if (detected === null) return NOTHING;

  const current = findClipWithAsset(clipId);
  if (current === null || !sameTiming(current.clip, clip)) return NOTHING;
  if (current.asset.id !== asset.id) return NOTHING;
  const timelineBeats = detected.onsetsMs
    .map((mediaMs) => clip.startMs + (clip.durationMs * (mediaMs - mediaStart)) / span)
    .filter((ms) => ms >= clip.startMs && ms <= clip.startMs + clip.durationMs);

  const project = useProjectStore.getState().project;
  if (project !== null) {
    const merged = mergeMarkers(project.markers, timelineBeats);
    if (merged.length !== project.markers.length || merged.some((ms, i) => ms !== project.markers[i])) {
      writeMarkers(project, merged);
    }
  }
  return { count: timelineBeats.length, bpm: detected.bpm };
}

/** Remove todos os marcadores da linha do tempo. */
export function clearMarkers(): void {
  const project = useProjectStore.getState().project;
  if (project === null || project.markers.length === 0) return;
  writeMarkers(project, []);
}

/** Remove o marcador exatamente no instante dado, em ms. */
export function removeMarker(ms: number): void {
  const project = useProjectStore.getState().project;
  if (project === null || !project.markers.includes(ms)) return;
  writeMarkers(project, project.markers.filter((marker) => marker !== ms));
}

/** Clipe com o asset dele no projeto aberto, ou null se não existir. */
function findClipWithAsset(clipId: string): { clip: Clip; asset: Asset } | null {
  const project = useProjectStore.getState().project;
  if (project === null) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip === undefined) continue;
    const asset = clip.assetId === undefined ? undefined : project.assets.find((item) => item.id === clip.assetId);
    return asset === undefined ? null : { clip, asset };
  }
  return null;
}

/** Diz se os dados de tempo do clipe continuam os mesmos depois da análise. */
function sameTiming(a: Clip, b: Clip): boolean {
  return (
    Math.abs(a.startMs - b.startMs) < TIMING_TOLERANCE_MS &&
    Math.abs(a.durationMs - b.durationMs) < TIMING_TOLERANCE_MS &&
    Math.abs(a.trimInMs - b.trimInMs) < TIMING_TOLERANCE_MS &&
    a.reversed === b.reversed &&
    a.speed.mode === b.speed.mode &&
    a.speed.value === b.speed.value
  );
}

/** Acrescenta as batidas aos marcadores, pulando as que ficam a 30 ms ou menos de outra; devolve a lista ordenada e arredondada. */
function mergeMarkers(existing: number[], incoming: number[]): number[] {
  const merged = [...existing];
  for (const ms of [...incoming].sort((a, b) => a - b)) {
    if (merged.some((marker) => Math.abs(marker - ms) <= DUPLICATE_MARKER_MS)) continue;
    merged.push(Math.round(ms));
  }
  return merged.sort((a, b) => a - b);
}

/** Grava a nova lista de marcadores no projeto aberto e agenda o salvamento. */
function writeMarkers(project: Project, markers: number[]): void {
  const next: Project = { ...project, markers, updatedAt: Date.now() };
  useProjectStore.getState().setProject(next);
  scheduleSave(next);
}
