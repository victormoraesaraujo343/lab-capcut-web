import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Clapperboard, Ellipsis } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import type { ProjectSummary } from '../../engine/storage/db';
import { getObjectUrl } from '../../engine/storage/opfs';
import { exportProjectArchive } from '../../engine/archive/projectArchive';
import { useToastStore } from '../../stores';
import { downloadBlob } from '../export/downloadBlob';
import { formatDuration, formatRelativeDate } from '../../utils/time';
import styles from './ProjectCard.module.css';

/** Nome de arquivo seguro para o .zip do projeto; sem nome, usa o id. */
function archiveFileName(name: string, id: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return cleaned === '' ? id : cleaned;
}

export interface ProjectCardProps {
  /** Resumo do projeto exibido no cartão. */
  project: ProjectSummary;
  /** Abre o projeto no editor. */
  onOpen: (id: string) => void;
  /** Salva um novo nome para o projeto. */
  onRename: (id: string, name: string) => void;
  /** Cria uma cópia do projeto. */
  onDuplicate: (id: string) => void;
  /** Exclui o projeto (depois da confirmação do usuário). */
  onDelete: (id: string) => void;
}

/** Cartão de projeto: capa 16:9, nome, data, contagem de mídias e menu de ações. */
export function ProjectCard({ project, onOpen, onRename, onDuplicate, onDelete }: ProjectCardProps) {
  const [cover, setCover] = useState<{ path: string; url: string } | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [exportPercent, setExportPercent] = useState<number | null>(null);
  const pushToast = useToastStore((s) => s.pushToast);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  const coverPath = project.coverPath;
  const displayName = project.name.trim() === '' ? t.home.untitled : project.name;
  const coverUrl = coverPath !== undefined && cover?.path === coverPath ? cover.url : undefined;

  useEffect(() => {
    if (coverPath === undefined) {
      return;
    }
    let cancelled = false;
    getObjectUrl(coverPath)
      .then((url) => {
        if (!cancelled) {
          setCover({ path: coverPath, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCover(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coverPath]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    /** Fecha o menu ao clicar fora dele. */
    const handlePointer = (event: globalThis.MouseEvent): void => {
      if (menuRef.current !== null && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    /** Fecha o menu com Esc. */
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const meta = [`${t.home.editedAt} ${formatRelativeDate(project.updatedAt)}`, `${project.assetCount} ${t.home.assets}`];
  if (project.durationMs > 0) {
    meta.push(formatDuration(project.durationMs));
  }

  /** Abre o projeto com Enter ou Espaço. */
  const handleCoverKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(project.id);
    }
  };

  /** Entra no modo de renomear, com o nome atual no campo. */
  const startRename = (): void => {
    setMenuOpen(false);
    setDraft(project.name);
    activeRef.current = true;
    setRenaming(true);
  };

  /** Fecha o campo de renomear; salva quando pedido e o nome mudou. Só age uma vez por edição. */
  const finishRename = (save: boolean): void => {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    setRenaming(false);
    const name = draft.trim();
    if (save && name !== '' && name !== project.name) {
      onRename(project.id, name);
    }
  };

  /** Enter salva e Esc cancela. */
  const handleRenameKey = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishRename(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishRename(false);
    }
  };

  /** Gera o .zip do projeto, mostra o andamento no cartão e baixa o arquivo. */
  const handleExport = async (): Promise<void> => {
    setMenuOpen(false);
    setExportPercent(0);
    try {
      const blob = await exportProjectArchive(
        project.id,
        (fraction) => setExportPercent(Math.round(fraction * 100)),
        () => pushToast(t.archive.missing, 'info'),
      );
      downloadBlob(blob, `${archiveFileName(project.name, project.id)}.zip`);
    } catch {
      pushToast(t.archive.exportFailed, 'error');
    } finally {
      setExportPercent(null);
    }
  };

  /** Pede confirmação e exclui o projeto. */
  const handleDelete = (): void => {
    setMenuOpen(false);
    if (window.confirm(t.home.confirmDelete)) {
      onDelete(project.id);
    }
  };

  return (
    <article className={menuOpen ? `${styles.card} ${styles.cardActive}` : styles.card}>
      <div
        className={styles.cover}
        role="button"
        tabIndex={0}
        aria-label={`${t.home.open}: ${displayName}`}
        onClick={() => onOpen(project.id)}
        onKeyDown={handleCoverKey}
      >
        {coverUrl !== undefined ? (
          <img src={coverUrl} alt="" className={styles.coverImage} />
        ) : (
          <Clapperboard size={32} strokeWidth={1.5} aria-hidden="true" className={styles.coverIcon} />
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.info}>
          {renaming ? (
            <input
              type="text"
              className={styles.renameInput}
              aria-label={t.home.rename}
              placeholder={t.home.renamePrompt}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleRenameKey}
              onBlur={() => finishRename(true)}
            />
          ) : (
            <h3 className={styles.name} title={displayName}>
              {displayName}
            </h3>
          )}
          <p className={styles.meta}>{meta.join(' · ')}</p>
          {exportPercent !== null ? (
            <p className={styles.meta}>{`${t.archive.exporting} ${exportPercent}%`}</p>
          ) : null}
        </div>

        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.moreButton}
            aria-label={t.home.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div role="menu" className={styles.menu}>
              <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setMenuOpen(false); onOpen(project.id); }}>
                {t.home.open}
              </button>
              <button type="button" role="menuitem" className={styles.menuItem} onClick={startRename}>
                {t.home.rename}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => { setMenuOpen(false); onDuplicate(project.id); }}
              >
                {t.home.duplicate}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                disabled={exportPercent !== null}
                onClick={() => void handleExport()}
              >
                {t.archive.export}
              </button>
              <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleDelete}>
                {t.home.delete}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
