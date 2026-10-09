// Estado da importação: barra de progresso e lista de erros fecháveis.

import { X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import type { ImportErrorCode } from '@/engine/import/importMedia';
import { t } from '@/i18n/pt-BR';
import type { ImportErrorItem, ImportProgress } from '@/stores';
import styles from './ImportStatus.module.css';

export interface ImportStatusProps {
  /** Progresso atual, ou null quando não há importação em andamento. */
  progress: ImportProgress | null;
  /** Erros de importação ainda visíveis. */
  errors: ImportErrorItem[];
  /** Fecha um erro pelo id. */
  onDismiss: (id: string) => void;
}

/** Devolve a mensagem em português do código de erro de importação. */
function messageFor(code: ImportErrorCode): string {
  return t.errors[code];
}

/** Mostra a barra fina de importação e os avisos de erro de cada arquivo. */
export function ImportStatus({ progress, errors, onDismiss }: ImportStatusProps) {
  const percent = progress !== null && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={styles.wrapper}>
      {progress !== null ? (
        <div className={styles.progress} role="status">
          <div className={styles.progressText}>
            <span className={styles.progressCount}>
              {t.media.importing} {progress.done}/{progress.total}
            </span>
            <span className={styles.progressName} title={progress.currentName}>
              {progress.currentName}
            </span>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label={t.media.importing}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      {errors.map((error) => (
        <div key={error.id} className={styles.error} role="alert">
          <div className={styles.errorText}>
            <strong className={styles.errorFile}>
              {t.errors.fileLabel}: {error.fileName}
            </strong>
            <span>{messageFor(error.code)}</span>
          </div>
          <IconButton icon={X} label={t.errors.dismiss} onClick={() => onDismiss(error.id)} />
        </div>
      ))}
    </div>
  );
}
