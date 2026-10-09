import { useEffect, type ReactNode } from 'react';
import { Film, Rows3, SlidersHorizontal, Upload, type LucideIcon } from 'lucide-react';
import { t } from './i18n/pt-BR';
import { useUiStore } from './stores';
import { TopBar } from './features/layout/TopBar';
import { PanelShell } from './features/layout/PanelShell';
import { ResizeHandle } from './components/ResizeHandle';
import styles from './App.module.css';

type ResizableKey = 'mediaWidth' | 'inspectorWidth' | 'timelineHeight';

/** Soma um delta ao tamanho atual lido da store (evita perder movimentos entre renders). */
function adjustPanel(key: ResizableKey, delta: number): void {
  const state = useUiStore.getState();
  state.setPanelSize(key, state.panelSizes[key] + delta);
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className={styles.empty}>
      <Icon size={48} strokeWidth={1.25} aria-hidden="true" className={styles.emptyIcon} />
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}

function Cell({ className, children }: { className: string | undefined; children: ReactNode }) {
  return <div className={`${styles.cell} ${className ?? ''}`}>{children}</div>;
}

export default function App() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const mediaWidth = useUiStore((s) => s.panelSizes.mediaWidth);
  const inspectorWidth = useUiStore((s) => s.panelSizes.inspectorWidth);
  const timelineHeight = useUiStore((s) => s.panelSizes.timelineHeight);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div
      className={styles.app}
      style={{
        gridTemplateColumns: `${mediaWidth}px 4px minmax(0, 1fr) 4px ${inspectorWidth}px`,
        gridTemplateRows: `44px minmax(0, 1fr) 4px ${timelineHeight}px`,
      }}
    >
      <Cell className={styles.top}>
        <TopBar theme={theme} onToggleTheme={toggleTheme} />
      </Cell>

      <Cell className={styles.media}>
        <PanelShell
          title={t.panels.media}
          actions={
            <button type="button" className={styles.importButton} disabled>
              <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{t.media.import}</span>
            </button>
          }
        >
          <EmptyState icon={Film} text={t.media.empty} />
        </PanelShell>
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
