import { getEffect, registerEffect, type EffectDefinition } from '../registry';
import { blurEffect } from './blur';
import { chromaKeyEffect } from './chromaKey';
import { fisheyeEffect } from './fisheye';
import { glitchEffect } from './glitch';
import { kaleidoscopeEffect } from './kaleidoscope';
import { maskCircleEffect } from './maskCircle';
import { maskLinearEffect } from './maskLinear';
import { maskRectEffect } from './maskRect';
import { mirrorEffect } from './mirror';
import { pixelateEffect } from './pixelate';
import { pulseZoomEffect } from './pulseZoom';
import { removeBackgroundEffect } from './removeBackground';
import { rgbSplitEffect } from './rgbSplit';
import { shakeEffect } from './shake';
import { vhsEffect } from './vhs';

/** Todos os efeitos embutidos. Para adicionar um efeito: criar o arquivo e incluí-lo aqui. */
const ALL_EFFECTS: readonly EffectDefinition[] = [
  blurEffect,
  pixelateEffect,
  mirrorEffect,
  shakeEffect,
  glitchEffect,
  vhsEffect,
  pulseZoomEffect,
  chromaKeyEffect,
  maskRectEffect,
  maskCircleEffect,
  maskLinearEffect,
  rgbSplitEffect,
  fisheyeEffect,
  kaleidoscopeEffect,
  removeBackgroundEffect,
];

/** Tipos de todos os efeitos embutidos, na ordem de registro. */
export const EFFECT_TYPES: readonly string[] = ALL_EFFECTS.map((def) => def.type);

/** Registra os efeitos embutidos; efeitos já registrados são ignorados, então chamar de novo é seguro. */
export function registerEffects(): void {
  for (const def of ALL_EFFECTS) {
    const existing = getEffect(def.type);
    // Idempotente para a MESMA definição; um nome repetido de outro item (ex.: transição com o mesmo tipo) é erro.
    if (existing === undefined) registerEffect(def);
    else if (existing !== def) throw new Error(`effect-type-collision:${def.type}`);
  }
}
