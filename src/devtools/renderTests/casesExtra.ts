// Casos extras da bateria de render: keyframes, freeze frame, reverso, máscara de recorte e divisão de curva de velocidade.
import { splitClipAt } from '@/engine/timeline/clipOps';
import type { Clip } from '@/types';
import {
  GRADIENT,
  GREEN,
  HERO_CURVE,
  SOURCES,
  VIDEO_TRACK,
  buildProject,
  curveMediaTime,
  makeTrack,
  syntheticAsset,
  videoClip,
  type RenderCase,
} from './cases';
import { createSyntheticProvider, personMatte, SOURCE_HEIGHT, SOURCE_WIDTH } from './sources';

/** Transformação animada: x de -80 a +80 e opacidade de 1 a 0,4 em 1000 ms; em 500 ms, x = 0 e opacidade = 0,7. */
function kfTransform(): RenderCase {
  return {
    id: 'kf-transform',
    build: () => {
      const clip = videoClip(GRADIENT, 2000, 0, {
        keyframes: {
          x: [
            { timeMs: 0, value: -80, easing: 'linear' },
            { timeMs: 1000, value: 80, easing: 'linear' },
          ],
          opacity: [
            { timeMs: 0, value: 1, easing: 'linear' },
            { timeMs: 1000, value: 0.4, easing: 'linear' },
          ],
        },
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 500,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 500,
      };
    },
  };
}

/** Parâmetro de efeito animado: pixelate com size de 2 a 40 em 1000 ms; em 750 ms o size vale 30,5. */
function kfEffectParam(): RenderCase {
  return {
    id: 'kf-effect-param',
    build: () => {
      const effectId = 'fx-pixelate';
      const clip = videoClip(GRADIENT, 2000, 0, {
        effects: [{ id: effectId, type: 'pixelate', params: { size: 2 } }],
        keyframes: {
          [`fx:${effectId}:size`]: [
            { timeMs: 0, value: 2, easing: 'linear' },
            { timeMs: 1000, value: 40, easing: 'linear' },
          ],
        },
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 750,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 750,
      };
    },
  };
}

/** Freeze frame: o clipe mostra sempre o quadro de 300 ms da mídia, não importa o instante. */
function freezeFrame(): RenderCase {
  return {
    id: 'freeze',
    build: () => {
      const clip = videoClip(GRADIENT, 2000, 0, { freezeFrameMs: 300 });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 1500,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 300,
      };
    },
  };
}

/** Clipe invertido de 2000 ms: em 500 ms da timeline a mídia está em 1500 ms (clipMediaTime usa durationMs - localMs). */
function reverseFlag(): RenderCase {
  return {
    id: 'reverse-flag',
    build: () => {
      const clip = videoClip(GRADIENT, 2000, 0, { reversed: true });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 500,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 1500,
      };
    },
  };
}

/** Recorte por máscara: o verde da tela some (alfa 0, quadro preto) onde a máscara é preta; a pessoa continua. */
function removeBackgroundMatte(): RenderCase {
  return {
    id: 'remove-background-matte',
    build: () => {
      const matteAsset = syntheticAsset('matte', 10000);
      const clip = videoClip(GREEN, 2000, 0, {
        effects: [
          {
            id: 'fx-remove-bg',
            type: 'removeBackground',
            params: { threshold: 0.5, feather: 0.05, matteAssetId: 'matte', matteOffsetMs: 0 },
          },
        ],
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GREEN, matteAsset]),
        timeMs: 500,
        provider: createSyntheticProvider({
          ...SOURCES,
          matte: () => personMatte(SOURCE_WIDTH, SOURCE_HEIGHT),
        }),
        expectedMediaTimeMs: 500,
      };
    },
  };
}

/** Curva "hero" dividida em 1000 ms: a metade direita, em 1500 ms da timeline, deve pedir a integral da curva original até 1500 ms. */
function speedCurveSplit(): RenderCase {
  return {
    id: 'speed-curve-split',
    build: () => {
      const durationMs = 2000;
      const clip: Clip = videoClip(GRADIENT, durationMs, 0, {
        speed: { mode: 'curve', value: 1, curve: HERO_CURVE, preservePitch: true },
      });
      const split = splitClipAt([makeTrack(VIDEO_TRACK, 'video', [clip])], clip.id, 1000);
      if (split.rightId === null) throw new Error('speed-split-failed');
      return {
        project: buildProject(split.tracks, [GRADIENT]),
        timeMs: 1500,
        provider: createSyntheticProvider(SOURCES),
        // Integral da curva original de 0 a 1500 ms: a metade direita herda a curva fatiada e deve somar o mesmo.
        expectedMediaTimeMs: curveMediaTime(HERO_CURVE, durationMs, 1500, 0),
      };
    },
  };
}

/** Casos extras (keyframes, freeze, reverso, máscara e curva dividida), na ordem de exibição. */
export function extraCases(): RenderCase[] {
  return [kfTransform(), kfEffectParam(), freezeFrame(), reverseFlag(), removeBackgroundMatte(), speedCurveSplit()];
}
