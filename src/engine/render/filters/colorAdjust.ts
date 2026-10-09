// Filtro de ajuste de cor (manual + HSL por faixa): definição registrada como efeito de categoria 'filter'.
import type { EffectDefinition, EffectParamSpec } from '../registry';
import { COLOR_ADJUST_FRAGMENT } from './colorAdjustGlsl';
import { HUE_BANDS, hslParamKey } from './colorMath';

/** Tipo do efeito de ajuste de cor no registro. */
export const COLOR_ADJUST_TYPE = 'colorAdjust';

/** Cria a especificação de um parâmetro numérico. */
function num(key: string, min: number, max: number, step: number, def = 0): EffectParamSpec {
  return { key, type: 'number', default: def, min, max, step };
}

/** Parâmetros base do ajuste de cor (todos neutros por padrão). */
const BASE_SPECS: EffectParamSpec[] = [
  num('brightness', -1, 1, 0.01),
  num('contrast', -1, 1, 0.01),
  num('saturation', -1, 1, 0.01),
  num('temperature', -1, 1, 0.01),
  num('tint', -1, 1, 0.01),
  num('hue', -180, 180, 1),
  num('exposure', -2, 2, 0.01),
  num('highlights', -1, 1, 0.01),
  num('shadows', -1, 1, 0.01),
  num('sharpen', 0, 2, 0.01),
  num('vignette', 0, 1, 0.01),
  num('vignetteSoftness', 0, 1, 0.01, 0.5),
  num('grain', 0, 1, 0.01),
  num('fade', 0, 1, 0.01),
];

/** Parâmetros HSL: matiz (graus), saturação e luminosidade de cada uma das 8 faixas. */
const HSL_SPECS: EffectParamSpec[] = HUE_BANDS.flatMap((band) => [
  num(hslParamKey(band.id, 'H'), -30, 30, 1),
  num(hslParamKey(band.id, 'S'), -1, 1, 0.01),
  num(hslParamKey(band.id, 'L'), -1, 1, 0.01),
]);

/** Todos os parâmetros editáveis do ajuste de cor (base + HSL), com limites e padrões. */
export const COLOR_ADJUST_PARAMS: readonly EffectParamSpec[] = [...BASE_SPECS, ...HSL_SPECS];

/** Definição do efeito de ajuste de cor para o registro de efeitos. */
export const colorAdjustDefinition: EffectDefinition = {
  type: COLOR_ADJUST_TYPE,
  category: 'filter',
  labelKey: 'filters.adjust',
  params: [...COLOR_ADJUST_PARAMS],
  fragmentSource: COLOR_ADJUST_FRAGMENT,
};
