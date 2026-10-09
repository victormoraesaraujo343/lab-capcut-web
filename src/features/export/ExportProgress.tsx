// Painel de andamento, conclusão, cancelamento e erro da exportação; mensagens de erro traduzidas pelo código.
import { t } from '../../i18n/pt-BR';
import type { ExportPhase } from '../../types/export';
import { formatDuration } from '../../utils/time';
import styles from './ExportDialog.module.css';

/** Estado mostrado no painel de progresso. */
export type ProgressView =
  | { kind: 'running'; phase: ExportPhase; fraction: number; etaMs: number | null }
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/** Texto pt-BR para o código de erro vindo do cliente de exportação. */
export function errorText(code: string): string {
  switch (code) {
    case 'empty':
      return t.export.emptyProject;
    case 'unsupported-codec':
      return t.errors.exportUnsupportedCodec;
    case 'no-webcodecs':
      return t.errors.exportNoWebcodecs;
    case 'decode':
      return t.errors.exportDecode;
    case 'encode':
      return t.errors.exportEncode;
    case 'memory':
      return t.errors.exportMemory;
    default:
      return t.errors.exportGeneric;
  }
}

/** Mostra o andamento ou o desfecho da exportação no lugar das opções. */
export function ExportProgress({ view }: { view: ProgressView }) {
  if (view.kind === 'done') {
    return <p className={styles.resultText}>{t.export.done}</p>;
  }
  if (view.kind === 'cancelled') {
    return <p className={styles.resultText}>{t.export.cancelled}</p>;
  }
  if (view.kind === 'error') {
    return (
      <p className={styles.errorText} role="alert">
        {errorText(view.message)}
      </p>
    );
  }
  const percent = Math.round(view.fraction * 100);
  return (
    <div className={styles.progressBox}>
      <p className={styles.phase}>{t.export.phases[view.phase]}</p>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={t.export.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <p className={styles.meta}>
        <span>{percent}%</span>
        {view.etaMs !== null && (
          <span>
            {t.export.remaining} {formatDuration(view.etaMs)}
          </span>
        )}
      </p>
      <p className={styles.meta}>{t.export.keepOpen}</p>
    </div>
  );
}
