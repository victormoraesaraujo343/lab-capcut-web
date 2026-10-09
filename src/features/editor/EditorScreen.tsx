import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../../i18n/pt-BR';
import { runWithToast, useProjectStore, usePlaybackStore, useUiStore } from '../../stores';
import { TopBar } from '../layout/TopBar';
import { ExportDialog } from '../export/ExportDialog';
import { InspectorPanel } from '@/features/inspector/InspectorPanel';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import { TimelinePanel } from '@/features/timeline/TimelinePanel';
import { PreviewPanel } from '@/features/preview/PreviewPanel';
import { TransformOverlay } from '@/features/preview/TransformOverlay';
import { disposeTranscriber } from '@/engine/captions/transcribeClient';
import { ResizeHandle } from '../../components/ResizeHandle';
import { HANDLE_SIZE, TOP_BAR_HEIGHT, computeEditorLayout } from './editorLayout';
import styles from './EditorScreen.module.css';

type ResizableKey = 'mediaWidth' | 'inspectorWidth' | 'timelineHeight';

/** Soma um delta ao tamanho atual lido da store (evita perder movimentos entre renders). */
function adjustPanel(key: ResizableKey, delta: number): void {
  const state = useUiStore.getState();
  state.setPanelSize(key, state.panelSizes[key] + delta);
}

/** Célula da grade do editor, posicionada pela classe e, se houver, pela coluna recebida. */
function Cell({
  className,
  column,
  children,
}: {
  className: string | undefined;
  column?: number;
  children: ReactNode;
}) {
  const style = column === undefined ? undefined : { gridColumn: column };
  return (
    <div className={`${styles.cell} ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

/** Lê a largura e a altura da janela. */
function readViewport(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Tela do editor: barra superior, quatro painéis e alças de redimensionamento. */
export function EditorScreen() {
  const project = useProjectStore((s) => s.project);
  const closeProject = useProjectStore((s) => s.closeProject);
  const renameProjectById = useProjectStore((s) => s.renameProjectById);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const mediaWidth = useUiStore((s) => s.panelSizes.mediaWidth);
  const inspectorWidth = useUiStore((s) => s.panelSizes.inspectorWidth);
  const timelineHeight = useUiStore((s) => s.panelSizes.timelineHeight);
  const [viewport, setViewport] = useState(readViewport);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ao sair do editor, encerra o worker de transcrição (libera a memória do modelo).
  useEffect(() => () => disposeTranscriber(), []);

  const layout = computeEditorLayout(viewport.w, viewport.h, {
    mediaWidth,
    inspectorWidth,
    timelineHeight,
  });

  if (project === null) {
    return null;
  }

  /** Renomeia o projeto aberto (na memória e no banco) e avisa se falhar. */
  const handleRename = (name: string): void => {
    void runWithToast(renameProjectById(project.id, name), t.errors.projectRename);
  };

  // Colunas visíveis, na ordem da grade; painéis escondidos não entram.
  const columns: Array<{ key: string; size: string }> = [];
  if (layout.showMedia) {
    columns.push({ key: 'media', size: `${layout.mediaWidth}px` }, { key: 'handleMedia', size: `${HANDLE_SIZE}px` });
  }
  columns.push({ key: 'preview', size: 'minmax(0, 1fr)' });
  if (layout.showInspector) {
    columns.push({ key: 'handleInspector', size: `${HANDLE_SIZE}px` }, { key: 'inspector', size: `${layout.inspectorWidth}px` });
  }
  const colOf = (key: string): number => columns.findIndex((c) => c.key === key) + 1;

  /** Abre o diálogo de exportação e pausa a reprodução. */
  const openExport = (): void => {
    usePlaybackStore.getState().pause();
    setExportOpen(true);
  };

  return (
    <>
      <div
        className={styles.editor}
        style={{
          gridTemplateColumns: columns.map((c) => c.size).join(' '),
          gridTemplateRows: `${TOP_BAR_HEIGHT}px minmax(0, 1fr) ${HANDLE_SIZE}px ${layout.timelineHeight}px`,
        }}
      >
        <Cell className={styles.top}>
          <TopBar
            theme={theme}
            onToggleTheme={toggleTheme}
            projectName={project.name}
            onBack={() => void runWithToast(closeProject(), t.errors.projectSave)}
            onRename={handleRename}
            onExport={openExport}
          />
        </Cell>

        {layout.showMedia && (
          <>
            <Cell className={styles.media} column={colOf('media')}>
              <LibraryPanel />
            </Cell>

            <Cell className={styles.handleMedia} column={colOf('handleMedia')}>
              <ResizeHandle
                orientation="vertical"
                label={t.resize.media}
                onResize={(delta) => adjustPanel('mediaWidth', delta)}
              />
            </Cell>
          </>
        )}

        <Cell className={styles.preview} column={colOf('preview')}>
          <PreviewPanel>
            <TransformOverlay />
          </PreviewPanel>
        </Cell>

        {layout.showInspector && (
          <>
            <Cell className={styles.handleInspector} column={colOf('handleInspector')}>
              <ResizeHandle
                orientation="vertical"
                label={t.resize.inspector}
                onResize={(delta) => adjustPanel('inspectorWidth', -delta)}
              />
            </Cell>

            <Cell className={styles.inspector} column={colOf('inspector')}>
              <InspectorPanel />
            </Cell>
          </>
        )}

        <Cell className={styles.handleTimeline}>
          <ResizeHandle
            orientation="horizontal"
            label={t.resize.timeline}
            onResize={(delta) => adjustPanel('timelineHeight', -delta)}
          />
        </Cell>

        <Cell className={styles.timeline}>
          <TimelinePanel />
        </Cell>
      </div>
      {exportOpen && <ExportDialog project={project} onClose={() => setExportOpen(false)} />}
    </>
  );
}
