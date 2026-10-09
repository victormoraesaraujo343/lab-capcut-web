// 25 filtros prontos estilo CapCut: cada um é só um conjunto de valores do filtro colorAdjust.
import type { EffectInstance, ParamValue } from '../../../types/effects';
import { COLOR_ADJUST_PARAMS, COLOR_ADJUST_TYPE } from './colorAdjust';
import { applyColorAdjust, type Rgb } from './colorMath';

/** Filtro pronto: valores de parâmetros do colorAdjust e intensidade padrão (0..1). */
export interface FilterPreset {
  /** Identificador estável do filtro. */
  id: string;
  /** Chave de tradução do nome exibido (filters.names.<id>). */
  labelKey: string;
  /** Valores dos parâmetros que o filtro muda; o resto fica neutro. */
  params: Partial<Record<string, number>>;
  /** Intensidade usada por padrão ao aplicar o filtro. */
  intensityDefault: number;
}

/** Cria um filtro pronto com a chave de nome derivada do id. */
function preset(id: string, params: Partial<Record<string, number>>, intensityDefault = 1): FilterPreset {
  return { id, labelKey: `filters.names.${id}`, params, intensityDefault };
}

/** Os 25 filtros prontos, na ordem exibida na interface. */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  preset('sharp', { sharpen: 1.2, contrast: 0.12, saturation: 0.05 }),
  preset('vivid', { saturation: 0.45, contrast: 0.2, brightness: 0.04, hslGreenS: 0.2, hslBlueS: 0.15 }),
  preset('warm', { temperature: 0.4, tint: 0.05, highlights: 0.1 }),
  preset('cool', { temperature: -0.4, tint: -0.05, exposure: 0.05 }),
  preset('retro', { temperature: 0.2, fade: 0.25, saturation: -0.2, vignette: 0.3, grain: 0.2 }),
  preset('film', { contrast: 0.1, fade: 0.15, grain: 0.35, temperature: 0.1, shadows: 0.1, saturation: -0.1 }),
  preset('bw', { saturation: -1, contrast: 0.2 }),
  preset('sepia', { saturation: -0.8, temperature: 0.55, contrast: 0.05 }),
  preset('sunset', { temperature: 0.5, hslOrangeS: 0.3, hslYellowL: 0.1, highlights: 0.15, vignette: 0.15 }),
  preset('summer', { temperature: 0.25, exposure: 0.2, saturation: 0.25, brightness: 0.05, hslAquaS: 0.2 }),
  preset('autumn', { temperature: 0.35, hslGreenH: -20, hslOrangeS: 0.2, saturation: 0.1, hslGreenS: -0.1 }),
  preset('winter', { temperature: -0.35, hslBlueS: 0.1, hslAquaH: -5, saturation: -0.2, contrast: 0.1, exposure: 0.1 }),
  preset('neon', { saturation: 0.7, contrast: 0.35, hslMagentaS: 0.4, hslBlueS: 0.3, shadows: -0.1, hue: 10 }),
  preset('pastel', { saturation: -0.35, brightness: 0.12, highlights: 0.1, fade: 0.2, contrast: -0.15 }),
  preset('matte', { fade: 0.35, contrast: -0.15, shadows: 0.15, saturation: -0.1 }),
  preset('faded', { fade: 0.5, saturation: -0.35, contrast: -0.1, temperature: 0.1 }),
  preset('noir', { saturation: -1, contrast: 0.45, exposure: -0.15, vignette: 0.4, vignetteSoftness: 0.6, grain: 0.25 }),
  preset('teal-orange', {
    temperature: 0.15,
    contrast: 0.2,
    hslAquaH: 10,
    hslAquaS: 0.3,
    hslBlueH: -20,
    hslOrangeH: 5,
    hslOrangeS: 0.25,
    shadows: -0.05,
  }),
  preset('food', { saturation: 0.3, temperature: 0.2, hslOrangeL: 0.1, hslRedS: 0.2, hslYellowS: 0.15, exposure: 0.1, highlights: 0.05 }),
  preset('soft-portrait', { contrast: -0.1, highlights: -0.15, shadows: 0.2, fade: 0.1, saturation: -0.05, temperature: 0.1, hslRedS: -0.2 }),
  preset('vintage-70s', { temperature: 0.45, saturation: -0.25, fade: 0.3, hslOrangeH: 8, hslYellowS: -0.1, vignette: 0.35, vignetteSoftness: 0.7, grain: 0.2, tint: 0.1 }),
  preset('polaroid', { temperature: 0.2, fade: 0.25, saturation: -0.1, contrast: -0.1, brightness: 0.06, vignette: 0.25, vignetteSoftness: 0.8, tint: 0.08 }),
  preset('lomo', { contrast: 0.45, saturation: 0.4, vignette: 0.7, vignetteSoftness: 0.3, exposure: -0.1, shadows: -0.15, hue: -5 }),
  preset('dramatic', { contrast: 0.5, highlights: -0.2, shadows: -0.25, saturation: -0.2, vignette: 0.45, sharpen: 0.6 }),
  preset('natural', { saturation: 0.08, contrast: 0.05, sharpen: 0.3, exposure: 0.03 }),
];

/** Busca um filtro pronto pelo id; lança erro se não existir. */
function findPreset(id: string): FilterPreset {
  const found = FILTER_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`filter-preset-unknown:${id}`);
  return found;
}

/** Valores completos dos parâmetros: neutro + (valor do filtro - neutro) × intensidade, dentro dos limites. */
function buildParams(values: Partial<Record<string, number>>, intensity: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const spec of COLOR_ADJUST_PARAMS) {
    const neutral = typeof spec.default === 'number' ? spec.default : 0;
    const target = values[spec.key];
    const raw = target === undefined ? neutral : neutral + (target - neutral) * intensity;
    result[spec.key] = Math.min(Math.max(raw, spec.min ?? -Infinity), spec.max ?? Infinity);
  }
  return result;
}

/** Cria a instância de filtro (colorAdjust, id novo) para aplicar um filtro pronto na intensidade dada (0..1). */
export function presetToFilter(id: string, intensity = 1): EffectInstance {
  const params: Record<string, ParamValue> = buildParams(findPreset(id).params, intensity);
  return { id: crypto.randomUUID(), type: COLOR_ADJUST_TYPE, params };
}

/** Cor de exemplo de uma amostra RGB (0..1) depois do filtro pronto na intensidade padrão, para miniaturas. */
export function presetThumbnailColor(id: string, rgb: Rgb): Rgb {
  const preset = findPreset(id);
  return applyColorAdjust(rgb, buildParams(preset.params, preset.intensityDefault));
}
