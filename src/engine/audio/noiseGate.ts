// Portão de ruído (lógica pura, sem Web Audio): mede o nível RMS a cada ~10 ms, abre quando o sinal passa do
// limiar, segura por holdMs e fecha com release até um piso de atenuação. O piso é uma atenuação (ex.: −24 dB),
// não silêncio total, e as transições são suavizadas por um filtro de um polo, sem cliques.
// O mesmo código roda no AudioWorklet (prévia e exportação), ver worklets/noiseGateProcessor.ts.

/** Ajustes do portão de ruído. */
export interface GateParams {
  /** Limiar do nível RMS do bloco, em dBFS: acima dele o portão abre. */
  thresholdDb: number;
  /** Ganho com o portão fechado, em dB (−24 = atenua 24 dB; 0 = sem atenuação). */
  floorDb: number;
  /** Tempo para abrir (ataque), em ms. */
  attackMs: number;
  /** Tempo para fechar (liberação), em ms. */
  releaseMs: number;
  /** Tempo que o portão segura aberto depois que o sinal cai abaixo do limiar, em ms. */
  holdMs: number;
}

/** Ajustes padrão para voz: limiar −45 dBFS, piso −24 dB, ataque 5 ms, release 120 ms, hold 80 ms. */
export const DEFAULT_GATE_PARAMS: GateParams = {
  thresholdDb: -45,
  floorDb: -24,
  attackMs: 5,
  releaseMs: 120,
  holdMs: 80,
};

/** Tamanho do bloco de medição do nível, em ms. */
const BLOCK_MS = 10;
/** Nível usado quando o bloco é silêncio absoluto, em dB. */
const SILENCE_DB = -180;

/** Estado do portão de um canal; guarda o ganho atual entre chamadas de processGate. */
export interface GateState {
  /** Se o portão já começou a processar (na primeira chamada ele parte fechado, sem transitório). */
  started: boolean;
  /** Ganho linear aplicado à amostra atual. */
  gain: number;
  /** Ganho linear para onde o portão está indo (1 aberto, piso fechado). */
  target: number;
  /** Soma dos quadrados das amostras do bloco em medição. */
  blockSumSq: number;
  /** Quantas amostras o bloco em medição já tem. */
  blockCount: number;
  /** Quantas amostras ainda faltam para o portão soltar depois de fechar o sinal. */
  holdRemaining: number;
}

/** Cria o estado inicial de um canal do portão. */
export function createGateState(): GateState {
  return { started: false, gain: 1, target: 1, blockSumSq: 0, blockCount: 0, holdRemaining: 0 };
}

/** Converte dB em ganho linear. */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Coeficiente de um filtro de um polo com a constante de tempo dada: fração do desvio que sobra a cada amostra. */
function smoothingCoefficient(ms: number, sampleRate: number): number {
  if (!(ms > 0)) return 0;
  return Math.exp(-1000 / (ms * sampleRate));
}

/**
 * Processa um trecho de um canal: lê `input`, grava em `output` (mesmo tamanho) com o ganho do portão.
 * Mantém o estado entre chamadas, então pode ser chamado bloco a bloco (como no AudioWorklet).
 */
export function processGate(
  state: GateState,
  input: Float32Array,
  output: Float32Array,
  sampleRate: number,
  params: GateParams,
): void {
  const floorGain = dbToGain(params.floorDb);
  if (!state.started) {
    state.started = true;
    state.gain = floorGain;
    state.target = floorGain;
  }
  const blockLength = Math.max(1, Math.round((sampleRate * BLOCK_MS) / 1000));
  const holdSamples = Math.max(0, Math.round((params.holdMs * sampleRate) / 1000));
  const attack = smoothingCoefficient(params.attackMs, sampleRate);
  const release = smoothingCoefficient(params.releaseMs, sampleRate);
  const count = Math.min(input.length, output.length);
  for (let i = 0; i < count; i++) {
    const sample = input[i] ?? 0;
    state.blockSumSq += sample * sample;
    state.blockCount++;
    if (state.blockCount >= blockLength) {
      closeBlock(state, blockLength, holdSamples, floorGain, params.thresholdDb);
    }
    const coefficient = state.target > state.gain ? attack : release;
    state.gain = state.target + (state.gain - state.target) * coefficient;
    output[i] = sample * state.gain;
  }
}

/** Fecha o bloco de medição: decide o alvo do ganho (aberto, segurando ou piso) e zera a medição. */
function closeBlock(
  state: GateState,
  blockLength: number,
  holdSamples: number,
  floorGain: number,
  thresholdDb: number,
): void {
  const rms = Math.sqrt(state.blockSumSq / state.blockCount);
  const levelDb = rms > 0 ? 20 * Math.log10(rms) : SILENCE_DB;
  const above = levelDb >= thresholdDb;
  state.holdRemaining = above ? holdSamples : Math.max(0, state.holdRemaining - blockLength);
  state.target = above || state.holdRemaining > 0 ? 1 : floorGain;
  state.blockSumSq = 0;
  state.blockCount = 0;
}
