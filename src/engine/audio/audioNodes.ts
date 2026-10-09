// Nós do Web Audio da prévia: recorte de trechos já passados e montagem de fonte + ganho por trecho.

import type { Clip, Speed } from '../../types/project';
import { curveSpeedAt, mediaOffsetAt } from '../timeline/speedCurve';
import { clipGainAt, type ScheduledSegment } from './audioSchedule';
import { getStretchedBuffer, roundStretchRate } from './stretchedBufferCache';

/** Menor playbackRate que o Web Audio aceita; abaixo disso o clipe fica mudo. */
const WEB_AUDIO_RATE_MIN = 0.0625;
/** Maior playbackRate que o Web Audio aceita; acima disso o clipe fica mudo. */
const WEB_AUDIO_RATE_MAX = 16;
/** Intervalo, em ms, entre as amostras da curva de velocidade enviada ao Web Audio. */
const CURVE_STEP_MS = 10;
/** Subdivisões entre dois keyframes com easing não linear, para o envelope de volume. */
const EASING_STEPS = 8;

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
  const curve = segment.curve;
  if (curve === undefined) {
    return {
      ...segment,
      startAtTimelineMs: segment.startAtTimelineMs + skipMs,
      offsetInMediaMs: segment.offsetInMediaMs + skipMs * segment.playbackRate,
      durationMs: segment.durationMs - skipMs,
    };
  }
  const from = mediaOffsetAt(curve.speed, curve.localStartMs, curve.clipDurationMs);
  const to = mediaOffsetAt(curve.speed, curve.localStartMs + skipMs, curve.clipDurationMs);
  return {
    ...segment,
    startAtTimelineMs: segment.startAtTimelineMs + skipMs,
    offsetInMediaMs: segment.offsetInMediaMs + (to - from),
    durationMs: segment.durationMs - skipMs,
    curve: { ...curve, localStartMs: curve.localStartMs + skipMs },
  };
}

/**
 * Cria e inicia a fonte de um trecho, com o envelope de volume do clipe, no instante `when`.
 * Serve à prévia (AudioContext) e à mixagem offline (OfflineAudioContext), ligando no `output` dado.
 * Devolve null se a velocidade do clipe fica fora do que o Web Audio aceita (o clipe fica mudo).
 */
export function scheduleSegment(
  context: BaseAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  clip: Clip,
  segment: ScheduledSegment,
  when: number,
): ActiveNode | null {
  if (!isWebAudioSpeed(clip.speed)) {
    return null;
  }
  const localStartMs = segment.startAtTimelineMs - clip.startMs;
  const stretch = pitchPreservedRate(clip.speed);
  const source = context.createBufferSource();
  if (stretch === null) {
    source.buffer = buffer;
    source.playbackRate.value = segment.playbackRate;
  } else {
    source.buffer = getStretchedBuffer(context, buffer, stretch);
    source.playbackRate.value = segment.playbackRate / stretch;
  }
  if (clip.speed.mode === 'curve') {
    scheduleCurveRate(source.playbackRate, clip, localStartMs, segment.durationMs, when);
  }
  const gain = context.createGain();
  source.connect(gain);
  gain.connect(output);
  scheduleEnvelope(gain, clip, localStartMs, when);
  const offsetMs = stretch === null ? segment.offsetInMediaMs : segment.offsetInMediaMs / stretch;
  source.start(when, offsetMs / 1000);
  source.stop(when + segment.durationMs / 1000);
  return { source, gain };
}

/** Taxa de esticamento do buffer quando o tom deve ser mantido (velocidade constante diferente de 1); senão null. */
function pitchPreservedRate(speed: Speed): number | null {
  if (speed.mode !== 'constant' || !speed.preservePitch) return null;
  const rate = roundStretchRate(speed.value);
  return rate === 1 ? null : rate;
}

/** Diz se a velocidade do clipe fica dentro do intervalo que o Web Audio aceita (constante ou todos os pontos da curva). */
function isWebAudioSpeed(speed: Speed): boolean {
  const inRange = (value: number): boolean => value >= WEB_AUDIO_RATE_MIN && value <= WEB_AUDIO_RATE_MAX;
  if (speed.mode === 'constant') return inRange(speed.value);
  return speed.curve.every((point) => inRange(point.speed));
}

/** Envia a curva de velocidade ao playbackRate da fonte, amostrada ao longo do trecho (sem preservar o tom). */
function scheduleCurveRate(
  param: AudioParam,
  clip: Clip,
  localStartMs: number,
  durationMs: number,
  when: number,
): void {
  if (!(clip.durationMs > 0) || !(durationMs > 0)) return;
  const count = Math.max(2, Math.ceil(durationMs / CURVE_STEP_MS) + 1);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const local = localStartMs + (durationMs * i) / (count - 1);
    values[i] = curveSpeedAt(clip.speed.curve, local / clip.durationMs);
  }
  param.setValueAtTime(values[0] ?? 1, when);
  param.setValueCurveAtTime(values, when, durationMs / 1000);
}

/** Instantes locais (depois do início do trecho) em que o ganho muda: fades, keyframes de volume e subdivisões de easing. */
function envelopeBreakpoints(clip: Clip, fromLocalMs: number): number[] {
  const points = [clip.audio.fadeInMs, clip.durationMs - clip.audio.fadeOutMs, clip.durationMs];
  const keys = clip.keyframes['volume'] ?? [];
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a === undefined) continue;
    points.push(a.timeMs);
    if (b !== undefined && a.easing !== 'linear') {
      for (let step = 1; step < EASING_STEPS; step++) {
        points.push(a.timeMs + ((b.timeMs - a.timeMs) * step) / EASING_STEPS);
      }
    }
  }
  const inside = points.filter((point) => point > fromLocalMs && point <= clip.durationMs);
  return [...new Set(inside)].sort((x, y) => x - y);
}

function scheduleEnvelope(gain: GainNode, clip: Clip, localStartMs: number, when: number): void {
  const at = (localMs: number): number => when + (localMs - localStartMs) / 1000;
  gain.gain.setValueAtTime(clipGainAt(clip, localStartMs), when);
  for (const point of envelopeBreakpoints(clip, localStartMs)) {
    gain.gain.linearRampToValueAtTime(clipGainAt(clip, point), at(point));
  }
}
