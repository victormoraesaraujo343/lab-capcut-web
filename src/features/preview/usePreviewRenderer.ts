// Renderizador da prévia: desenha o projeto no canvas WebGL, coalescendo pedidos e sem re-renderizar o React a cada quadro.
import { useEffect, useState, type RefObject } from 'react';
import { createCompositor } from '@/engine/render/compositor';
import { prefetchAround, renderFrame } from '@/engine/render/renderFrame';
import { applyPreviewOverride, usePlaybackStore, usePreviewOverrideStore, useProjectStore } from '@/stores';
import type { Compositor, Project } from '@/types';
import { getPreviewEngine } from './previewEngine';

/** Tempo, em ms, sem mudanças até o render final com qualidade exata. */
const SETTLE_MS = 150;
/** Nome da medição de desempenho de cada render da prévia. */
const MEASURE_NAME = 'preview-render';
/** Marca de início usada pela medição. */
const MARK_START = 'preview-render-start';

/** Escala do render: a qualidade escolhida, limitada ao tamanho exibido do canvas vezes o DPR. */
function fitScale(element: HTMLCanvasElement, project: Project, quality: number): number {
  if (!(project.width > 0 && project.height > 0)) return 0;
  const dpr = window.devicePixelRatio || 1;
  const byWidth = (element.clientWidth * dpr) / project.width;
  const byHeight = (element.clientHeight * dpr) / project.height;
  return Math.min(quality, byWidth, byHeight);
}

/** Desenha a prévia no canvas dado e devolve o estado de erro ('webgl' se o contexto não existir). */
export function usePreviewRenderer(canvasRef: RefObject<HTMLCanvasElement | null>): { error: 'webgl' | null } {
  const [error, setError] = useState<'webgl' | null>(null);

  useEffect(() => {
    const current = canvasRef.current;
    if (current === null) return undefined;
    const element: HTMLCanvasElement = current;

    // Em StrictMode o efeito roda duas vezes; a criação adiada evita pegar um contexto já perdido.
    let cancelled = false;
    let compositor: Compositor | null = null;
    let frameId = 0;
    let settleTimer = 0;
    let rendering = false;
    let dirty = false;
    let settled = true;
    let direction: 1 | -1 = 1;
    let observer: ResizeObserver | null = null;
    const unsubscribes: Array<() => void> = [];

    /** Renderiza o estado mais recente agora; pedidos durante um render viram um novo render ao terminar. */
    async function renderLatest(): Promise<void> {
      if (rendering) {
        dirty = true;
        return;
      }
      rendering = true;
      try {
        do {
          dirty = false;
          await renderOnce();
        } while (dirty && !cancelled);
      } finally {
        rendering = false;
      }
    }

    /** Um render com o estado atual das stores; falhas de quadro mantêm o último desenho. */
    async function renderOnce(): Promise<void> {
      const target = compositor;
      const base = useProjectStore.getState().project;
      // Depois do desmontar não toca no motor: getPreviewEngine() recriaria o singleton já liberado.
      if (cancelled || target === null || base === null) return;
      const playback = usePlaybackStore.getState();
      const override = usePreviewOverrideStore.getState();
      const project = applyPreviewOverride(base, override.clipId, override.transform);
      const scale = fitScale(element, project, playback.quality);
      if (!(scale > 0)) return;
      const dragging = override.transform !== null;
      const exact = settled && !playback.isPlaying && !dragging;
      const provider = getPreviewEngine().provider;
      performance.mark(MARK_START);
      try {
        await renderFrame(target, project, playback.currentTimeMs, provider, { scale, exact });
        prefetchAround(project, playback.currentTimeMs, provider, direction);
      } catch {
        // Quadro com falha: a prévia continua mostrando o último desenho.
      } finally {
        performance.measure(MEASURE_NAME, MARK_START);
        performance.clearMarks(MARK_START);
        performance.clearMeasures(MEASURE_NAME);
      }
    }

    /** Agenda um render para o próximo quadro de animação; pedidos repetidos se fundem em um. */
    function requestRender(): void {
      if (frameId !== 0 || cancelled) return;
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        void renderLatest();
      });
    }

    /** Registra uma mudança: pede render agora em qualidade de prévia e, depois de um tempo parado, o final exato. */
    function markChanged(): void {
      settled = false;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        settled = true;
        requestRender();
      }, SETTLE_MS);
      requestRender();
    }

    queueMicrotask(() => {
      if (cancelled) return;
      try {
        compositor = createCompositor(element);
      } catch {
        setError('webgl');
        return;
      }
      unsubscribes.push(
        usePlaybackStore.subscribe((state, prev) => {
          if (state.currentTimeMs !== prev.currentTimeMs) {
            direction = state.currentTimeMs > prev.currentTimeMs ? 1 : -1;
            markChanged();
          } else if (state.isPlaying !== prev.isPlaying || state.quality !== prev.quality) {
            markChanged();
          }
        }),
      );
      unsubscribes.push(
        useProjectStore.subscribe((state, prev) => {
          if (state.project !== prev.project) markChanged();
        }),
      );
      unsubscribes.push(
        usePreviewOverrideStore.subscribe((state, prev) => {
          if (state.clipId !== prev.clipId || state.transform !== prev.transform) markChanged();
        }),
      );
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => markChanged());
        observer.observe(element);
      }
      markChanged();
    });

    return () => {
      cancelled = true;
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
      window.clearTimeout(settleTimer);
      observer?.disconnect();
      for (const unsubscribe of unsubscribes) unsubscribe();
      compositor?.dispose();
      compositor = null;
    };
  }, [canvasRef]);

  return { error };
}
