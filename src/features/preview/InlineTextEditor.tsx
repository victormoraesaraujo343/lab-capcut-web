// Editor de texto sobre a prévia: uma textarea transparente posicionada em cima da camada de texto, com o mesmo centro, rotação e estilo.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { t } from '@/i18n/pt-BR';
import { resolveLayers } from '@/engine/render/composition';
import { textPadding } from '@/engine/text/textLayout';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { updateText } from '@/stores/textCommands';
import type { Layer, Project } from '@/types';
import { measureLayers } from './measuredLayers';
import styles from './InlineTextEditor.module.css';

/** Propriedades do editor: o clipe de texto a editar e o que fazer ao fechar. */
interface InlineTextEditorProps {
  /** Clipe de texto em edição. */
  clipId: string;
  /** Chamado quando o editor deve fechar (Esc, clique fora, Ctrl/Cmd+Enter). */
  onClose: () => void;
}

/** Camada de texto do clipe no instante atual, já com o tamanho medido; undefined se não aparece. */
function findTextLayer(project: Project | null, clipId: string, timelineMs: number): Layer | undefined {
  if (project === null) return undefined;
  return measureLayers(resolveLayers(project, timelineMs)).find((layer) => layer.clipId === clipId && layer.text !== undefined);
}

/** Estilo CSS da textarea: caixa do tamanho natural do texto na escala de exibição, depois rotação e escala do clipe. */
function editorStyle(layer: Layer, project: Project, displayScale: number): CSSProperties {
  const text = layer.text;
  if (text === undefined) return {};
  const { style } = text.data;
  // Texto não tem recorte: o centro é o do quadro deslocado pela posição do clipe.
  const cx = project.width / 2 + layer.transform.x;
  const cy = project.height / 2 + layer.transform.y;
  const width = layer.sourceWidth * displayScale;
  const height = layer.sourceHeight * displayScale;
  const margin = (textPadding(style) + Math.max(0, style.strokeWidth) / 2) * displayScale;
  const family = style.fontFamily.replace(/["\\]/g, '');
  return {
    left: cx * displayScale - width / 2,
    top: cy * displayScale - height / 2,
    width,
    height,
    padding: margin,
    fontFamily: `"${family}", sans-serif`,
    fontSize: style.fontSize * displayScale,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    textAlign: style.align,
    letterSpacing: `${style.letterSpacing * displayScale}px`,
    lineHeight: style.lineHeight,
    color: style.color,
    transform: `rotate(${layer.transform.rotation}deg) scale(${layer.transform.scaleX}, ${layer.transform.scaleY})`,
  };
}

/** Editor de texto em cima da prévia: abre com o texto todo selecionado; cada mudança grava no histórico agrupada. */
export function InlineTextEditor({ clipId, onClose }: InlineTextEditorProps): ReactElement | null {
  const project = useProjectStore((s) => s.project);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const wrapRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const layer = findTextLayer(project, clipId, currentTimeMs);
  const displayScale = project !== null && project.width > 0 ? stageWidth / project.width : 0;
  // Só há textarea quando a camada existe e a prévia já tem largura medida.
  const ready = project !== null && layer?.text !== undefined && displayScale > 0;

  // Acompanha a largura exibida da prévia (o próprio wrapper ocupa o mesmo espaço).
  useEffect(() => {
    const el = wrapRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setStageWidth(el.clientWidth));
    observer.observe(el);
    setStageWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Foco e seleção total quando a textarea aparece.
  useEffect(() => {
    const area = areaRef.current;
    if (!ready || area === null) return;
    area.focus();
    area.select();
  }, [ready]);

  // Clique fora da caixa fecha o editor.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const wrap = wrapRef.current;
      if (wrap === null || (event.target instanceof Node && wrap.contains(event.target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  // Se a camada sumir (playhead saiu do clipe ou o clipe foi removido), fecha.
  useEffect(() => {
    if (layer === undefined) onClose();
  }, [layer, onClose]);

  if (!ready || project === null || layer === undefined || layer.text === undefined) {
    return <div ref={wrapRef} className={styles.wrap} />;
  }

  /** Teclas do editor não chegam aos atalhos globais; Esc e Ctrl/Cmd+Enter fecham. */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <textarea
        ref={areaRef}
        className={styles.area}
        style={editorStyle(layer, project, displayScale)}
        aria-label={t.text.content}
        value={layer.text.data.content}
        spellCheck={false}
        wrap="off"
        onChange={(event) => updateText(clipId, { content: event.target.value })}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
