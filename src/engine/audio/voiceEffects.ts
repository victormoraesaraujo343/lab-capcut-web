// Efeitos de voz (tom, eco, reverberação, robô, telefone) montados como cadeia de nós do Web Audio.
// A mesma função monta a cadeia na prévia e na exportação; o tom não é um nó (ele muda o buffer, ver audioNodes).

import type { EffectInstance, ParamValue } from '../../types/effects';
import { clamp } from '../../utils/clamp';
import { generateImpulse } from './impulseResponse';

/** Tipos de efeito de voz, na ordem em que aparecem no painel. */
export const VOICE_EFFECT_TYPES = ['pitch', 'echo', 'reverb', 'robot', 'telephone'] as const;

/** Tipo de efeito de voz. */
export type VoiceEffectType = (typeof VOICE_EFFECT_TYPES)[number];

/** Trecho de cadeia de áudio: entra por `input`, sai por `output`, e `dispose` desconecta tudo. */
export interface AudioStage {
  /** Nó por onde o áudio entra no trecho. */
  input: AudioNode;
  /** Nó por onde o áudio sai do trecho. */
  output: AudioNode;
  /** Desconecta todos os nós internos do trecho (pode ser chamada mais de uma vez). */
  dispose(): void;
}

/** Decaimento da resposta ao impulso da reverberação (maior = some mais cedo). */
const REVERB_DECAY = 6;
/** Número de pontos da curva de saturação do telefone. */
const SOFT_CLIP_POINTS = 1024;
/** Frequências de corte da faixa telefônica, em Hz. */
const PHONE_LOW_CUT_HZ = 300;
const PHONE_HIGH_CUT_HZ = 3400;

/** Parâmetros padrão de cada tipo de efeito de voz. */
export function defaultVoiceParams(type: VoiceEffectType): Record<string, ParamValue> {
  switch (type) {
    case 'pitch':
      return { semitones: 4 };
    case 'echo':
      return { delayMs: 250, feedback: 0.35, mix: 0.4 };
    case 'reverb':
      return { roomSize: 0.5, mix: 0.3 };
    case 'robot':
      return { frequency: 60, mix: 1 };
    case 'telephone':
      return { drive: 0.3 };
  }
}

/** Diz se o texto é um tipo de efeito de voz conhecido. */
export function isVoiceEffectType(type: string): type is VoiceEffectType {
  return (VOICE_EFFECT_TYPES as readonly string[]).includes(type);
}

/** Fator de tom (2^(semitons/12)) do efeito de voz; 1 quando não é 'pitch'. */
export function voicePitchFactor(effect: EffectInstance | undefined): number {
  if (effect?.type !== 'pitch') return 1;
  return Math.pow(2, readNumber(effect.params, 'semitones', -12, 12, 0) / 12);
}

