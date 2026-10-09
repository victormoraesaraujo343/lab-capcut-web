// Nós do Web Audio da prévia: recorte de trechos já passados e montagem de fonte + ganho por trecho.

import type { Clip } from '../../types/project';
import { clipGainAt, type ScheduledSegment } from './audioSchedule';

/** Nó de áudio ativo: fonte e ganho, para poder parar e desconectar depois. */
export interface ActiveNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Tira do trecho a parte que já passou no instante dado; null se ele já terminou. */
export function trimPassed(segment: ScheduledSegment, nowMs: number): ScheduledSegment | null {
  if (segment.startAtTimelineMs + segment.durationMs <= nowMs) {
    return null;
  }
  const skipMs = Math.max(0, nowMs - segment.startAtTimelineMs);
  if (skipMs === 0) {
    return segment;
  }
  return {
    ...segment,
    startAtTimelineMs: segment.startAtTimelineMs + skipMs,
    offsetInMediaMs: segment.offsetInMediaMs + skipMs * segment.playbackRate,
    durationMs: segment.durationMs - skipMs,
  };
}

/**
 * Cria e inicia a fonte de um trecho, com o envelope de volume do clipe, no instante `when`.
 * Serve à prévia (AudioContext) e à mixagem offline (OfflineAudioContext), ligando no `output` dado.
 */
export function scheduleSegment(
  context: BaseAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  clip: Clip,
  segment: ScheduledSegment,
  when: number,
): ActiveNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = segment.playbackRate;
  const gain = context.createGain();
  source.connect(gain);
  gain.connect(output);
  const localStartMs = segment.startAtTimelineMs - clip.startMs;
  scheduleEnvelope(gain, clip, localStartMs, when);
  source.start(when, segment.offsetInMediaMs / 1000);
  source.stop(when + segment.durationMs / 1000);
  return { source, gain };
}

function scheduleEnvelope(gain: GainNode, clip: Clip, localStartMs: number, when: number): void {
  const at = (localMs: number): number => when + (localMs - localStartMs) / 1000;
  gain.gain.setValueAtTime(clipGainAt(clip, localStartMs), when);
  const breakpoints = [clip.audio.fadeInMs, clip.durationMs - clip.audio.fadeOutMs, clip.durationMs]
    .filter((point) => point > localStartMs && point <= clip.durationMs)
    .sort((a, b) => a - b);
  let previous = localStartMs;
  for (const point of breakpoints) {
    if (point <= previous) {
      continue;
    }
    gain.gain.linearRampToValueAtTime(clipGainAt(clip, point), at(point));
    previous = point;
  }
}
