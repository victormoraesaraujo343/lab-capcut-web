import { X } from 'lucide-react';
import { t } from '../i18n/pt-BR';
import { useToastStore } from '../stores';
import { IconButton } from './IconButton';
import styles from './Toaster.module.css';

/** Lista fixa de avisos no canto inferior direito; erros são anunciados com role="alert". */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={styles.stack}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={toast.kind === 'error' ? `${styles.toast} ${styles.error}` : styles.toast}
        >
          <p className={styles.message}>{toast.message}</p>
          <IconButton icon={X} label={t.errors.dismiss} onClick={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
