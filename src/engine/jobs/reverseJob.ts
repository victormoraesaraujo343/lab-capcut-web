// Inverter um clipe: gera uma cópia invertida do trecho (vídeo e áudio) como asset novo e troca o clipe por ela.
// Tocar de trás para frente decodificando ao contrário é lento demais, por isso a cópia é gerada uma vez.

import { mixProjectAudio } from '@/engine/audio/offlineMix';
import { reverseChannels } from '@/engine/audio/reverseAudio';
import { muxAacWithFfmpeg } from '@/engine/export/ffmpegAacMux';
import { DEFAULT_EXPORT_SETTINGS } from '@/engine/export/exportSettings';
import { createId } from '@/engine/project/createProject';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { CANCELLED_MESSAGE, startExport, type ExportHandle } from '@/features/export/exportClient';
import { scheduleSave } from '@/stores/projectPersistence';
import { useJobsStore } from '@/stores/jobsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Clip, Project } from '@/types';
import type { ExportSettings, MixedAudio, ResolutionPreset } from '@/types/export';
import { buildForwardAudioProject, buildReverseProject } from './reverseProject';

/** Código de erro de uma inversão (a interface traduz). */
export type ReverseErrorCode = 'encode' | 'decode' | 'cancelled';

/** Falha de inversão já com código. */
class ReverseFailure extends Error {
  /** Código mostrado na interface. */
  readonly code: ReverseErrorCode;

  /** Cria a falha com o código dado. */
  constructor(code: ReverseErrorCode) {
    super(code);
    this.name = 'ReverseFailure';
    this.code = code;
  }
}

/** Janela do trecho na mídia original que a cópia invertida cobre (gravada no próprio asset). */
interface ReverseWindow {
  /** Início do trecho na mídia original, em ms. */
  trimInMs: number;
  /** Tamanho do trecho na mídia, em ms. */
  spanMs: number;
}

/** Predefinições de resolução e o lado menor de cada uma. */
const RESOLUTIONS: ReadonlyArray<{ preset: ResolutionPreset; shortSide: number }> = [
  { preset: '720p', shortSide: 720 },
  { preset: '1080p', shortSide: 1080 },
  { preset: '1440p', shortSide: 1440 },
  { preset: '4k', shortSide: 2160 },
];
/** Taxas de quadros que a exportação aceita. */
const FPS_OPTIONS: ReadonlyArray<24 | 30 | 60> = [24, 30, 60];
/** Taxa do AAC do áudio invertido, em kbps. */
const AAC_KBPS = 192;
/** Faixas do progresso total: áudio 0–0.1, vídeo 0.1–0.9, junção do áudio 0.9–1. */
const AUDIO_SPAN = 0.1;
const VIDEO_START = 0.1;
const VIDEO_SPAN = 0.8;
const MUX_START = 0.9;
const MUX_SPAN = 0.1;

/** Falha com código se o sinal de cancelamento já foi acionado. */
function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new ReverseFailure('cancelled');
}

/** Predefinição de resolução mais próxima do lado menor dado. */
function resolutionFor(shortSide: number): ResolutionPreset {
  let best: ResolutionPreset = '1080p';
  let bestDistance = Infinity;
  for (const option of RESOLUTIONS) {
    const distance = Math.abs(option.shortSide - shortSide);
    if (distance < bestDistance) {
      best = option.preset;
      bestDistance = distance;
    }
  }
  return best;
}

