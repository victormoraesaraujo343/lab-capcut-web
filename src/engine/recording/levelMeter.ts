// Medidor de nível do microfone: RMS das amostras e um AnalyserNode que lê o stream sem tocá-lo na saída.

/** Fator de suavização do nível: quanto do valor anterior é mantido a cada leitura. */
const SMOOTHING = 0.7;
/** Tamanho da janela do AnalyserNode, em amostras. */
const FFT_SIZE = 2048;

/** Medidor com a leitura suavizada do nível e a liberação dos nós de áudio. */
export interface LevelMeter {
  /** Nível atual entre 0 e 1, suavizado. */
  level(): number;
  /** Desconecta os nós do stream. */
  dispose(): void;
}

/** Calcula o valor RMS (0 a 1) de um bloco de amostras; vazio vale 0. */
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/** Cria um medidor ligado ao stream, sem conectar à saída (não ecoa o microfone). */
export function createLevelMeter(ctx: AudioContext, stream: MediaStream): LevelMeter {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  const buffer = new Float32Array(FFT_SIZE);
  let smoothed = 0;

  return {
    // Lê o bloco atual e suaviza em relação à leitura anterior.
    level() {
      analyser.getFloatTimeDomainData(buffer);
      const current = rmsLevel(buffer);
      smoothed = Math.max(current, smoothed * SMOOTHING + current * (1 - SMOOTHING));
      return smoothed;
    },
    // Desconecta a fonte e o analisador.
    dispose() {
      source.disconnect();
      analyser.disconnect();
    },
  };
}
