// Nós do Web Audio da prévia: recorte de trechos já passados e montagem de fonte + ganho por trecho.

import type { Asset, Clip, Speed } from '../../types/project';
import { curveSpeedAt, mediaOffsetAt } from '../timeline/speedCurve';
import { clipGainAt, type ScheduledSegment } from './audioSchedule';
import { buildDenoiseChain } from './denoise';
import {
  getStretchedSegment,
  peekStretchedSegment,
  roundStretchRate,
  type StretchedSegment,
} from './stretchedBufferCache';
import { buildVoiceChain, voicePitchFactor, voiceTailSeconds } from './voiceEffects';

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

/** Buffer pronto para tocar: o original (stretch null) ou um trecho esticado que começa em mediaStartMs. */
export interface PlaySource {
  /** Buffer do Web Audio, já criado no contexto que vai tocá-lo. */
  buffer: AudioBuffer;
  /** Posição, em ms da mídia, onde o buffer começa; 0 para o buffer original. */
  mediaStartMs: number;
  /** Taxa de esticamento embutida no buffer; null quando o buffer é o original. */
  stretch: number | null;
}

/** Recorte de mídia que precisa ser esticado para manter o tom do clipe. */
export interface StretchSpan {
  /** Início do recorte na mídia, em ms (o início do clipe na mídia). */
  startMediaMs: number;
  /** Duração do recorte na mídia, em ms (duração do clipe vezes a velocidade). */
  spanMediaMs: number;
  /** Taxa de esticamento, arredondada a 0,01. */
  rate: number;
}

/**
 * Cria e inicia a fonte de um trecho, com o envelope de volume do clipe, no instante `when`.
 * Serve à prévia (AudioContext) e à mixagem offline (OfflineAudioContext), ligando no `output` dado.
 * Cadeia: fonte → ganho do clipe → redução de ruído (se ligada) → efeito de voz → saída; os nós são
 * desconectados quando a fonte termina.
 * Devolve null se a velocidade do clipe fica fora do que o Web Audio aceita (o clipe fica mudo).
 */
export function scheduleSegment(
  context: BaseAudioContext,
  output: AudioNode,
  playable: PlaySource,
  clip: Clip,
  segment: ScheduledSegment,
  when: number,
): ActiveNode | null {
  if (!isWebAudioSpeed(clip.speed)) {
    return null;
  }
  const localStartMs = segment.startAtTimelineMs - clip.startMs;
  const source = context.createBufferSource();
  source.buffer = playable.buffer;
  let offsetMs = segment.offsetInMediaMs;
  let rateScale = 1;
  if (playable.stretch !== null) {
    rateScale = 1 / playable.stretch;
    offsetMs = Math.max(0, segment.offsetInMediaMs - playable.mediaStartMs) * rateScale;
  }
  source.playbackRate.value = segment.playbackRate * rateScale;
  if (clip.speed.mode === 'curve') {
    scheduleCurveRate(source.playbackRate, clip, localStartMs, segment.durationMs, when, rateScale);
  }
  const gain = context.createGain();
  source.connect(gain);
  const denoise = clip.audio.denoise ? buildDenoiseChain(context) : null;
  const voice = buildVoiceChain(context, clip.audio.voiceEffect);
  gain.connect(denoise?.input ?? voice.input);
  denoise?.output.connect(voice.input);
  voice.output.connect(output);
  scheduleEnvelope(gain, clip, localStartMs, when);
  source.onended = () => {
    gain.disconnect();
    // Eco e reverb continuam soando depois do fim do som: libera a cadeia só depois da cauda (senão corta seco).
    const tailMs = voiceTailSeconds(clip.audio.voiceEffect) * 1000;
    const release = (): void => {
      denoise?.dispose();
      voice.dispose();
    };
    if (tailMs > 0) setTimeout(release, tailMs);
    else release();
  };
  source.start(when, offsetMs / 1000);
  source.stop(when + segment.durationMs / 1000);
  return { source, gain };
}

/**
 * Recorte a esticar para o clipe: tom preservado (velocidade constante) e/ou efeito de tom de voz.
 * O buffer é esticado por (velocidade preservada ou 1) / fator de tom, e a fonte toca com a razão inversa.
 * Devolve null quando nada precisa ser esticado.
 */
