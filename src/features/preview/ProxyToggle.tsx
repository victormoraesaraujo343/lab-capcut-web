// Botão da prévia leve: liga ou desliga as cópias 540p dos vídeos e mostra o andamento da geração.
import { Gauge } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { useJobsStore } from '@/stores/jobsStore';
import { setProxyPreviewEnabled } from '@/stores/proxyCommands';
import { useProxySettingsStore } from '@/stores/proxySettingsStore';
import styles from './PreviewPanel.module.css';

/** Botão alternável da prévia leve, com o indicador de geração quando há cópia sendo feita. */
export function ProxyToggle() {
  const enabled = useProxySettingsStore((state) => state.enabled);
  const running = useJobsStore((state) => state.jobs.find((job) => job.kind === 'proxy' && job.status === 'running'));

  return (
    <>
      <button
        type="button"
        className={enabled ? `${styles.aspect} ${styles.pressed}` : styles.aspect}
        aria-pressed={enabled}
        title={t.proxy.hint}
        onClick={() => setProxyPreviewEnabled(!enabled)}
      >
        <Gauge size={14} aria-hidden="true" /> {t.proxy.toggle}
      </button>
      {running === undefined ? null : (
        <span role="status" aria-live="polite">
          {`${t.proxy.generating} ${Math.round(running.progress * 100)}${t.inspector.unitPercent}`}
        </span>
      )}
    </>
  );
}
