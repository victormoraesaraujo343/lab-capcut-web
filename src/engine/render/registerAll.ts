// Registro único de todos os efeitos, filtros e transições (chamado pelo compositor na criação).
import { registerEffects } from './effects';
import { registerFilters } from './filters';
import { registerTransitions } from './transitions';

/** Estado do registro: true depois que os três registradores rodaram com sucesso. */
let registered = false;

/** Registra efeitos, filtros e transições uma única vez; chamadas seguintes não fazem nada. */
export function ensureEffectsRegistered(): void {
  if (registered) return;
  registerEffects();
  registerFilters();
  registerTransitions();
  registered = true;
}
