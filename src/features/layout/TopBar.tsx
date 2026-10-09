import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Download, Moon, Sun } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import type { Theme } from '../../types/ui';
import { IconButton } from '../../components/IconButton';
import styles from './TopBar.module.css';

export interface TopBarProps {
  theme: Theme;
  onToggleTheme: () => void;
  /** Nome do projeto aberto; sem ele a barra mostra o nome do app. */
  projectName?: string;
  /** Volta para a tela inicial; quando presente, exibe o botão de voltar. */
  onBack?: () => void;
  /** Recebe o novo nome quando o usuário renomeia o projeto no próprio cabeçalho. */
  onRename?: (name: string) => void;
}

/** Barra superior de 44px: voltar, nome do projeto (renomeável), troca de tema e exportação (desabilitada por enquanto). */
export function TopBar({ theme, onToggleTheme, projectName, onBack, onRename }: TopBarProps) {
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const activeRef = useRef(false);
  const displayName = projectName ?? t.app.title;
  const renamable = projectName !== undefined && onRename !== undefined;

  /** Abre o campo de renomear com o nome atual. */
  const startEditing = (): void => {
    setDraft(projectName ?? '');
    activeRef.current = true;
    setEditing(true);
  };

  /** Fecha o campo de renomear; salva o nome quando pedido e diferente do atual. Só age uma vez por edição. */
  const finishEditing = (save: boolean): void => {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    setEditing(false);
    const name = draft.trim();
    if (save && onRename !== undefined && name !== '' && name !== projectName) {
      onRename(name);
    }
  };

  /** Enter salva e Esc cancela. */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishEditing(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishEditing(false);
    }
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {onBack !== undefined ? (
          <IconButton icon={ArrowLeft} label={t.home.back} onClick={onBack} />
        ) : null}
      </div>

      <div className={styles.center}>
        <h1 className={styles.appName}>
          {editing ? (
            <input
              type="text"
              className={styles.nameInput}
              aria-label={t.home.rename}
              placeholder={t.home.renamePrompt}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => finishEditing(true)}
            />
          ) : renamable ? (
            <button type="button" className={styles.nameButton} title={t.home.rename} onClick={startEditing}>
              {displayName}
            </button>
          ) : (
            displayName
          )}
        </h1>
      </div>

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
