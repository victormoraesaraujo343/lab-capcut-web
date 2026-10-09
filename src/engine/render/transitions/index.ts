// Ponto de entrada das transições: registerTransitions cadastra as 15 no registro de efeitos (idempotente).
import { getEffect, registerEffect, type EffectDefinition } from '../registry';
import { blurTransition } from './blur';
import { dissolveTransition } from './dissolve';
import { fadeBlackTransition } from './fadeBlack';
import { flashWhiteTransition } from './flashWhite';
import { glitchTransition } from './glitch';
import { pixelizeTransition } from './pixelize';
import { slideDownTransition } from './slideDown';
import { slideLeftTransition } from './slideLeft';
import { slideRightTransition } from './slideRight';
import { slideUpTransition } from './slideUp';
import { spinTransition } from './spin';
import { wipeTransition } from './wipe';
import { wipeCircleTransition } from './wipeCircle';
import { zoomInTransition } from './zoomIn';
import { zoomOutTransition } from './zoomOut';

/** Duração padrão de uma transição nova, em ms. */
export const DEFAULT_TRANSITION_MS = 500;

/** Definições de todas as transições, na ordem em que aparecem na UI. */
const TRANSITION_DEFINITIONS: readonly EffectDefinition[] = [
  dissolveTransition,
  fadeBlackTransition,
  slideLeftTransition,
  slideRightTransition,
  slideUpTransition,
  slideDownTransition,
  zoomInTransition,
  zoomOutTransition,
  blurTransition,
  wipeTransition,
  wipeCircleTransition,
  glitchTransition,
  spinTransition,
  flashWhiteTransition,
  pixelizeTransition,
];

/** Tipos das transições disponíveis, na ordem de exibição. */
export const TRANSITION_TYPES: readonly string[] = TRANSITION_DEFINITIONS.map((def) => def.type);

/** Cadastra as transições no registro de efeitos; chamar de novo não faz nada. */
export function registerTransitions(): void {
  for (const def of TRANSITION_DEFINITIONS) {
    const existing = getEffect(def.type);
    // Idempotente para a MESMA definição; um nome repetido de outro item (ex.: efeito com o mesmo tipo) é erro.
    if (existing === undefined) registerEffect(def);
    else if (existing !== def) throw new Error(`effect-type-collision:${def.type}`);
  }
}
