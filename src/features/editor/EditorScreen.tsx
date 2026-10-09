import type { ReactNode } from 'react';
import { Rows3, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import { runWithToast, useProjectStore, useUiStore } from '../../stores';
import { TopBar } from '../layout/TopBar';
import { PanelShell } from '../layout/PanelShell';
import { MediaPanel } from '@/features/media/MediaPanel';
import { ResizeHandle } from '../../components/ResizeHandle';
import styles from './EditorScreen.module.css';

type ResizableKey = 'mediaWidth' | 'inspectorWidth' | 'timelineHeight';

/** Soma um delta ao tamanho atual lido da store (evita perder movimentos entre renders). */
function adjustPanel(key: ResizableKey, delta: number): void {
  const state = useUiStore.getState();
  state.setPanelSize(key, state.panelSizes[key] + delta);
}

/** Estado vazio centralizado com ícone e texto, usado nos painéis ainda sem conteúdo. */
function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className={styles.empty}>
      <Icon size={48} strokeWidth={1.25} aria-hidden="true" className={styles.emptyIcon} />
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}

/** Célula da grade do editor, posicionada pela classe recebida. */
function Cell({ className, children }: { className: string | undefined; children: ReactNode }) {
  return <div className={`${styles.cell} ${className ?? ''}`}>{children}</div>;
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

  if (project === null) {
    return null;
  }

  /** Renomeia o projeto aberto (na memória e no banco) e avisa se falhar. */
  const handleRename = (name: string): void => {
    void runWithToast(renameProjectById(project.id, name), t.errors.projectRename);
  };

  return (
    <div
      className={styles.editor}
      style={{
        gridTemplateColumns: `${mediaWidth}px 4px minmax(0, 1fr) 4px ${inspectorWidth}px`,
        gridTemplateRows: `44px minmax(0, 1fr) 4px ${timelineHeight}px`,
      }}
    >
      <Cell className={styles.top}>
        <TopBar
          theme={theme}
          onToggleTheme={toggleTheme}
          projectName={project.name}
          onBack={() => void runWithToast(closeProject(), t.errors.projectSave)}
          onRename={handleRename}
        />
      </Cell>

      <Cell className={styles.media}>
        <MediaPanel />
      </Cell>

      <Cell className={styles.handleMedia}>
        <ResizeHandle
          orientation="vertical"
          label={t.resize.media}
          onResize={(delta) => adjustPanel('mediaWidth', delta)}
        />
      </Cell>

      <Cell className={styles.preview}>
        <PanelShell title={t.panels.preview}>
          <div className={styles.stage}>
            <div className={styles.screen}>
              <span className={styles.screenText}>{t.preview.empty}</span>
            </div>
          </div>
        </PanelShell>
      </Cell>

      <Cell className={styles.handleInspector}>
        <ResizeHandle
          orientation="vertical"
          label={t.resize.inspector}
          onResize={(delta) => adjustPanel('inspectorWidth', -delta)}
        />
      </Cell>

      <Cell className={styles.inspector}>
        <PanelShell title={t.panels.inspector}>
          <EmptyState icon={SlidersHorizontal} text={t.inspector.empty} />
        </PanelShell>
      </Cell>

      <Cell className={styles.handleTimeline}>
        <ResizeHandle
          orientation="horizontal"
          label={t.resize.timeline}
          onResize={(delta) => adjustPanel('timelineHeight', -delta)}
        />
      </Cell>

      <Cell className={styles.timeline}>
        <PanelShell title={t.panels.timeline}>
          <EmptyState icon={Rows3} text={t.timeline.empty} />
        </PanelShell>
      </Cell>
    </div>
  );
}
