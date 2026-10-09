// Painel de mídia: busca, pastas, importação por botão ou arrastar arquivos, erros e grade de cards.

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Film, Search, Upload } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from '@/engine/decode/mediaKind';
import { PanelShell } from '@/features/layout/PanelShell';
import { t } from '@/i18n/pt-BR';
import { runWithToast, useProjectStore } from '@/stores';
import { relinkAsset, useMissingMediaStore } from '@/stores/relinkCommands';
import { FolderBar } from './FolderBar';
import { ImportStatus } from './ImportStatus';
import { MediaCard, isAssetDrag } from './MediaCard';
import { MissingMediaNotice } from './MissingMediaNotice';
import { filterAssets } from './filterAssets';
import styles from './MediaPanel.module.css';

/** Linha que junta busca e botão de importar no modo embutido. */
const EMBEDDED_ROW_STYLE = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } as const;

/** Campo de busca que ocupa o espaço restante da linha no modo embutido. */
const EMBEDDED_SEARCH_STYLE = { flex: 1, minWidth: 0 } as const;

/** Indica se um DataTransfer carrega arquivos vindos do sistema (e não um card arrastado do painel). */
function carriesFiles(dataTransfer: DataTransfer): boolean {
  return !isAssetDrag(dataTransfer) && Array.from(dataTransfer.types).includes('Files');
}

/** Propriedades do painel de mídia. */
export interface MediaPanelProps {
  /** Sem a moldura do painel: só o conteúdo, com o botão de importar ao lado do campo de busca. */
  embedded?: boolean;
}

/** Painel completo de mídia do projeto aberto; sem projeto, mostra só o cabeçalho com o botão de importar desabilitado. */
export function MediaPanel({ embedded = false }: MediaPanelProps) {
  const project = useProjectStore((s) => s.project);
  const importProgress = useProjectStore((s) => s.importProgress);
  const importErrors = useProjectStore((s) => s.importErrors);
  const importFiles = useProjectStore((s) => s.importFiles);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const dismissImportError = useProjectStore((s) => s.dismissImportError);
  const createFolder = useProjectStore((s) => s.createFolder);
  const renameFolder = useProjectStore((s) => s.renameFolder);
  const deleteFolder = useProjectStore((s) => s.deleteFolder);
  const moveAssetToFolder = useProjectStore((s) => s.moveAssetToFolder);

  const missingIds = useMissingMediaStore((s) => s.missingIds);

  const [query, setQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [filesDragging, setFilesDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const relinkTargetRef = useRef<string | null>(null);

  const activeFolderId = project?.folders.some((folder) => folder.id === selectedFolderId) ? selectedFolderId : null;
  const visibleAssets = useMemo(
    () =>
      project === null
        ? []
        : filterAssets(
            project.assets.filter((asset) => asset.kind !== 'sticker'),
            query,
            activeFolderId,
          ),
    [project, query, activeFolderId],
  );

  /** Recebe os arquivos escolhidos no seletor do sistema. */
  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) {
      void importFiles(files, activeFolderId ?? undefined);
    }
  }

  /** Abre o seletor de arquivo para localizar a mídia ausente indicada. */
  function handleLocate(assetId: string) {
    relinkTargetRef.current = assetId;
    relinkInputRef.current?.click();
  }

  /** Recebe o arquivo escolhido e grava-o no caminho da mídia ausente. */
  function handleRelinkFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const assetId = relinkTargetRef.current;
    event.target.value = '';
    relinkTargetRef.current = null;
    if (file !== undefined && assetId !== null) {
      void runWithToast(relinkAsset(assetId, file), t.missingMedia.relinkError);
    }
  }

  /** Mostra o overlay quando arquivos do sistema entram sobre o painel. */
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setFilesDragging(true);
  }

  /** Esconde o overlay quando o cursor sai do painel. */
  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    setFilesDragging(false);
  }

  /** Importa os arquivos soltados sobre o painel. */
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setFilesDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (project !== null && files.length > 0) {
      void importFiles(files, activeFolderId ?? undefined);
    }
  }

  const importButton = (
    <button
      type="button"
      className={styles.importButton}
      disabled={project === null}
      onClick={() => inputRef.current?.click()}
    >
      <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{t.media.import}</span>
    </button>
  );

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      accept={ACCEPT_ATTRIBUTE}
      onChange={handleFileInput}
    />
  );

  const relinkInput = (
    <input ref={relinkInputRef} type="file" hidden accept={ACCEPT_ATTRIBUTE} onChange={handleRelinkFile} />
  );

  const searchField = (
    <div className={styles.search}>
      <Search size={14} strokeWidth={1.75} aria-hidden="true" />
      <input
        type="search"
        className={styles.searchInput}
        placeholder={t.media.search}
        aria-label={t.media.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </div>
  );

  // Modo embutido: busca e botão de importar lado a lado, sem a moldura do painel.
  const searchRow = embedded ? (
    <div style={EMBEDDED_ROW_STYLE}>
      <div style={EMBEDDED_SEARCH_STYLE}>{searchField}</div>
      {importButton}
    </div>
  ) : (
    searchField
  );

  const body = (
    <>
      {fileInput}
      {relinkInput}

      {project === null ? (
        embedded ? <div className={styles.content}>{importButton}</div> : null
      ) : (
        <div className={styles.content}>
          {searchRow}

          <MissingMediaNotice />

          <FolderBar
            folders={project.folders}
            activeFolderId={activeFolderId}
            onSelect={setSelectedFolderId}
            onCreate={createFolder}
            onRename={renameFolder}
            onDelete={deleteFolder}
            onDropAsset={moveAssetToFolder}
          />

          <ImportStatus progress={importProgress} errors={importErrors} onDismiss={dismissImportError} />

          {!project.assets.some((asset) => asset.role === undefined) ? (
            <div className={styles.empty}>
              <Film size={32} strokeWidth={1.5} aria-hidden="true" />
              <p className={styles.emptyText}>{t.media.empty}</p>
            </div>
          ) : visibleAssets.length === 0 ? (
            <p className={styles.emptyText}>{t.media.noResults}</p>
          ) : (
            <ul className={styles.grid} aria-label={t.panels.media}>
              {visibleAssets.map((asset) => (
                <MediaCard
                  key={asset.id}
                  asset={asset}
                  folders={project.folders}
                  onMove={moveAssetToFolder}
                  onRemove={removeAsset}
                  missing={missingIds.includes(asset.id)}
                  onLocate={handleLocate}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      className={styles.root}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {embedded ? body : <PanelShell title={t.panels.media} actions={importButton}>{body}</PanelShell>}

      {filesDragging && project !== null ? (
        <div className={styles.dropOverlay}>
          <span className={styles.dropText}>{t.media.dropHere}</span>
        </div>
      ) : null}
    </div>
  );
}
