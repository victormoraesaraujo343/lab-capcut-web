// Animações de texto: registro de 15 animações (entrada, saída e loop) e avaliação pura do estado no instante.

import type { TextAnimation, TextData } from '@/types';

/** Definição de uma animação de texto disponível. */
export interface TextAnimDef {
  /** Identificador da animação (em inglês; o rótulo vem da i18n). */
  type: string;
  /** Slot em que a animação funciona: entrada, saída ou loop. */
  kind: 'in' | 'out' | 'loop';
  /** Duração padrão em ms. */
  defaultDurationMs: number;
}

/** Estado visual de um texto num instante, calculado pelas animações. */
export interface TextAnimState {
  /** Multiplicador de opacidade, de 0 a 1. */
  opacity: number;
  /** Deslocamento horizontal em px do projeto. */
  dx: number;
  /** Deslocamento vertical em px do projeto. */
  dy: number;
  /** Multiplicador de escala (1 = tamanho normal). */
  scale: number;
  /** Rotação adicional em graus. */
  rotation: number;
  /** Fração do texto já revelada, de 0 a 1 (digitação). */
  reveal: number;
}

/** Registro das 15 animações de texto disponíveis. */
export const TEXT_ANIMATIONS: TextAnimDef[] = [
  { type: 'fadeIn', kind: 'in', defaultDurationMs: 400 },
  { type: 'typewriter', kind: 'in', defaultDurationMs: 1200 },
  { type: 'pop', kind: 'in', defaultDurationMs: 400 },
  { type: 'slideUp', kind: 'in', defaultDurationMs: 400 },
  { type: 'slideDown', kind: 'in', defaultDurationMs: 400 },
  { type: 'slideLeft', kind: 'in', defaultDurationMs: 400 },
  { type: 'slideRight', kind: 'in', defaultDurationMs: 400 },
  { type: 'zoomIn', kind: 'in', defaultDurationMs: 400 },
  { type: 'bounceIn', kind: 'in', defaultDurationMs: 700 },
  { type: 'spinIn', kind: 'in', defaultDurationMs: 600 },
  { type: 'fadeOut', kind: 'out', defaultDurationMs: 300 },
  { type: 'zoomOut', kind: 'out', defaultDurationMs: 300 },
  { type: 'slideOutDown', kind: 'out', defaultDurationMs: 400 },
  { type: 'pulse', kind: 'loop', defaultDurationMs: 1000 },
  { type: 'wiggle', kind: 'loop', defaultDurationMs: 800 },
];

/** Distância de deslocamento dos slides e do bounce: 15% da altura do quadro, em px do projeto. */
const SLIDE_RATIO = 0.15;

/** Contribuição parcial de uma animação ao estado (campos ausentes não alteram nada). */
type Contribution = Partial<TextAnimState>;

/** Efeito de entrada: recebe o progresso linear (0 a 1, 1 = neutro) e a altura do quadro. */
type InEffect = (p: number, frameH: number) => Contribution;

/** Efeito de saída: recebe o progresso linear (0 a 1, 1 = fim da saída) e a altura do quadro. */
type OutEffect = (p: number, frameH: number) => Contribution;

/** Efeito de loop: recebe a fase do ciclo (0 a 1). */
type LoopEffect = (phase: number) => Contribution;

/** Estado neutro: texto normal, sem animação. */
const NEUTRAL_STATE: TextAnimState = {
  opacity: 1,
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  reveal: 1,
};

/** Estado neutro novo a cada chamada (não compartilha objeto). */
export function neutralTextAnimState(): TextAnimState {
  return { ...NEUTRAL_STATE };
}

/** Limita um número ao intervalo de 0 a 1. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Curva de desaceleração cúbica: rápida no início, suave no fim. */
function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}

/** Curva de aceleração cúbica: suave no início, rápida no fim. */
function easeInCubic(p: number): number {
  return p * p * p;
}

/** Distância de slide e bounce em px do projeto. */
function slideDistance(frameH: number): number {
  return SLIDE_RATIO * frameH;
}

/** Escala do pop: 0 até 1.15 em 60% do tempo, depois volta a 1. */
function popScale(p: number): number {
  if (p < 0.6) return (p / 0.6) * 1.15;
  return 1.15 - ((p - 0.6) / 0.4) * 0.15;
}

/** Arco de parábola em [0, 1] que vale 0 nas pontas e 1 no meio. */
function arc(u: number): number {
  return 4 * u * (1 - u);
}

/** Fração da distância de queda do bounce: 1 no topo, 0 quando pousa; dois quiques após o primeiro pouso. */
function bounceOffset(p: number): number {
  if (p < 0.5) {
    const u = p / 0.5;
    return 1 - u * u;
  }
  if (p < 0.75) return 0.3 * arc((p - 0.5) / 0.25);
  if (p < 0.9) return 0.1 * arc((p - 0.75) / 0.15);
  return 0;
}

