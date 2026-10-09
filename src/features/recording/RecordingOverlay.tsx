// Sobreposição da gravação de narração: contagem no centro da prévia, faixa com tempo e nível enquanto grava e aviso de erro.
import { useEffect, useState } from 'react';
import { Square, X } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { TOP_BAR_HEIGHT } from '@/features/editor/editorLayout';
import {
  cancelRecording,
  dismissRecordingError,
  readRecordingLevel,
  stopRecording,
} from '@/stores/recordingCommands';
import { useRecordingStore } from '@/stores/recordingStore';
import type { RecordingStatus } from '@/stores/recordingStore';
import { isTypingTarget } from '@/utils/keymap';
import { formatDuration } from '@/utils/time';
import styles from './RecordingOverlay.module.css';

/** Intervalo de atualização do medidor de nível, em ms. */
const LEVEL_TICK_MS = 100;

/** Códigos de erro que têm mensagem própria em t.recording.errors. */
const ERROR_CODES = ['denied', 'notFound', 'busy', 'unsupported', 'save'] as const;

/** Verdadeiro se o código recebido tem mensagem própria. */
function isErrorCode(code: string | undefined): code is (typeof ERROR_CODES)[number] {
  return code !== undefined && (ERROR_CODES as readonly string[]).includes(code);
}

/** Mensagem do erro dado; códigos desconhecidos caem na mensagem de salvamento. */
function errorMessage(code: string | undefined): string {
  return isErrorCode(code) ? t.recording.errors[code] : t.recording.errors.save;
}

/** Lê o nível do microfone periodicamente, só enquanto grava. */
function useRecordingLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setLevel(readRecordingLevel()), LEVEL_TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  return active ? level : 0;
}

/** Esc cancela e Espaço para a gravação, mesmo com o atalho de play da timeline ativo. */
function useRecordingKeys(status: RecordingStatus): void {
  useEffect(() => {
    if (status !== 'requesting' && status !== 'countdown' && status !== 'recording') return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelRecording();
        return;
      }
      if (event.key !== ' ' || isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (status === 'recording' && !event.repeat) void stopRecording();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [status]);
}

/** Camada sobre a tela do editor com o estado da gravação; não aparece quando está parada. */
export function RecordingOverlay() {
  const status = useRecordingStore((state) => state.status);
  const countdown = useRecordingStore((state) => state.countdown);
  const elapsedMs = useRecordingStore((state) => state.elapsedMs);
  const errorCode = useRecordingStore((state) => state.errorCode);
  const level = useRecordingLevel(status === 'recording');
  useRecordingKeys(status);

  // Ao desmontar o editor (ex.: fechar o projeto), libera o microfone.
  useEffect(() => () => cancelRecording(), []);

  if (status === 'countdown') {
    return (
      <div className={styles.countdown} role="status" style={{ top: TOP_BAR_HEIGHT }}>
        <span className={styles.countdownNumber}>{countdown}</span>
        <span className={styles.countdownLabel}>{t.recording.countdown}</span>
        <span className={styles.tip}>{t.recording.headphonesTip}</span>
      </div>
    );
  }

  if (status === 'requesting') {
    return (
      <div className={styles.bar} role="status" style={{ top: TOP_BAR_HEIGHT + 8 }}>
        <span className={styles.label}>{t.recording.requesting}</span>
        <button type="button" className={styles.cancelButton} onClick={() => cancelRecording()}>
          {t.recording.cancel}
        </button>
      </div>
    );
  }

  if (status === 'recording' || status === 'saving') {
    const recording = status === 'recording';
    return (
      <div className={styles.bar} role="region" aria-label={t.recording.recording} style={{ top: TOP_BAR_HEIGHT + 8 }}>
        <span className={recording ? styles.dot : styles.dotIdle} aria-hidden="true" />
        <span className={styles.label}>{recording ? t.recording.recording : t.recording.saving}</span>
        <span className={styles.time}>{formatDuration(elapsedMs)}</span>
        {recording ? <span className={styles.tip}>{t.recording.headphonesTip}</span> : null}
        {recording ? (
          <div
            className={styles.meter}
            role="meter"
            aria-label={t.recording.level}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={level}
          >
            <div className={styles.meterFill} style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        ) : null}
        {recording ? (
          <>
            <button type="button" className={styles.stopButton} onClick={() => void stopRecording()}>
              <Square size={12} strokeWidth={2} aria-hidden="true" />
              {t.recording.stop}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => cancelRecording()}>
              {t.recording.cancel}
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.error} role="alert" style={{ top: TOP_BAR_HEIGHT + 8 }}>
        <span className={styles.errorText}>{errorMessage(errorCode)}</span>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t.recording.dismiss}
          title={t.recording.dismiss}
          onClick={() => dismissRecordingError()}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
}
