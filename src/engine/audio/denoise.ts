// Redução de ruído básica: filtros que cortam o ronco grave e o chiado agudo, seguidos de um portão de ruído
// (AudioWorklet 'noise-gate', ver noiseGate.ts) que fecha o fundo entre as falas.
// Se o módulo do worklet não carregar neste contexto, a cadeia cai no compressor antigo: ele só comprime
// (razão >= 1), então a redução fica leve. A prévia pode montar a cadeia antes do módulo estar pronto.

import type { AudioStage } from './voiceEffects';
import { DEFAULT_GATE_PARAMS } from './noiseGate';
import noiseGateWorkletUrl from './worklets/noiseGateProcessor?worklet-data';

/** Nome do processador do portão, igual ao registrado em worklets/noiseGateProcessor.ts. */
const NOISE_GATE_NAME = 'noise-gate';

/** Ajustes da redução de ruído básica. */
export interface DenoiseSettings {
  /** Frequência do filtro passa-alta, em Hz (corta o ronco grave). */
  highpassHz: number;
  /** Frequência do filtro passa-baixa, em Hz (corta o chiado agudo). */
  lowpassHz: number;
  /** Limiar do compressor de reserva, em dB. */
  thresholdDb: number;
  /** Suavidade da curva perto do limiar do compressor de reserva, em dB. */
  kneeDb: number;
  /** Razão do compressor de reserva (1,5 = compressão leve). */
  ratio: number;
  /** Tempo de ataque do compressor de reserva, em segundos. */
  attackS: number;
  /** Tempo de liberação do compressor de reserva, em segundos. */
  releaseS: number;
}

/** Módulos do worklet já pedidos por contexto: a promessa diz se carregou. */
const gateModules = new WeakMap<BaseAudioContext, Promise<boolean>>();
/** Contextos em que o módulo do portão carregou com sucesso. */
const gateReady = new WeakSet<BaseAudioContext>();

/** Ajustes padrão da redução de ruído, iguais na prévia e na exportação. */
export function denoiseSettings(): DenoiseSettings {
  return {
    highpassHz: 80,
    lowpassHz: 9000,
    thresholdDb: -50,
    kneeDb: 10,
    ratio: 1.5,
    attackS: 0.003,
    releaseS: 0.25,
  };
}

/**
 * Carrega o módulo do portão de ruído no contexto dado, uma vez por contexto.
 * Devolve true se carregou; false se o navegador não tem AudioWorklet ou o carregamento falhou.
 */
export function ensureNoiseGateModule(ctx: BaseAudioContext): Promise<boolean> {
  const existing = gateModules.get(ctx);
  if (existing !== undefined) return existing;
  const loading = loadNoiseGate(ctx);
  gateModules.set(ctx, loading);
  return loading;
}

/** Faz o carregamento do módulo do worklet; nunca rejeita (falha vira false). */
async function loadNoiseGate(ctx: BaseAudioContext): Promise<boolean> {
  try {
    await ctx.audioWorklet.addModule(noiseGateWorkletUrl);
    gateReady.add(ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Monta a cadeia de redução de ruído no contexto dado: passa-alta → passa-baixa → portão de ruído.
 * Sem o módulo do portão carregado neste contexto, usa o compressor de reserva no lugar do portão.
 */
export function buildDenoiseChain(ctx: BaseAudioContext): AudioStage {
  const settings = denoiseSettings();
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = settings.highpassHz;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = settings.lowpassHz;
  const tail: AudioNode = gateReady.has(ctx)
    ? createGateNode(ctx)
    : createFallbackCompressor(ctx, settings);
  highpass.connect(lowpass);
  lowpass.connect(tail);
  return {
    input: highpass,
    output: tail,
    dispose: () => {
      highpass.disconnect();
      lowpass.disconnect();
      tail.disconnect();
    },
  };
}

/** Cria o nó do portão de ruído, com os parâmetros padrão. */
function createGateNode(ctx: BaseAudioContext): AudioWorkletNode {
  return new AudioWorkletNode(ctx, NOISE_GATE_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: { ...DEFAULT_GATE_PARAMS },
  });
}

/** Compressor de reserva, usado quando o portão de ruído não está disponível. */
function createFallbackCompressor(ctx: BaseAudioContext, settings: DenoiseSettings): DynamicsCompressorNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = settings.thresholdDb;
  compressor.knee.value = settings.kneeDb;
  compressor.ratio.value = settings.ratio;
  compressor.attack.value = settings.attackS;
  compressor.release.value = settings.releaseS;
  return compressor;
}
