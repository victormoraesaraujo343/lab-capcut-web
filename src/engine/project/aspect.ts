// Proporções do projeto: tamanhos fixos por preset e cálculo do tamanho ao trocar a proporção.
import type { AspectRatio } from '@/types';

/** Tamanhos em pixels de cada proporção fixa do projeto. */
export const ASPECT_PRESETS: Record<Exclude<AspectRatio, 'free'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '4:3': { width: 1440, height: 1080 },
};

/** Devolve o tamanho do projeto para a proporção dada; 'free' mantém o tamanho atual. */
export function sizeForAspect(
  aspect: AspectRatio,
  current: { width: number; height: number },
): { width: number; height: number } {
  if (aspect === 'free') return { width: current.width, height: current.height };
  const preset = ASPECT_PRESETS[aspect];
  return { width: preset.width, height: preset.height };
}
