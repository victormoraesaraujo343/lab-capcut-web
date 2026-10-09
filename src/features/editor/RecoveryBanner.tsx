// Banner que oferece recuperar as alterações de uma sessão que terminou sem fechar o projeto.

import { t } from '@/i18n/pt-BR';
import { formatClock } from '@/engine/storage/recovery';
import { useRecoveryStore } from '@/stores/autosave';
import styles from './RecoveryBanner.module.css';

/** Faixa de recuperação, com a hora das alterações e os botões Recuperar e Descartar; some sem oferta. */
export function RecoveryBanner() {
  const offer = useRecoveryStore((s) => s.offer);
  const recover = useRecoveryStore((s) => s.recover);
  const discard = useRecoveryStore((s) => s.discard);

  if (offer === null) return null;

  const message = t.autosave.recoveryMessage.replace('{time}', formatClock(offer.project.updatedAt));

  return (
    <section role="region" aria-label={t.autosave.recoveryRegion} className={styles.banner}>
      <p role="alert" className={styles.message}>
        {message}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} autoFocus onClick={() => void recover()}>
          {t.autosave.recover}
        </button>
        <button type="button" className={styles.secondary} onClick={() => void discard()}>
          {t.autosave.discard}
        </button>
      </div>
    </section>
  );
}
