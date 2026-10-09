// Casos combinados da bateria de render: filtro com efeito, efeitos com transformação, transições com filtro, efeito e máscara, e texto animado.
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { createTextClip } from '@/engine/timeline/clipFactory';
import { registerEffects } from '@/engine/render/effects';
import { presetToFilter, registerFilters } from '@/engine/render/filters';
import { defaultParams } from '@/engine/render/registry';
import { registerTransitions } from '@/engine/render/transitions';
import { defaultTransform, type Asset, type Clip } from '@/types';
import {
  GRADIENT,
  GREEN,
  SOURCES,
  TEXT_TRACK,
  VIDEO_TRACK,
  buildProject,
  makeTrack,
  syntheticAsset,
  videoClip,
  type RenderCase,
} from './cases';
import { createSyntheticProvider, frameAt, personMatte, SOURCE_HEIGHT, SOURCE_WIDTH } from './sources';

/** Efeito de pixelate com o tamanho dado, na forma da lista de efeitos de um clipe. */
function pixelateEffects(size: number): Clip['effects'] {
  return [{ id: 'fx-pixelate', type: 'pixelate', params: { ...defaultParams('pixelate'), size } }];
}

/** Filtro P&B seguido de desfoque: o filtro roda antes do efeito, então o desfoque age sobre a imagem já em cinza. */
function comboFiltroEfeito(): RenderCase {
  return {
    id: 'combo-filter-bw-blur',
    build: () => ({
      project: buildProject(
        [
          makeTrack(VIDEO_TRACK, 'video', [
            videoClip(GRADIENT, 2000, 0, {
              filters: [presetToFilter('bw')],
              effects: [{ id: 'fx-blur', type: 'blur', params: { ...defaultParams('blur'), radius: 6 } }],
            }),
          ]),
        ],
        [GRADIENT],
      ),
      timeMs: 500,
      provider: createSyntheticProvider(SOURCES),
      expectedMediaTimeMs: 500,
    }),
  };
}

/** Desfoque e separação RGB (efeitos com margem) junto com rotação de 20°, escala 0,6 e recorte à esquerda de 0,2. */
function comboEfeitosTransformacao(): RenderCase {
  const transform = {
    ...defaultTransform(),
    rotation: 20,
    scaleX: 0.6,
    scaleY: 0.6,
    crop: { top: 0, right: 0, bottom: 0, left: 0.2 },
  };
  return {
    id: 'combo-blur-rgbsplit-transform',
    build: () => ({
      project: buildProject(
        [
          makeTrack(VIDEO_TRACK, 'video', [
            videoClip(GRADIENT, 2000, 0, {
              transform,
              effects: [
                { id: 'fx-blur', type: 'blur', params: { ...defaultParams('blur'), radius: 8 } },
                { id: 'fx-rgb', type: 'rgbSplit', params: { ...defaultParams('rgbSplit'), amount: 0.01 } },
              ],
            }),
          ]),
        ],
        [GRADIENT],
      ),
      timeMs: 500,
      provider: createSyntheticProvider(SOURCES),
      expectedMediaTimeMs: 500,
    }),
  };
}

/** Dissolve entre dois clipes de vídeo: o que sai tem filtro sépia e o que entra tem efeito pixelate. */
function comboDissolve(): RenderCase {
  return {
    id: 'combo-dissolve-sepia-pixelate',
    build: () => {
      const outgoing = videoClip(GRADIENT, 2000, 0, {
        filters: [presetToFilter('sepia')],
        transitionOut: { type: 'dissolve', durationMs: 1000, params: {} },
      });
      const incoming = videoClip(GREEN, 2000, 2000, { effects: pixelateEffects(12) });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [outgoing, incoming])], [GRADIENT, GREEN]),
        timeMs: 2000,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  };
}

/** Wipe em 90° em que o clipe que entra tem remover fundo com máscara (mesma montagem do caso remove-background-matte). */
function comboWipeMatte(): RenderCase {
  const matte = syntheticAsset('matte', 10000);
  return {
    id: 'combo-wipe-removebg-matte',
    build: () => {
      const outgoing = videoClip(GRADIENT, 2000, 0, {
        transitionOut: { type: 'wipe', durationMs: 1000, params: { angle: 90 } },
      });
      const incoming = videoClip(GREEN, 2000, 2000, {
        effects: [
          {
            id: 'fx-remove-bg',
            type: 'removeBackground',
            params: { threshold: 0.5, feather: 0.05, matteAssetId: 'matte', matteOffsetMs: 0 },
          },
        ],
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [outgoing, incoming])], [GRADIENT, GREEN, matte]),
        timeMs: 2000,
        provider: createSyntheticProvider({
          ...SOURCES,
          matte: () => personMatte(SOURCE_WIDTH, SOURCE_HEIGHT),
        }),
      };
    },
  };
}

/** Efeito pixelate sobre um clipe de imagem (asset kind 'image'), que não tem tempo de mídia próprio. */
function comboPixelateImagem(): RenderCase {
  const still: Asset = { ...syntheticAsset('still', 3000), kind: 'image' };
  return {
    id: 'combo-pixelate-image',
    build: () => ({
      project: buildProject([makeTrack(VIDEO_TRACK, 'video', [videoClip(still, 2000, 0, { effects: pixelateEffects(12) })])], [still]),
      timeMs: 500,
      provider: createSyntheticProvider({ still: (t) => frameAt('gradient', t) }),
    }),
  };
}

/** Texto com animação de entrada 'pop' (400 ms) no meio da animação: em 100 ms o progresso é 0,25. */
function comboTextoPop(): RenderCase {
  return {
    id: 'combo-text-pop-middle',
    build: () => {
      const style = { ...defaultTextStyle(), fontFamily: 'Inter', fontSize: 40, color: '#ffea00' };
      const text = createTextClip(TEXT_TRACK, 0, 'Pop!', style, 2000);
      const popText: Clip = {
        ...text,
        text: { content: 'Pop!', style, animationIn: { type: 'pop', durationMs: 400 } },
      };
      return {
        project: buildProject(
          [makeTrack(TEXT_TRACK, 'text', [popText]), makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000)])],
          [GRADIENT],
        ),
        timeMs: 100,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  };
}

/** Casos combinados, na ordem de exibição. */
export function comboCases(): RenderCase[] {
  registerEffects();
  registerFilters();
  registerTransitions();
  return [
    comboFiltroEfeito(),
    comboEfeitosTransformacao(),
    comboDissolve(),
    comboWipeMatte(),
    comboPixelateImagem(),
    comboTextoPop(),
  ];
}
