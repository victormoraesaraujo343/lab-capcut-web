// Casos de cobertura da bateria de render: máscaras, chroma key, filtros prontos, ajustes manuais, velocidade e keyframes.
import { registerEffects } from '@/engine/render/effects';
import { defaultParams } from '@/engine/render/registry';
import { presetToFilter, registerFilters } from '@/engine/render/filters';
import { COLOR_ADJUST_TYPE } from '@/engine/render/filters/colorAdjust';
import { mediaOffsetAt, SPEED_CURVE_PRESETS, type SpeedPresetId } from '@/engine/timeline/speedCurve';
import type { Asset, Clip, Easing, Speed } from '@/types';
import {
  GRADIENT,
  GREEN,
  SOURCES,
  VIDEO_TRACK,
  buildProject,
  makeTrack,
  syntheticAsset,
  videoClip,
  type RenderCase,
  type RenderCaseBuild,
} from './cases';
import { createSyntheticProvider, frameAt, SOURCE_HEIGHT, SOURCE_WIDTH, type SyntheticSource } from './sources';

/** Especificação de um caso com um único clipe de vídeo sobre um asset sintético. */
interface SingleSpec {
  /** Id estável do caso (também nome do PNG de referência). */
  id: string;
  /** Asset do clipe. */
  asset: Asset;
  /** Ajustes do clipe: efeitos, filtros, velocidade, keyframes. */
  clip: Partial<Clip>;
  /** Instante da linha do tempo a desenhar, em ms. */
  timeMs: number;
  /** Tempo de mídia esperado no primeiro pedido de quadro, quando o caso exige. */
  expectedMediaTimeMs?: number;
  /** Duração do clipe, em ms (padrão 2000). */
  durationMs?: number;
  /** Assets do projeto (padrão: só o do clipe). */
  assets?: Asset[];
  /** Fontes sintéticas do provider (padrão: SOURCES). */
  sources?: Record<string, SyntheticSource>;
}

/** Caso de um único clipe de vídeo, com o provider e o projeto montados a partir da especificação. */
function singleCase(spec: SingleSpec): RenderCase {
  return {
    id: spec.id,
    build: (): RenderCaseBuild => {
      const clip = videoClip(spec.asset, spec.durationMs ?? 2000, 0, spec.clip);
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], spec.assets ?? [spec.asset]),
        timeMs: spec.timeMs,
        provider: createSyntheticProvider(spec.sources ?? SOURCES),
        ...(spec.expectedMediaTimeMs === undefined ? {} : { expectedMediaTimeMs: spec.expectedMediaTimeMs }),
      };
    },
  };
}

/** Asset longo do gradiente (200 s), para velocidades altas sem o tempo de mídia ser cortado no fim do arquivo. */
const LONG_GRADIENT = syntheticAsset('gradient-long', 200000);
/** Fontes do caso de 100x: o asset longo desenha o mesmo cartão de gradiente. */
const LONG_SOURCES: Record<string, SyntheticSource> = { 'gradient-long': (t) => frameAt('gradient', t) };

/** Asset do cartão azul (fundo de chroma key azul). */
const BLUE_CARD = syntheticAsset('blue-card', 10000);

