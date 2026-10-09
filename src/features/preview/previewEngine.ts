// Singleton preguiçoso do motor da prévia: um provedor de quadros e um motor de áudio por aba.
import { createPreviewAudioEngine, type PreviewAudioEngine } from '@/engine/audio/previewAudioEngine';
import { createPreviewFrameProvider, type PreviewFrameProvider } from '@/engine/decode/previewFrameProvider';

/** Par de motores usados pela prévia: quadros (com aviso de reprodução) e áudio com relógio mestre. */
export interface PreviewEngine {
  /** Provedor de quadros da prévia, com setPlaying. */
  provider: PreviewFrameProvider;
  /** Motor de áudio da prévia. */
  audio: PreviewAudioEngine;
}

let engine: PreviewEngine | null = null;

/** Devolve o motor da prévia, criando-o na primeira chamada. */
export function getPreviewEngine(): PreviewEngine {
  if (engine === null) {
    engine = { provider: createPreviewFrameProvider(), audio: createPreviewAudioEngine() };
  }
  return engine;
}

/** Libera o motor atual (testes ou troca de projeto); a próxima chamada cria outro. */
export function disposePreviewEngine(): void {
  const current = engine;
  if (current === null) return;
  // Zera antes de liberar: uma segunda chamada não tenta fechar de novo, e uma falha não deixa o singleton quebrado.
  engine = null;
  current.audio.dispose();
  current.provider.dispose();
}
