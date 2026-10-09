// Ponto de entrada dos filtros: registra o ajuste de cor no registro de efeitos e reexporta os 25 filtros prontos.
import { getEffect, registerEffect } from '../registry';
import { COLOR_ADJUST_TYPE, colorAdjustDefinition } from './colorAdjust';

export { COLOR_ADJUST_TYPE } from './colorAdjust';
export { FILTER_PRESETS, presetThumbnailColor, presetToFilter } from './filterPresets';
export type { FilterPreset } from './filterPresets';

/** Registra os filtros no registro de efeitos; chamar mais de uma vez não faz nada. */
export function registerFilters(): void {
  if (getEffect(COLOR_ADJUST_TYPE)) return;
  registerEffect(colorAdjustDefinition);
}
