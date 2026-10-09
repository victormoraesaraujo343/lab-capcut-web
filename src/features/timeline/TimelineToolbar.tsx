// Barra de ferramentas da timeline: desfazer/refazer, ferramentas, edição (com menu de ações menos usadas), reprodução, ímã e zoom.
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  ListX,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  Redo2,
  Scissors,
  SquareSplitHorizontal,
  Trash2,
  Ungroup,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { RecordButton } from '@/features/recording/RecordButton';
import { canRedo, canUndo } from '@/engine/timeline/history';
import { t } from '@/i18n/pt-BR';
import {
  copySelected,
  deleteSelected,
  duplicateSelected,
  groupSelected,
  pasteAtPlayhead,
  splitAtPlayhead,
  trimSelectedToPlayhead,
  ungroupSelected,
} from '@/stores/timelineCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { formatTimecode } from '@/utils/time';
import styles from './TimelineToolbar.module.css';

/** Zoom mínimo e máximo da timeline, em px por segundo, usados pelo slider logarítmico. */
const ZOOM_MIN = 10;
const ZOOM_MAX = 2000;

/** Relógio com o tempo atual e a duração; só este trecho assina a posição do cursor. */
function TimecodeReadout() {
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const fps = useProjectStore((state) => state.project?.fps ?? 0);
  const durationMs = useProjectStore((state) => state.project?.durationMs ?? 0);
  return (
    <div className={styles.timecode}>
      <span>{formatTimecode(currentTimeMs, fps)}</span>
      <span className={styles.timecodeTotal}>/ {formatTimecode(durationMs, fps)}</span>
    </div>
  );
}

/** Botão de reproduzir ou pausar, que assina só o estado de reprodução. */
function PlayButton() {
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const togglePlay = usePlaybackStore((state) => state.togglePlay);
  return (
    <IconButton
      icon={isPlaying ? Pause : Play}
      label={isPlaying ? t.timeline.pause : t.timeline.play}
      className={styles.playButton}
      onClick={togglePlay}
    />
  );
}

/** Item do menu de ações: ícone, texto e ação; a ação fecha o menu depois de rodar. */
interface MenuAction {
  /** Ícone exibido ao lado do texto. */
  icon: LucideIcon;
  /** Texto do item. */
  label: string;
  /** Ação executada ao escolher o item. */
  run: () => void;
  /** Se o item pode ser escolhido agora. */
  enabled: boolean;
}

