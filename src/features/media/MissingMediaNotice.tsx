// Aviso no topo do painel de mídia: quantos arquivos do projeto não foram encontrados.

import { t } from '@/i18n/pt-BR';
import { useMissingMediaStore } from '@/stores/relinkCommands';
import styles from './MissingMediaNotice.module.css';

/** Mostra quantas mídias do projeto não foram encontradas; sem nenhuma ausente, não aparece. */
export function MissingMediaNotice() {
  const missingCount = useMissingMediaStore((s) => s.missingIds.length);

  if (missingCount === 0) return null;

  const text =
    missingCount === 1 ? t.missingMedia.noticeOne : t.missingMedia.noticeMany.replace('{count}', String(missingCount));

  return (
    <p role="status" className={styles.notice}>
      {text}
    </p>
  );
}