/** Efeitos de entrada por tipo. */
const IN_EFFECTS: ReadonlyMap<string, InEffect> = new Map<string, InEffect>([
  ['fadeIn', (p) => ({ opacity: easeOutCubic(p) })],
  ['typewriter', (p) => ({ reveal: p })],
  ['pop', (p) => ({ scale: popScale(p) })],
  ['slideUp', (p, h) => ({ dy: (1 - easeOutCubic(p)) * slideDistance(h) })],
  ['slideDown', (p, h) => ({ dy: -(1 - easeOutCubic(p)) * slideDistance(h) })],
  ['slideLeft', (p, h) => ({ dx: (1 - easeOutCubic(p)) * slideDistance(h) })],
  ['slideRight', (p, h) => ({ dx: -(1 - easeOutCubic(p)) * slideDistance(h) })],
  ['zoomIn', (p) => ({ scale: easeOutCubic(p) })],
  ['bounceIn', (p, h) => ({ dy: -slideDistance(h) * bounceOffset(p) })],
  ['spinIn', (p) => {
    const e = easeOutCubic(p);
    return { rotation: -180 * (1 - e), scale: e };
  }],
]);

/** Efeitos de saída por tipo. */
const OUT_EFFECTS: ReadonlyMap<string, OutEffect> = new Map<string, OutEffect>([
  ['fadeOut', (p) => ({ opacity: 1 - easeInCubic(p) })],
  ['zoomOut', (p) => ({ scale: 1 - easeInCubic(p) })],
  ['slideOutDown', (p, h) => ({ dy: easeInCubic(p) * slideDistance(h) })],
]);

/** Efeitos de loop por tipo. */
const LOOP_EFFECTS: ReadonlyMap<string, LoopEffect> = new Map<string, LoopEffect>([
  ['pulse', (phase) => ({ scale: 1 + 0.06 * Math.sin(2 * Math.PI * phase) })],
  ['wiggle', (phase) => ({ rotation: 4 * Math.sin(2 * Math.PI * phase) })],
]);

/** Contribuição da animação de entrada: ativa nos primeiros durationMs e neutra depois. */
function inContribution(anim: TextAnimation | undefined, localMs: number, frameH: number): Contribution {
  const effect = anim ? IN_EFFECTS.get(anim.type) : undefined;
  if (!anim || !effect || anim.durationMs <= 0 || localMs >= anim.durationMs) return {};
  return effect(clamp01(localMs / anim.durationMs), frameH);
}

/** Contribuição da animação de saída: ativa nos últimos durationMs do clipe. */
function outContribution(
  anim: TextAnimation | undefined,
  localMs: number,
  clipDurationMs: number,
  frameH: number,
): Contribution {
  const effect = anim ? OUT_EFFECTS.get(anim.type) : undefined;
  if (!anim || !effect || anim.durationMs <= 0) return {};
  const start = clipDurationMs - anim.durationMs;
  if (localMs < start) return {};
  return effect(clamp01((localMs - start) / anim.durationMs), frameH);
}

/** Contribuição da animação em loop: contínua por todo o clipe, com período durationMs. */
function loopContribution(anim: TextAnimation | undefined, localMs: number): Contribution {
  const effect = anim ? LOOP_EFFECTS.get(anim.type) : undefined;
  if (!anim || !effect || anim.durationMs <= 0) return {};
  return effect((localMs % anim.durationMs) / anim.durationMs);
}

/** Aplica uma contribuição ao estado: opacidade e escala multiplicam, deslocamentos somam, reveal usa o menor. */
function applyContribution(state: TextAnimState, part: Contribution): TextAnimState {
  return {
    opacity: state.opacity * (part.opacity ?? 1),
    dx: state.dx + (part.dx ?? 0),
    dy: state.dy + (part.dy ?? 0),
    scale: state.scale * (part.scale ?? 1),
    rotation: state.rotation + (part.rotation ?? 0),
    reveal: Math.min(state.reveal, part.reveal ?? 1),
  };
}

/**
 * Estado visual do texto no instante local do clipe, combinando entrada, saída e loop.
 * Fora do clipe o estado é neutro; localMs e clipDurationMs em ms, frameH em px do projeto.
 */
export function evaluateTextAnimation(
  text: TextData,
  localMs: number,
  clipDurationMs: number,
  frameH: number,
): TextAnimState {
  if (!(localMs >= 0 && localMs < clipDurationMs)) return neutralTextAnimState();
  let state = neutralTextAnimState();
  state = applyContribution(state, inContribution(text.animationIn, localMs, frameH));
  state = applyContribution(state, outContribution(text.animationOut, localMs, clipDurationMs, frameH));
  state = applyContribution(state, loopContribution(text.animationLoop, localMs));
  return state;
}