/** Cartão azul puro (#0000ff) com um retângulo amarelo e um círculo branco, para o chroma key de cor azul. */
function blueCard(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SOURCE_WIDTH, SOURCE_HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('synthetic-canvas-2d-unavailable');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(SOURCE_WIDTH * 0.2, SOURCE_HEIGHT * 0.25, SOURCE_WIDTH * 0.25, SOURCE_HEIGHT * 0.5);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(SOURCE_WIDTH * 0.7, SOURCE_HEIGHT * 0.5, SOURCE_HEIGHT * 0.2, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** Máscara (rect, circle ou linear) com pena 0,1, invertida ou não, sobre o gradiente. */
function maskCase(id: string, type: string, invert: boolean): RenderCase {
  return singleCase({
    id,
    asset: GRADIENT,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: { effects: [{ id: `fx-${id}`, type, params: { ...defaultParams(type), feather: 0.1, invert } }] },
  });
}

/** Chroma key sobre a tela verde, com o spill dado (0 ou 1). */
function chromaSpillCase(spill: number): RenderCase {
  return singleCase({
    id: `chroma-spill-${spill}`,
    asset: GREEN,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: {
      effects: [{ id: `fx-chroma-spill-${spill}`, type: 'chromaKey', params: { ...defaultParams('chromaKey'), keyColor: '#00ff00', spill } }],
    },
  });
}

/** Chroma key de cor azul (#0000ff) sobre um cartão de fundo azul. */
function chromaAzulCase(): RenderCase {
  return singleCase({
    id: 'chroma-azul-fundo-azul',
    asset: BLUE_CARD,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: {
      effects: [{ id: 'fx-chroma-azul', type: 'chromaKey', params: { ...defaultParams('chromaKey'), keyColor: '#0000ff' } }],
    },
    sources: { 'blue-card': () => blueCard() },
    assets: [BLUE_CARD],
  });
}

/** Filtro pronto na intensidade 0,5 sobre o gradiente. */
function filtroMeioCase(presetId: string): RenderCase {
  return singleCase({
    id: `filter-${presetId}-intensity-05`,
    asset: GRADIENT,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: { filters: [presetToFilter(presetId, 0.5)] },
  });
}

/** Ajuste manual isolado do colorAdjust: só os valores dados saem do neutro. */
function ajusteCase(id: string, values: Record<string, number>): RenderCase {
  return singleCase({
    id,
    asset: GRADIENT,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: { filters: [{ id: `fx-${id}`, type: COLOR_ADJUST_TYPE, params: { ...defaultParams(COLOR_ADJUST_TYPE), ...values } }] },
  });
}

/** Velocidade constante: o tempo de mídia no instante 1000 ms é 1000 ms vezes a velocidade. */
function velocidadeConstanteCase(id: string, value: number, asset: Asset, sources?: Record<string, SyntheticSource>): RenderCase {
  const speed: Speed = { mode: 'constant', value, curve: [], preservePitch: true };
  return singleCase({
    id,
    asset,
    timeMs: 1000,
    expectedMediaTimeMs: 1000 * value,
    clip: { speed },
    ...(sources === undefined ? {} : { sources }),
  });
}

/** Preset de curva de velocidade num instante do meio (1000 ms de um clipe de 2000 ms). */
function curvaCase(id: string, presetId: SpeedPresetId): RenderCase {
  const preset = SPEED_CURVE_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`speed-preset-missing:${presetId}`);
  const speed: Speed = { mode: 'curve', value: 1, curve: preset.curve, preservePitch: true };
  return singleCase({
    id,
    asset: GRADIENT,
    timeMs: 1000,
    expectedMediaTimeMs: mediaOffsetAt(speed, 1000, 2000),
    clip: { speed },
  });
}

/** Opacidade animada de 1 a 0,2 em 2000 ms, com o easing dado; em 500 ms (25% da janela) o progresso é 0,25. */
function keyframeOpacidadeCase(id: string, easing: Easing): RenderCase {
  return singleCase({
    id,
    asset: GRADIENT,
    timeMs: 500,
    expectedMediaTimeMs: 500,
    clip: {
      keyframes: {
        opacity: [
          { timeMs: 0, value: 1, easing },
          { timeMs: 2000, value: 0.2, easing: 'linear' },
        ],
      },
    },
  });
}

/** Ajustes manuais isolados, um caso por parâmetro (id e valores). */
const AJUSTES: Array<[string, Record<string, number>]> = [
  ['adjust-brightness-04', { brightness: 0.4 }],
  ['adjust-contrast-05', { contrast: 0.5 }],
  ['adjust-saturation-menos1', { saturation: -1 }],
  ['adjust-temperature-06', { temperature: 0.6 }],
  ['adjust-sharpen-15', { sharpen: 1.5 }],
  ['adjust-vignette-08', { vignette: 0.8 }],
  ['adjust-grain-06', { grain: 0.6 }],
  ['adjust-fade-05', { fade: 0.5 }],
  ['adjust-hue-90', { hue: 90 }],
  ['adjust-hsl-red-h-30', { hslRedH: 30 }],
  ['adjust-hsl-blue-s-menos1', { hslBlueS: -1 }],
  ['adjust-hsl-green-l-05', { hslGreenL: 0.5 }],
];

/** Casos de cobertura: máscaras, chroma key, filtros, ajustes, velocidade e keyframes, na ordem de exibição. */
export function coverageCases(): RenderCase[] {
  registerEffects();
  registerFilters();
  return [
    maskCase('mask-rect-feather', 'maskRect', false),
    maskCase('mask-rect-invert-feather', 'maskRect', true),
    maskCase('mask-circle-feather', 'maskCircle', false),
    maskCase('mask-circle-invert-feather', 'maskCircle', true),
    maskCase('mask-linear-feather', 'maskLinear', false),
    maskCase('mask-linear-invert-feather', 'maskLinear', true),
    chromaSpillCase(0),
    chromaSpillCase(1),
    chromaAzulCase(),
    filtroMeioCase('warm'),
    filtroMeioCase('vintage-70s'),
    ...AJUSTES.map(([id, values]) => ajusteCase(id, values)),
    velocidadeConstanteCase('speed-constante-01x', 0.1, GRADIENT),
    velocidadeConstanteCase('speed-constante-100x', 100, LONG_GRADIENT, LONG_SOURCES),
    curvaCase('speed-curve-montage', 'montage'),
    curvaCase('speed-curve-bullet', 'bullet'),
    curvaCase('speed-curve-jumpcut', 'jumpCut'),
    curvaCase('speed-curve-flashin', 'flashIn'),
    curvaCase('speed-curve-flashout', 'flashOut'),
    keyframeOpacidadeCase('kf-opacity-hold', 'hold'),
    keyframeOpacidadeCase('kf-opacity-easein', 'easeIn'),
    keyframeOpacidadeCase('kf-opacity-easeout', 'easeOut'),
  ];
}