/** Taxa de quadros aceita pela exportação mais próxima da dada. */
function fpsFor(fps: number): 24 | 30 | 60 {
  let best: 24 | 30 | 60 = 30;
  let bestDistance = Infinity;
  for (const option of FPS_OPTIONS) {
    const distance = Math.abs(option - fps);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/** Configuração de exportação do MP4 invertido: resolução e fps do asset, bitrate alto. */
function exportSettingsFor(project: Project): ExportSettings {
  return {
    ...DEFAULT_EXPORT_SETTINGS,
    format: 'mp4',
    resolution: resolutionFor(Math.min(project.width, project.height)),
    fps: fpsFor(project.fps),
    bitrate: 'high',
    fileName: 'reverse',
  };
}

/** Mixa o áudio do trecho no sentido normal e inverte os canais; null se o trecho não tem som. */
async function reversedAudioFor(
  temp: Project,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<MixedAudio | null> {
  let mixed: MixedAudio | null;
  try {
    mixed = await mixProjectAudio(buildForwardAudioProject(temp), 0, temp.durationMs, { signal, onProgress });
  } catch {
    throwIfCancelled(signal);
    throw new ReverseFailure('decode');
  }
  if (mixed === null) return null;
  return { sampleRate: mixed.sampleRate, channels: reverseChannels(mixed.channels) };
}

/** Exporta o vídeo invertido (MP4 sem áudio) pelo cliente de exportação; keep recebe o controle para o cancelamento. */
async function renderReversedVideo(
  temp: Project,
  onProgress: (fraction: number) => void,
  keep: (handle: ExportHandle) => void,
): Promise<Blob> {
  const handle = startExport(temp, exportSettingsFor(temp), (update) =>
    onProgress(VIDEO_START + update.fraction * VIDEO_SPAN),
  );
  keep(handle);
  const result = await handle.result;
  return result.blob;
}

/** Junta o áudio invertido ao MP4 invertido com ffmpeg; cancelar aborta a junção. */
async function attachAudio(
  video: Blob,
  audio: MixedAudio,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<Blob> {
  const bytes = await muxAacWithFfmpeg(
    await video.arrayBuffer(),
    audio,
    AAC_KBPS,
    (fraction) => onProgress(MUX_START + fraction * MUX_SPAN),
    signal,
  );
  return new Blob([bytes], { type: 'video/mp4' });
}

/** Gera o MP4 invertido completo (vídeo e áudio) do projeto temporário. */
async function renderReversed(
  temp: Project,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
  keep: (handle: ExportHandle) => void,
): Promise<Blob> {
  const audio = await reversedAudioFor(temp, signal, (fraction) => onProgress(fraction * AUDIO_SPAN));
  throwIfCancelled(signal);
  const video = await renderReversedVideo(temp, onProgress, keep);
  if (audio === null) return video;
  throwIfCancelled(signal);
  return attachAudio(video, audio, signal, onProgress);
}

/** Marca um asset importado como gerado pela inversão, com a janela do trecho de origem, e salva o projeto. */
function markReversed(assetId: string, sourceAssetId: string, window: ReverseWindow): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const next: Project = {
    ...project,
    assets: project.assets.map((asset): Asset =>
      asset.id === assetId
        ? {
            ...asset,
            role: 'reversed',
            sourceAssetId,
            sourceTrimInMs: window.trimInMs,
            sourceSpanMs: window.spanMs,
          }
        : asset,
    ),
    updatedAt: Date.now(),
  };
  useProjectStore.setState({ project: next });
  scheduleSave(next);
}

/** Importa o arquivo invertido como asset novo, marcado com a origem e a janela do trecho, e devolve esse asset. */
async function importReversed(file: File, source: Asset, window: ReverseWindow): Promise<Asset> {
  const store = useProjectStore.getState();
  const before = new Set(store.project?.assets.map((asset) => asset.id) ?? []);
  await store.importFiles([file]);
  const created = useProjectStore.getState().project?.assets.find((asset) => !before.has(asset.id));
  if (created === undefined) throw new ReverseFailure('encode');
  markReversed(created.id, source.id, window);
  return created;
}

/** Volta o clipe ao asset original, com a janela de origem gravada no asset invertido, sem gerar nada. */
function restoreOriginal(clipId: string, reversed: Asset, project: Project): void {
  const source = project.assets.find((asset) => asset.id === reversed.sourceAssetId);
  if (source === undefined) return;
  const trimInMs = reversed.sourceTrimInMs ?? 0;
  const spanMs = reversed.sourceSpanMs ?? reversed.durationMs ?? 0;
  const trimOutMs = Math.max(0, (source.durationMs ?? 0) - trimInMs - spanMs);
  useTimelineStore.getState().edit('reverse', (tracks) =>
    updateClip(tracks, clipId, (c: Clip) => ({ ...c, assetId: source.id, trimInMs, trimOutMs, reversed: false })),
  );
}

/** Código de erro de uma falha qualquer da inversão. */
function toReverseCode(error: unknown): ReverseErrorCode {
  if (error instanceof ReverseFailure) return error.code;
  if (error instanceof Error && error.message === CANCELLED_MESSAGE) return 'cancelled';
  if (error instanceof Error && error.message === 'decode') return 'decode';
  return 'encode';
}

/** Troca o clipe pela cópia invertida do trecho, com trim 0 sobre ela, em um passo de histórico. */
function pointClipAtReversed(clipId: string, reversed: Asset): void {
  useTimelineStore.getState().edit('reverse', (tracks) =>
    updateClip(tracks, clipId, (c: Clip) => ({ ...c, assetId: reversed.id, trimInMs: 0, trimOutMs: 0, reversed: false })),
  );
}

/**
 * Inverte o clipe. Clipe de vídeo comum: gera a cópia invertida e troca o clipe por ela.
 * Clipe que já usa uma cópia invertida: volta ao original. Clipe com o sentido invertido só pela flag: vira o sentido normal.
 * Progresso e erros vão para o jobsStore (códigos: encode, decode, cancelled).
 */
export async function runReverseJob(clipId: string): Promise<void> {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const found = findClip(project.tracks, clipId);
  if (!found || found.track.locked) return;
  const { clip } = found;
  const asset = project.assets.find((a) => a.id === clip.assetId);
  if (asset === undefined) return;
  if (asset.role === 'reversed') {
    restoreOriginal(clipId, asset, project);
    return;
  }
  if (clip.reversed) {
    useTimelineStore.getState().edit('reverse', (tracks) =>
      updateClip(tracks, clipId, (c: Clip) => ({ ...c, reversed: false })),
    );
    return;
  }
  if (asset.kind !== 'video' || asset.role !== undefined || clip.freezeFrameMs !== undefined) return;
  if (clip.text !== undefined || clip.shape !== undefined) return;

  const jobs = useJobsStore.getState();
  const jobId = createId();
  const controller = new AbortController();
  let handle: ExportHandle | null = null;
  const cancel = (): void => {
    controller.abort();
    handle?.cancel();
  };
  jobs.start({ id: jobId, kind: 'reverse', clipId, cancel });
  const report = (fraction: number): void => jobs.update(jobId, fraction);
  try {
    const temp = buildReverseProject(project, clip, asset);
    const file = await renderReversed(temp, controller.signal, report, (h) => {
      handle = h;
    });
    throwIfCancelled(controller.signal);
    const window: ReverseWindow = { trimInMs: clip.trimInMs, spanMs: temp.durationMs };
    const created = await importReversed(
      new File([file], `${asset.name} (invertido).mp4`, { type: 'video/mp4' }),
      asset,
      window,
    );
    pointClipAtReversed(clipId, created);
    jobs.finish(jobId);
  } catch (error: unknown) {
    // Cancelado: o cancelJob já removeu o job da lista, então não há o que marcar como erro.
    if (controller.signal.aborted) return;
    jobs.fail(jobId, toReverseCode(error));
  }
}