/** Menu "⋯" com as ações de edição menos usadas, para a barra não estourar. Fecha com Esc ou clique fora. */
function MoreActionsMenu({ actions }: { actions: MenuAction[] }) {
  // Posição do menu, em px da janela; null quando fechado.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setAnchor(null);
    const onPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && wrapRef.current?.contains(event.target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /** Abre ou fecha o menu, ancorado no botão "⋯". */
  const toggle = (): void => {
    if (open) {
      setAnchor(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  return (
    <div ref={wrapRef} className={styles.menuWrap}>
      <IconButton
        icon={MoreHorizontal}
        label={t.home.moreActions}
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? styles.active : undefined}
        onClick={toggle}
      />
      {anchor !== null ? (
        <div role="menu" className={styles.menu} style={{ top: anchor.top, right: anchor.right }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              disabled={!action.enabled}
              onClick={() => {
                setAnchor(null);
                action.run();
              }}
            >
              <action.icon size={16} strokeWidth={1.75} aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Barra de 40px acima da linha do tempo, com as ações de edição e o controle de zoom. */
export function TimelineToolbar() {
  const hasProject = useProjectStore((state) => state.project !== null);
  const undoable = useTimelineStore((state) => canUndo(state.history));
  const redoable = useTimelineStore((state) => canRedo(state.history));
  const hasSelection = useTimelineStore((state) => state.selectedClipIds.length > 0);
  const hasClipboard = useTimelineStore((state) => state.clipboard !== null);
  const tool = useTimelineStore((state) => state.tool);
  const snapEnabled = useTimelineStore((state) => state.snapEnabled);
  const zoom = useTimelineStore((state) => state.zoom);
  const undo = useTimelineStore((state) => state.undo);
  const redo = useTimelineStore((state) => state.redo);
  const setTool = useTimelineStore((state) => state.setTool);
  const setZoom = useTimelineStore((state) => state.setZoom);
  const zoomBy = useTimelineStore((state) => state.zoomBy);
  const toggleSnap = useTimelineStore((state) => state.toggleSnap);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t.panels.timeline}>
      <div className={styles.group}>
        <IconButton icon={Undo2} label={t.timeline.undo} onClick={undo} disabled={!undoable} />
        <IconButton icon={Redo2} label={t.timeline.redo} onClick={redo} disabled={!redoable} />
      </div>

      <span className={styles.separator} aria-hidden="true" />

      <div className={styles.group}>
        <IconButton
          icon={MousePointer2}
          label={t.timeline.selectTool}
          aria-pressed={tool === 'select'}
          className={tool === 'select' ? styles.active : undefined}
          onClick={() => setTool('select')}
        />
        <IconButton
          icon={Scissors}
          label={t.timeline.bladeTool}
          aria-pressed={tool === 'blade'}
          className={tool === 'blade' ? styles.active : undefined}
          onClick={() => setTool('blade')}
        />
      </div>

      <span className={styles.separator} aria-hidden="true" />

      <div className={styles.group}>
        <IconButton
          icon={SquareSplitHorizontal}
          label={t.timeline.split}
          onClick={() => splitAtPlayhead()}
          disabled={!hasProject}
        />
        <IconButton
          icon={ArrowLeftToLine}
          label={t.timeline.trimStart}
          onClick={() => trimSelectedToPlayhead('start')}
          disabled={!hasSelection}
        />
        <IconButton
          icon={ArrowRightToLine}
          label={t.timeline.trimEnd}
          onClick={() => trimSelectedToPlayhead('end')}
          disabled={!hasSelection}
        />
        <IconButton
          icon={Trash2}
          label={t.timeline.delete}
          onClick={() => deleteSelected(false)}
          disabled={!hasSelection}
        />
        <IconButton
          icon={Copy}
          label={t.timeline.copy}
          onClick={() => copySelected()}
          disabled={!hasSelection}
        />
        <IconButton
          icon={ClipboardPaste}
          label={t.timeline.paste}
          onClick={() => pasteAtPlayhead()}
          disabled={!hasProject || !hasClipboard}
        />
        <MoreActionsMenu
          actions={[
            {
              icon: ListX,
              label: t.timeline.rippleDelete,
              run: () => deleteSelected(true),
              enabled: hasSelection,
            },
            {
              icon: CopyPlus,
              label: t.timeline.duplicate,
              run: () => duplicateSelected(),
              enabled: hasSelection,
            },
            { icon: Group, label: t.timeline.group, run: () => groupSelected(), enabled: hasSelection },
            { icon: Ungroup, label: t.timeline.ungroup, run: () => ungroupSelected(), enabled: hasSelection },
          ]}
        />
      </div>

      <div className={styles.center}>
        <RecordButton />
        <PlayButton />
        <TimecodeReadout />
      </div>

      <div className={styles.group}>
        <IconButton
          icon={Magnet}
          label={snapEnabled ? t.timeline.snapOn : t.timeline.snapOff}
          aria-pressed={snapEnabled}
          className={snapEnabled ? styles.active : undefined}
          onClick={toggleSnap}
        />
        <IconButton icon={ZoomOut} label={t.timeline.zoomOut} onClick={() => zoomBy(0.8)} />
        <input
          type="range"
          className={styles.zoomSlider}
          aria-label={t.timeline.zoomLevel}
          min={Math.log(ZOOM_MIN)}
          max={Math.log(ZOOM_MAX)}
          step="any"
          value={Math.log(zoom)}
          onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
        />
        <IconButton icon={ZoomIn} label={t.timeline.zoomIn} onClick={() => zoomBy(1.25)} />
      </div>
    </div>
  );
}
