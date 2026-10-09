// Transições entre clipes encostados: troca as camadas que saem e entram por uma única camada de transição.
import type { Asset, Layer, Project } from '@/types';
import { layerForClipAt, VISUAL_TRACK_KINDS } from './composition';
import { activeTransition, incomingLocalMs, outgoingLocalMs } from './transitionWindow';

/**
 * Aplica as transições ativas no instante. Para cada trilha visual com transição, a camada que sai (com a transição
 * e a camada que entra dentro de `transition.incoming`) substitui as duas na lista. Devolve as camadas ordenadas por zIndex.
 */
export function applyTransitions(project: Project, timelineMs: number, layers: Layer[]): Layer[] {
  const assets = new Map<string, Asset>(project.assets.map((a): [string, Asset] => [a.id, a]));
  const trackCount = project.tracks.length;
  let result = layers;
  project.tracks.forEach((track, index) => {
    if (track.hidden || !VISUAL_TRACK_KINDS.has(track.kind)) return;
    const active = activeTransition(track, timelineMs);
    if (active === null) return;
    const zIndex = trackCount - 1 - index;
    const outgoingLayer = layerForClipAt(
      project,
      assets,
      active.outgoing,
      outgoingLocalMs(active.outgoing, timelineMs),
      zIndex,
    );
    const incomingLayer = layerForClipAt(
      project,
      assets,
      active.incoming,
      incomingLocalMs(active.incoming, timelineMs),
      zIndex,
    );
    if (outgoingLayer === null || incomingLayer === null) return;
    const replaced = new Set([active.outgoing.id, active.incoming.id]);
    result = result.filter((layer) => !replaced.has(layer.clipId));
    result.push({
      ...outgoingLayer,
      transition: {
        type: active.transition.type,
        params: { ...active.transition.params },
        progress: active.progress,
        incoming: incomingLayer,
      },
    });
  });
  return [...result].sort((a, b) => a.zIndex - b.zIndex);
}
