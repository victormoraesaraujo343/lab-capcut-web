// Painel da prévia: palco com o canvas WebGL encaixado no quadro do projeto, controles e seletor de proporção.
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { PanelShell } from '../layout/PanelShell';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from '@/stores';
import type { AspectRatio } from '@/types';
import { PreviewControls } from './PreviewControls';
import { ProxyToggle } from './ProxyToggle';
import { fitStage } from './stageFit';
import { startPlaybackController } from './playbackController';
import { disposePreviewEngine } from './previewEngine';
import { usePreviewRenderer } from './usePreviewRenderer';
import styles from './PreviewPanel.module.css';

/** Proporções oferecidas no cabeçalho da prévia, com o rótulo exibido. */
const ASPECT_OPTIONS: ReadonlyArray<{ value: AspectRatio; label: string }> = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '4:3', label: '4:3' },
  { value: 'free', label: t.preview.aspectFree },
];

/** Seletor compacto de proporção do projeto, na área de ações do cabeçalho. */
function AspectSelect() {
  const aspect = useProjectStore((state) => state.project?.aspectRatio ?? 'free');
  const hasProject = useProjectStore((state) => state.project !== null);

  /** Troca a proporção pela opção escolhida. */
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const option = ASPECT_OPTIONS.find((item) => item.value === event.target.value);
    if (option !== undefined) useProjectStore.getState().setAspectRatio(option.value);
  };

  return (
    <select
      className={styles.aspect}
      aria-label={t.preview.aspect}
      title={t.preview.aspect}
      value={aspect}
      disabled={!hasProject}
      onChange={handleChange}
    >
      {ASPECT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Painel da prévia; children são desenhados por cima do quadro do projeto (ex.: alça de transformação). */
export function PreviewPanel({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const projectWidth = useProjectStore((state) => state.project?.width ?? 0);
  const projectHeight = useProjectStore((state) => state.project?.height ?? 0);
  const hasClips = useProjectStore((state) => (state.project?.tracks ?? []).some((track) => track.clips.length > 0));
  const { error } = usePreviewRenderer(canvasRef);

  // Acompanha o tamanho do palco para encaixar o quadro.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return undefined;
    const measure = (): void => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Liga o relógio de reprodução a este painel; ao desmontar, para o controlador e libera o motor da prévia.
  useEffect(() => {
    const stopPlayback = startPlaybackController();
    return () => {
      stopPlayback();
      disposePreviewEngine();
    };
  }, []);

  const frame = fitStage(stageSize.width, stageSize.height, projectWidth, projectHeight);

  return (
    <PanelShell
      title={t.panels.preview}
      actions={
        <>
          <ProxyToggle />
          <AspectSelect />
        </>
      }
    >
      <div className={styles.root}>
        <div ref={stageRef} className={styles.stage}>
          {error === 'webgl' ? (
            <p className={styles.message}>{t.preview.webglError}</p>
          ) : (
            <div
              className={styles.frame}
              data-preview-stage=""
              style={{ width: frame.width, height: frame.height, left: frame.left, top: frame.top }}
            >
              <canvas ref={canvasRef} className={styles.canvas} aria-label={t.preview.canvas} />
              {children}
            </div>
          )}
          {hasClips ? null : <p className={styles.empty}>{t.preview.empty}</p>}
        </div>
        <PreviewControls fullscreenTarget={stageRef} />
      </div>
    </PanelShell>
  );
}