export function stretchSpanFor(clip: Clip): StretchSpan | null {
  const { speed } = clip;
  if (!isWebAudioSpeed(speed)) return null;
  const tempo = speed.mode === 'constant' && speed.preservePitch ? speed.value : 1;
  const rate = roundStretchRate(tempo / voicePitchFactor(clip.audio.voiceEffect));
  if (rate === 1) return null;
  const spanMediaMs = speed.mode === 'constant'
    ? clip.durationMs * speed.value
    : mediaOffsetAt(speed, clip.durationMs, clip.durationMs);
  return { startMediaMs: clip.trimInMs, spanMediaMs, rate };
}

/** Fonte com o buffer original, tocada na velocidade comum (o tom acompanha a velocidade). */
export function originalSource(buffer: AudioBuffer): PlaySource {
  return { buffer, mediaStartMs: 0, stretch: null };
}

/**
 * Fonte pronta agora: o trecho esticado, se já estiver no cache; senão o original, e pede o esticamento
 * em segundo plano para o próximo agendamento. Nunca espera nem trabalha de forma síncrona pesada.
 */
export function readyPlaySource(context: BaseAudioContext, asset: Asset, buffer: AudioBuffer, clip: Clip): PlaySource {
  const span = stretchSpanFor(clip);
  if (span === null) return originalSource(buffer);
  const ready = peekStretchedSegment(asset, span.startMediaMs, span.spanMediaMs, span.rate);
  if (ready !== null) {
    const source = playSourceFrom(context, ready, span);
    if (source !== null) return source;
  }
  getStretchedSegment(asset, buffer, span.startMediaMs, span.spanMediaMs, span.rate).catch(() => undefined);
  return originalSource(buffer);
}

/** Fonte esticada, esperando o worker se preciso (a mixagem offline usa esta). */
export async function stretchedPlaySource(
  context: BaseAudioContext,
  asset: Asset,
  buffer: AudioBuffer,
  clip: Clip,
): Promise<PlaySource> {
  const span = stretchSpanFor(clip);
  if (span === null) return originalSource(buffer);
  const segment = await getStretchedSegment(asset, buffer, span.startMediaMs, span.spanMediaMs, span.rate);
  return playSourceFrom(context, segment, span) ?? originalSource(buffer);
}

/** Cria o AudioBuffer do trecho esticado no contexto dado; null se o trecho estiver vazio. */
function playSourceFrom(context: BaseAudioContext, segment: StretchedSegment, span: StretchSpan): PlaySource | null {
  const length = segment.channels[0]?.length ?? 0;
  if (length === 0) return null;
  const buffer = context.createBuffer(segment.channels.length, length, segment.sampleRate);
  segment.channels.forEach((data, channel) => buffer.copyToChannel(data, channel));
  return { buffer, mediaStartMs: span.startMediaMs, stretch: span.rate };
}

/** Diz se a velocidade do clipe fica dentro do intervalo que o Web Audio aceita (constante ou todos os pontos da curva). */
export function isWebAudioSpeed(speed: Speed): boolean {
  const inRange = (value: number): boolean => value >= WEB_AUDIO_RATE_MIN && value <= WEB_AUDIO_RATE_MAX;
  if (speed.mode === 'constant') return inRange(speed.value);
  return speed.curve.every((point) => inRange(point.speed));
}

/**
 * Envia a curva de velocidade ao playbackRate da fonte, amostrada ao longo do trecho (sem preservar o tom).
 * `scale` corrige a curva quando o buffer foi esticado (1 / razão de esticamento).
 */
function scheduleCurveRate(
  param: AudioParam,
  clip: Clip,
  localStartMs: number,
  durationMs: number,
  when: number,
  scale: number,
): void {
  if (!(clip.durationMs > 0) || !(durationMs > 0)) return;
  const count = Math.max(2, Math.ceil(durationMs / CURVE_STEP_MS) + 1);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const local = localStartMs + (durationMs * i) / (count - 1);
    values[i] = curveSpeedAt(clip.speed.curve, local / clip.durationMs) * scale;
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
