// Store da gravação de narração: estado da contagem, da gravação e do erro.
import { create } from 'zustand';

/** Etapa da gravação: parada, pedindo o microfone, contagem, gravando, salvando ou com erro. */
export type RecordingStatus = 'idle' | 'requesting' | 'countdown' | 'recording' | 'saving' | 'error';

/** Estado da gravação de narração. */
export interface RecordingState {
  /** Etapa atual da gravação. */
  status: RecordingStatus;
  /** Número da contagem regressiva (3, 2, 1) durante a contagem. */
  countdown: number;
  /** Instante da linha do tempo, em ms, onde a gravação começou. */
  startMs: number;
  /** Tempo já gravado, em ms. */
  elapsedMs: number;
  /** Código do erro quando status é 'error'. */
  errorCode?: string;
}

/** Hook com o estado da gravação de narração (as ações ficam em recordingCommands). */
export const useRecordingStore = create<RecordingState>()(() => ({
  status: 'idle',
  countdown: 0,
  startMs: 0,
  elapsedMs: 0,
}));
