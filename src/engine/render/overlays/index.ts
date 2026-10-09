// Registro das sobreposições animadas (shaders procedurais, categoria 'overlay'): cada tipo é um arquivo deste diretório.
import { getEffect, registerEffect, type EffectDefinition } from '../registry';
import { bokehOverlay } from './bokeh';
import { dustOverlay } from './dust';
import { filmGrainOverlay } from './filmGrain';
import { lightLeakOverlay } from './lightLeak';
import { rainOverlay } from './rain';
import { snowOverlay } from './snow';

/** Todas as sobreposições embutidas. Para adicionar uma: criar o arquivo e incluí-lo aqui. */
const ALL_OVERLAYS: readonly EffectDefinition[] = [
  lightLeakOverlay,
  dustOverlay,
  rainOverlay,
  snowOverlay,
  filmGrainOverlay,
  bokehOverlay,
];

/** Tipos de todas as sobreposições embutidas, na ordem de registro. */
export const OVERLAY_TYPES: readonly string[] = ALL_OVERLAYS.map((def) => def.type);

/** Registra as sobreposições embutidas; chamar de novo é seguro, mas um tipo repetido de outro item é erro. */
export function registerOverlays(): void {
  for (const def of ALL_OVERLAYS) {
    const existing = getEffect(def.type);
    if (existing === undefined) registerEffect(def);
    else if (existing !== def) throw new Error(`effect-type-collision:${def.type}`);
  }
}
