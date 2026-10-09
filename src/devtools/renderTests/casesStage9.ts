// Casos da etapa 9 na bateria de render: as quatro formas sobre o gradiente e uma sobreposição de cada tipo registrado.
import { createShapeClip } from '@/engine/timeline/clipFactory';
import { registerOverlays } from '@/engine/render/overlays';
import { defaultParams, listEffects } from '@/engine/render/registry';
import type { Clip, OverlayData, ShapeData } from '@/types';
import { GRADIENT, SOURCES, VIDEO_TRACK, buildProject, makeTrack, videoClip, type RenderCase } from './cases';
import { createSyntheticProvider } from './sources';

/** Trilha das formas e sobreposições, acima do vídeo. */
const STICKER_TRACK = 'track-sticker';

/** Formas testadas, com tamanhos que cabem no quadro de teste. */
const SHAPES: Record<ShapeData['shape'], ShapeData> = {
  rectangle: { shape: 'rectangle', fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 6, width: 240, height: 140, cornerRadius: 24 },
  circle: { shape: 'circle', fill: '#f43f5e', stroke: '#000000', strokeWidth: 4, width: 160, height: 160, cornerRadius: 0 },
  arrow: { shape: 'arrow', fill: '#facc15', stroke: '#facc15', strokeWidth: 18, width: 260, height: 0, cornerRadius: 0 },
  line: { shape: 'line', fill: 'transparent', stroke: '#ffffff', strokeWidth: 12, width: 260, height: 0, cornerRadius: 0 },
};

/** Clipe de sobreposição: o clipe de forma sem a forma, com os dados da sobreposição. */
function overlayClip(overlay: OverlayData): Clip {
  const base = createShapeClip(STICKER_TRACK, 0, SHAPES.rectangle, 2000);
  return { ...base, shape: undefined, id: `overlay-${overlay.type}`, overlay };
}

/** Uma forma de cada tipo, rotacionada 15°, sobre o gradiente. */
function shapeCases(): RenderCase[] {
  return (Object.keys(SHAPES) as ShapeData['shape'][]).map((kind) => ({
    id: `shape-${kind}`,
    build: () => {
      const clip = createShapeClip(STICKER_TRACK, 0, SHAPES[kind], 2000);
      const shaped = { ...clip, id: `shape-${kind}`, transform: { ...clip.transform, rotation: 15 } };
      return {
        project: buildProject(
          [makeTrack(STICKER_TRACK, 'sticker', [shaped]), makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000)])],
          [GRADIENT],
        ),
        timeMs: 500,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  }));
}

/** Uma sobreposição de cada tipo registrado, com os parâmetros padrão, em 1,2 s sobre o gradiente. */
function overlayCases(): RenderCase[] {
  registerOverlays();
  return listEffects('overlay').map((def) => ({
    id: `overlay-${def.type}`,
    build: () => {
      const blend: OverlayData['blend'] = def.type === 'lightLeak' ? 'screen' : def.type === 'filmGrain' ? 'add' : 'normal';
      const clip = overlayClip({ type: def.type, params: defaultParams(def.type), blend });
      return {
        project: buildProject(
          [makeTrack(STICKER_TRACK, 'effect', [clip]), makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000)])],
          [GRADIENT],
        ),
        timeMs: 1200,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  }));
}

/** Casos da etapa 9: formas e sobreposições. */
export function stage9Cases(): RenderCase[] {
  return [...shapeCases(), ...overlayCases()];
}
