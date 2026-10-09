// Indicador discreto do estado do salvamento ("Salvando…", "Salvo às HH:MM", "Erro ao salvar"), mostrado no topo do editor.

import { t } from '@/i18n/pt-BR';
import { formatClock } from '@/engine/storage/recovery';
import { useSaveStatusStore } from '@/stores/projectPersistence';
import styles from './SaveStatus.module.css';

/** Texto de estado do salvamento; vazio quando ainda não há nada a mostrar. */
export function SaveStatus() {
  const saveState = useSaveStatusStore((s) => s.saveState);
  const lastSavedAt = useSaveStatusStore((s) => s.lastSavedAt);

  if (saveState === 'idle') return null;
  if (saveState === 'error') {
    return (
      <p role="status" className={`${styles.status} ${styles.error}`}>
        {t.autosave.error}
      </p>
    );
  }
  if (saveState === 'saving') {
    return (
      <p role="status" className={styles.status}>
        {t.autosave.saving}
      </p>
    );
  }
  if (lastSavedAt === null) return null;
  return (
    <p role="status" className={styles.status}>
      {t.autosave.saved.replace('{time}', formatClock(lastSavedAt))}
    </p>
  );
}
