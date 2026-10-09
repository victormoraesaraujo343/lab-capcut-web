/**
 * Limita um número ao intervalo [min, max].
 * Se min for maior que max, o resultado segue a ordem do Math.min/Math.max
 * (ou seja, o valor cai em max), então quem chama deve passar um intervalo válido.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