/** Curva de saturação suave de n pontos entre -1 e 1: monotônica e sempre dentro de [-1, 1]. */
export function softClipCurve(drive: number, n: number): Float32Array<ArrayBuffer> {
  const points = Math.max(2, Math.floor(n));
  const k = 1 + 4 * clamp(drive, 0, 1);
  const norm = Math.tanh(k);
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (2 * i) / (points - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/**
 * Monta a cadeia do efeito de voz no contexto dado. Sem efeito (ou tipo 'pitch', feito no buffer),
 * devolve um único ganho que passa o áudio direto.
 */
export function buildVoiceChain(ctx: BaseAudioContext, effect: EffectInstance | undefined): AudioStage {
  if (effect === undefined || !isVoiceEffectType(effect.type)) return passThrough(ctx);
  switch (effect.type) {
    case 'echo':
      return buildEcho(ctx, effect.params);
    case 'reverb':
      return buildReverb(ctx, effect.params);
    case 'robot':
      return buildRobot(ctx, effect.params);
    case 'telephone':
      return buildTelephone(ctx, effect.params);
    case 'pitch':
    default:
      return passThrough(ctx);
  }
}

/** Ganho único que deixa o áudio passar sem alterar nada. */
function passThrough(ctx: BaseAudioContext): AudioStage {
  const gain = ctx.createGain();
  return { input: gain, output: gain, dispose: () => gain.disconnect() };
}

/** Quanto tempo (s) o efeito continua soando depois que o som do clipe acaba: cauda do eco/reverb; 0 para os outros. */
export function voiceTailSeconds(effect: EffectInstance | undefined): number {
  if (effect === undefined) return 0;
  if (effect.type === 'echo') {
    const delay = readNumber(effect.params, 'delayMs', 50, 1000, 250) / 1000;
    const feedback = readNumber(effect.params, 'feedback', 0, 0.9, 0.35);
    // Repetições até cair ~60 dB (0,001), limitado a 6 s.
    const repeats = feedback > 0 ? Math.log(0.001) / Math.log(feedback) : 1;
    return Math.min(6, delay * Math.max(1, repeats));
  }
  if (effect.type === 'reverb') return 0.4 + readNumber(effect.params, 'roomSize', 0, 1, 0.5) * 2.6;
  return 0;
}

/** Eco: atraso com realimentação, misturado com o sinal seco. */
function buildEcho(ctx: BaseAudioContext, params: Record<string, ParamValue>): AudioStage {
  const delaySeconds = readNumber(params, 'delayMs', 50, 1000, 250) / 1000;
  const feedback = readNumber(params, 'feedback', 0, 0.9, 0.35);
  const mix = readNumber(params, 'mix', 0, 1, 0.4);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = delaySeconds;
  const loop = ctx.createGain();
  loop.gain.value = feedback;
  const wet = ctx.createGain();
  wet.gain.value = mix;
  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(loop);
  loop.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  return { input, output, dispose: () => disconnectAll([input, dry, delay, loop, wet, output]) };
}

/** Reverberação: convolução com uma resposta ao impulso de ruído decaído, misturada com o seco. */
function buildReverb(ctx: BaseAudioContext, params: Record<string, ParamValue>): AudioStage {
  const roomSize = readNumber(params, 'roomSize', 0, 1, 0.5);
  const mix = readNumber(params, 'mix', 0, 1, 0.3);
  const seconds = 0.4 + roomSize * 2.6;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  const convolver = ctx.createConvolver();
  convolver.buffer = generateImpulse(ctx, seconds, REVERB_DECAY);
  const wet = ctx.createGain();
  wet.gain.value = mix;
  input.connect(dry);
  dry.connect(output);
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);
  return { input, output, dispose: () => disconnectAll([input, dry, convolver, wet, output]) };
}

/** Robô: modulação em anel, o sinal multiplicado por um oscilador senoidal, misturada com o seco. */
function buildRobot(ctx: BaseAudioContext, params: Record<string, ParamValue>): AudioStage {
  const frequency = readNumber(params, 'frequency', 20, 200, 60);
  const mix = readNumber(params, 'mix', 0, 1, 1);
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  const ring = ctx.createGain();
  ring.gain.value = 0;
  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  oscillator.connect(ring.gain);
  const wet = ctx.createGain();
  wet.gain.value = mix;
  input.connect(dry);
  dry.connect(output);
  input.connect(ring);
  ring.connect(wet);
  wet.connect(output);
  oscillator.start();
  let stopped = false;
  return {
    input,
    output,
    dispose: () => {
      if (!stopped) {
        stopped = true;
        oscillator.stop();
      }
      oscillator.disconnect();
      disconnectAll([input, dry, ring, wet, output]);
    },
  };
}

/** Telefone: faixa de 300 Hz a 3,4 kHz com saturação suave. */
function buildTelephone(ctx: BaseAudioContext, params: Record<string, ParamValue>): AudioStage {
  const drive = readNumber(params, 'drive', 0, 1, 0.3);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = PHONE_LOW_CUT_HZ;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = PHONE_HIGH_CUT_HZ;
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(drive, SOFT_CLIP_POINTS);
  highpass.connect(lowpass);
  lowpass.connect(shaper);
  return { input: highpass, output: shaper, dispose: () => disconnectAll([highpass, lowpass, shaper]) };
}

/** Lê um parâmetro numérico, limitado ao intervalo; usa o padrão se faltar ou não for número. */
function readNumber(
  params: Record<string, ParamValue>,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/** Desconecta todos os nós dados. */
function disconnectAll(nodes: AudioNode[]): void {
  for (const node of nodes) {
    node.disconnect();
  }
}
