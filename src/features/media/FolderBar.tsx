// Barra de chips de pastas da biblioteca: filtra, cria, renomeia, exclui e recebe cards arrastados.

import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import type { Folder } from '@/types/project';
import { ASSET_DRAG_MIME, isAssetDrag } from './MediaCard';
import styles from './FolderBar.module.css';

export interface FolderBarProps {
  /** Pastas da biblioteca. */
  folders: Folder[];
  /** Pasta selecionada, ou null para toda a mídia. */
  activeFolderId: string | null;
  /** Seleciona uma pasta, ou null para toda a mídia. */
  onSelect: (folderId: string | null) => void;
  /** Cria uma pasta e devolve seu id. */
  onCreate: (name: string) => string;
  /** Renomeia uma pasta. */
  onRename: (folderId: string, name: string) => void;
  /** Exclui uma pasta. */
  onDelete: (folderId: string) => void;
  /** Move um asset arrastado para a pasta dada. */
  onDropAsset: (assetId: string, folderId: string) => void;
}

/** Linha de chips: "Toda a mídia", uma opção por pasta e botão para criar pasta com input inline. */
export function FolderBar({
  folders,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropAsset,
}: FolderBarProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function startCreate() {
    setDraft('');
    setEditingId(null);
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setDraft('');
  }

  function commitCreate() {
    const name = draft.trim();
    setCreating(false);
    setDraft('');
    if (name === '') {
      return;
    }
    onSelect(onCreate(name));
  }

  function startRename(folder: Folder) {
    setCreating(false);
    setDraft(folder.name);
    setEditingId(folder.id);
  }

  function cancelRename() {
    setEditingId(null);
    setDraft('');
  }

  function commitRename(folder: Folder) {
    const name = draft.trim();
    setEditingId(null);
    setDraft('');
    if (name !== '' && name !== folder.name) {
      onRename(folder.id, name);
    }
  }

  function handleCreateKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitCreate();
    } else if (event.key === 'Escape') {
      cancelCreate();
    }
  }

  function handleRenameKey(event: KeyboardEvent<HTMLInputElement>, folder: Folder) {
    if (event.key === 'Enter') {
      commitRename(folder);
    } else if (event.key === 'Escape') {
      cancelRename();
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, folderId: string) {
    if (!isAssetDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTargetId(folderId);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, folderId: string) {
    setDropTargetId(null);
    if (!isAssetDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME);
    if (assetId !== '') {
      onDropAsset(assetId, folderId);
    }
  }

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={`${styles.chip} ${activeFolderId === null ? styles.chipActive : ''}`}
        aria-pressed={activeFolderId === null}
        onClick={() => onSelect(null)}
      >
        {t.media.allMedia}
      </button>

      {folders.map((folder) => {
        const active = folder.id === activeFolderId;
        const editing = editingId === folder.id;
        const chipClass = [
          styles.chip,
          active ? styles.chipActive : '',
          dropTargetId === folder.id ? styles.chipDrop : '',
        ].join(' ');
        return (
          <div
            key={folder.id}
            className={chipClass}
            onDoubleClick={() => startRename(folder)}
            onDragOver={(event) => handleDragOver(event, folder.id)}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(event) => handleDrop(event, folder.id)}
          >
            {editing ? (
              <input
                className={styles.input}
                aria-label={t.media.renameFolder}
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => handleRenameKey(event, folder)}
                onBlur={cancelRename}
              />
            ) : (
              <button
                type="button"
                className={styles.chipLabel}
                aria-pressed={active}
                onClick={() => onSelect(folder.id)}
              >
                {folder.name}
              </button>
            )}
            {active && !editing ? (
              <IconButton
                icon={X}
                label={t.media.deleteFolder}
                className={styles.deleteButton}
                onClick={() => {
                  onDelete(folder.id);
                  onSelect(null);
                }}
              />
            ) : null}
          </div>
        );
      })}

      {creating ? (
        <input
          className={styles.input}
          aria-label={t.media.folderName}
          placeholder={t.media.folderName}
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleCreateKey}
          onBlur={cancelCreate}
        />
      ) : (
        <button type="button" className={styles.newButton} onClick={startCreate}>
          <FolderPlus size={14} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.media.newFolder}</span>
        </button>
      )}
    </div>
  );
}
