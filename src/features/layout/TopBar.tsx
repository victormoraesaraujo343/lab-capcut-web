import { Download, Moon, Sun } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import type { Theme } from '../../types/ui';
import { IconButton } from '../../components/IconButton';
import styles from './TopBar.module.css';

export interface TopBarProps {
  theme: Theme;
  onToggleTheme: () => void;
}

/** Barra superior de 44px: nome do app, troca de tema e exportação (desabilitada por enquanto). */
export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  return (
    <header className={styles.topbar}>
      <h1 className={styles.appName}>{t.app.title}</h1>
      <div className={styles.right}>
        <IconButton icon={ThemeIcon} label={t.app.toggleTheme} onClick={onToggleTheme} />
        <button type="button" className={styles.exportButton} disabled>
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.app.export}</span>
        </button>
      </div>
    </header>
  );
}
