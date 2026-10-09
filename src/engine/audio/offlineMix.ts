// Mixagem offline do áudio do projeto para exportação: renderiza os mesmos trechos e fades da prévia.
// Roda na thread principal (OfflineAudioContext não existe em worker); o esticamento de tom vai ao worker.

import type { MixedAudio } from '../../types/export';
import type { Asset, Clip, Project } from '../../types/project';
import { createAudioBufferCache } from './audioBufferCache';
import { scheduleSegment, stretchedPlaySource, type PlaySource } from './audioNodes';
import { computeSegments, type ScheduledSegment } from './audioSchedule';

/** Taxa de amostragem padrão da mixagem, em Hz. */
const DEFAULT_SAMPLE_RATE = 48000;
/** Número de canais da mixagem (estéreo). */
const CHANNEL_COUNT = 2;

/** Opções da mixagem offline. */
export interface MixProjectOptions {
  /** Taxa de amostragem em Hz; padrão 48000. */
  sampleRate?: number;
  /** Recebe o progresso de 0 a 1 ao longo da mixagem. */
  onProgress?: (fraction: number) => void;
  /** Cancela a mixagem; a promessa é rejeitada com AbortError. */
  signal?: AbortSignal;
}

/** Trechos com som dentro de [startMs, endMs), com a duração cortada no fim do intervalo. */
export function segmentsInRange(project: Project, startMs: number, endMs: number): ScheduledSegment[] {
  const inRange: ScheduledSegment[] = [];
  for (const segment of computeSegments(project, startMs)) {
    if (segment.startAtTimelineMs >= endMs) {
      continue;
    }
    const availableMs = endMs - segment.startAtTimelineMs;
    inRange.push({ ...segment, durationMs: Math.min(segment.durationMs, availableMs) });
  }
  return inRange;
}

/** Renderiza o áudio do projeto entre startMs e endMs; null se não houver nenhum trecho com som. */
export async function mixProjectAudio(
  project: Project,
  startMs: number,
  endMs: number,
  options: MixProjectOptions = {},
): Promise<MixedAudio | null> {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const { onProgress, signal } = options;
  throwIfAborted(signal);
  const segments = segmentsInRange(project, startMs, endMs);
  if (segments.length === 0) {
    return null;
  }
  onProgress?.(0);
  const length = Math.ceil(((endMs - startMs) / 1000) * sampleRate);
  const ctx = new OfflineAudioContext(CHANNEL_COUNT, length, sampleRate);
  const buffers = await decodeSegmentBuffers(ctx, project, segments);
  throwIfAborted(signal);
  onProgress?.(0.5);
  const clips = indexClips(project);
  const sources = await resolvePlaySources(ctx, project, segments, buffers, clips);
  throwIfAborted(signal);
  for (const segment of segments) {
    const source = sources.get(segment.clipId);
    const clip = clips.get(segment.clipId);
    if (source !== undefined && clip !== undefined) {
      const when = (segment.startAtTimelineMs - startMs) / 1000;
      scheduleSegment(ctx, ctx.destination, source, clip, segment, when);
    }
  }
  const rendered = await ctx.startRendering();
  throwIfAborted(signal);
  onProgress?.(1);
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
    channels.push(rendered.getChannelData(channel).slice());
  }
  return { sampleRate, channels };
}

/** Espera os trechos esticados de cada clipe (no worker) e devolve a fonte pronta por id de clipe. */
async function resolvePlaySources(
  ctx: OfflineAudioContext,
  project: Project,
  segments: ScheduledSegment[],
  buffers: Map<string, AudioBuffer | null>,
  clips: Map<string, Clip>,
): Promise<Map<string, PlaySource>> {
  const assets = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset] as const));
  const sources = new Map<string, PlaySource>();
  await Promise.all(
    segments.map(async (segment) => {
      const buffer = buffers.get(segment.assetId) ?? null;
      const clip = clips.get(segment.clipId);
      const asset = assets.get(segment.assetId);
      if (buffer === null || clip === undefined || asset === undefined) return;
      sources.set(segment.clipId, await stretchedPlaySource(ctx, asset, buffer, clip));
    }),
  );
  return sources;
}

/** Decodifica, uma única vez por asset, os buffers usados pelos trechos. */
async function decodeSegmentBuffers(
  ctx: OfflineAudioContext,
  project: Project,
  segments: ScheduledSegment[],
): Promise<Map<string, AudioBuffer | null>> {
  const cache = createAudioBufferCache(ctx);
  const assets = new Map(project.assets.map((asset) => [asset.id, asset] as const));
  const assetIds = Array.from(new Set(segments.map((segment) => segment.assetId)));
  const buffers = new Map<string, AudioBuffer | null>();
  await Promise.all(
    assetIds.map(async (assetId) => {
      const asset = assets.get(assetId);
      buffers.set(assetId, asset === undefined ? null : await cache.get(asset));
    }),
  );
  return buffers;
}

/** Lança AbortError se o sinal de cancelamento já foi acionado. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Mixagem de áudio cancelada.', 'AbortError');
  }
}

function indexClips(project: Project): Map<string, Clip> {
  const clips = new Map<string, Clip>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      clips.set(clip.id, clip);
    }
  }
  return clips;
}
