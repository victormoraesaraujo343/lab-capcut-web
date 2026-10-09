import type { ReactNode } from 'react';
import styles from './PanelShell.module.css';

export interface PanelShellProps {
  /** Título do painel, exibido em maiúsculas no cabeçalho. */
  title: string;
  children?: ReactNode;
  /** Controles à direita do cabeçalho. */
  actions?: ReactNode;
}

/** Moldura padrão de um painel: cabeçalho de 36px e corpo rolável. */
export function PanelShell({ title, children, actions }: PanelShellProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
