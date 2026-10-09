// Testes puros das animações de texto: registro de 15 itens, janelas de entrada, saída e loop, e estado neutro.
import { describe, expect, it } from 'vitest';
import {
  TEXT_ANIMATIONS,
  evaluateTextAnimation,
  neutralTextAnimState,
  type TextAnimState,
} from '@/engine/text/textAnimations';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import type { TextAnimation, TextData } from '@/types';

/** Altura de quadro usada nos testes, em px do projeto. */
const FRAME_H = 1000;

/** Duração do clipe de teste, em ms. */
const CLIP_MS = 5000;

/** Cria um texto de teste com as animações dadas. */
function makeText(overrides: Partial<TextData> = {}): TextData {
  return { content: 'oi', style: defaultTextStyle(), ...overrides };
}

/** Animação de teste com a duração dada. */
function anim(type: string, durationMs: number): TextAnimation {
  return { type, durationMs };
}

/** Confere se o estado é o neutro. */
function isNeutral(state: TextAnimState): boolean {
  return JSON.stringify(state) === JSON.stringify(neutralTextAnimState());
}

describe('registro de animações', () => {
  it('tem 15 animações com ids únicos', () => {
    expect(TEXT_ANIMATIONS).toHaveLength(15);
    const types = new Set(TEXT_ANIMATIONS.map((d) => d.type));
    expect(types.size).toBe(15);
  });

  it('separa 10 de entrada, 3 de saída e 2 de loop, todas com duração positiva', () => {
    const count = (kind: string): number => TEXT_ANIMATIONS.filter((d) => d.kind === kind).length;
    expect(count('in')).toBe(10);
    expect(count('out')).toBe(3);
    expect(count('loop')).toBe(2);
    for (const def of TEXT_ANIMATIONS) expect(def.defaultDurationMs).toBeGreaterThan(0);
  });
});

describe('entrada', () => {
  const inDefs = TEXT_ANIMATIONS.filter((d) => d.kind === 'in');

  it.each(inDefs.map((d) => [d.type, d.defaultDurationMs] as const))(
    '%s: no início não é neutra, no quarto da janela não é neutra e no fim é neutra',
    (type, dur) => {
      const text = makeText({ animationIn: anim(type, dur) });
      expect(isNeutral(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H))).toBe(false);
      expect(isNeutral(evaluateTextAnimation(text, dur / 4, CLIP_MS, FRAME_H))).toBe(false);
      expect(isNeutral(evaluateTextAnimation(text, dur, CLIP_MS, FRAME_H))).toBe(true);
    },
  );

  it('fadeIn sobe a opacidade com curva easeOut cúbica', () => {
    const text = makeText({ animationIn: anim('fadeIn', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).opacity).toBe(0);
    expect(evaluateTextAnimation(text, 500, CLIP_MS, FRAME_H).opacity).toBeCloseTo(0.875);
  });

  it('typewriter revela linearmente sem mexer na opacidade', () => {
    const text = makeText({ animationIn: anim('typewriter', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).reveal).toBe(0);
    const mid = evaluateTextAnimation(text, 500, CLIP_MS, FRAME_H);
    expect(mid.reveal).toBeCloseTo(0.5);
    expect(mid.opacity).toBe(1);
    expect(evaluateTextAnimation(text, 1000, CLIP_MS, FRAME_H).reveal).toBe(1);
  });

  it('pop vai de escala 0 a 1.15 e volta a 1', () => {
    const text = makeText({ animationIn: anim('pop', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).scale).toBe(0);
    expect(evaluateTextAnimation(text, 600, CLIP_MS, FRAME_H).scale).toBeCloseTo(1.15);
    expect(evaluateTextAnimation(text, 1000, CLIP_MS, FRAME_H).scale).toBe(1);
  });

  it('slides partem de 15% da altura do quadro em cada direção', () => {
    const d = 0.15 * FRAME_H;
    const up = makeText({ animationIn: anim('slideUp', 1000) });
    const down = makeText({ animationIn: anim('slideDown', 1000) });
    const left = makeText({ animationIn: anim('slideLeft', 1000) });
    const right = makeText({ animationIn: anim('slideRight', 1000) });
    expect(evaluateTextAnimation(up, 0, CLIP_MS, FRAME_H).dy).toBeCloseTo(d);
    expect(evaluateTextAnimation(down, 0, CLIP_MS, FRAME_H).dy).toBeCloseTo(-d);
    expect(evaluateTextAnimation(left, 0, CLIP_MS, FRAME_H).dx).toBeCloseTo(d);
    expect(evaluateTextAnimation(right, 0, CLIP_MS, FRAME_H).dx).toBeCloseTo(-d);
  });

  it('zoomIn cresce de 0 a 1', () => {
    const text = makeText({ animationIn: anim('zoomIn', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).scale).toBe(0);
    expect(evaluateTextAnimation(text, 500, CLIP_MS, FRAME_H).scale).toBeCloseTo(0.875);
  });

  it('bounceIn cai de cima, pousa no meio da janela e quica duas vezes', () => {
    const text = makeText({ animationIn: anim('bounceIn', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).dy).toBeCloseTo(-150);
    expect(evaluateTextAnimation(text, 500, CLIP_MS, FRAME_H).dy).toBeCloseTo(0);
    expect(evaluateTextAnimation(text, 625, CLIP_MS, FRAME_H).dy).toBeCloseTo(-45);
    expect(evaluateTextAnimation(text, 825, CLIP_MS, FRAME_H).dy).toBeCloseTo(-15);
    expect(evaluateTextAnimation(text, 950, CLIP_MS, FRAME_H).dy).toBeCloseTo(0);
  });

  it('spinIn gira de -180 a 0 graus com escala de 0 a 1', () => {
    const text = makeText({ animationIn: anim('spinIn', 1000) });
    const start = evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H);
    expect(start.rotation).toBeCloseTo(-180);
    expect(start.scale).toBe(0);
    const mid = evaluateTextAnimation(text, 500, CLIP_MS, FRAME_H);
    expect(mid.rotation).toBeCloseTo(-22.5);
    expect(mid.scale).toBeCloseTo(0.875);
  });
});

describe('saída', () => {
  const outDefs = TEXT_ANIMATIONS.filter((d) => d.kind === 'out');

  it.each(outDefs.map((d) => [d.type, d.defaultDurationMs] as const))(
    '%s: antes da janela é neutra, no meio e perto do fim não são neutras',
    (type, dur) => {
      const text = makeText({ animationOut: anim(type, dur) });
      expect(isNeutral(evaluateTextAnimation(text, CLIP_MS - dur - 1, CLIP_MS, FRAME_H))).toBe(true);
      expect(isNeutral(evaluateTextAnimation(text, CLIP_MS - dur / 2, CLIP_MS, FRAME_H))).toBe(false);
      expect(isNeutral(evaluateTextAnimation(text, CLIP_MS - 1, CLIP_MS, FRAME_H))).toBe(false);
    },
  );

  it('fadeOut apaga nos últimos durationMs com curva easeIn', () => {
    const text = makeText({ animationOut: anim('fadeOut', 1000) });
    expect(evaluateTextAnimation(text, 4000, CLIP_MS, FRAME_H).opacity).toBe(1);
    expect(evaluateTextAnimation(text, 4500, CLIP_MS, FRAME_H).opacity).toBeCloseTo(0.875);
    expect(evaluateTextAnimation(text, CLIP_MS - 1, CLIP_MS, FRAME_H).opacity).toBeLessThan(0.01);
  });

  it('zoomOut encolhe até quase zero e slideOutDown desce 15% da altura', () => {
    const zoom = makeText({ animationOut: anim('zoomOut', 1000) });
    const slide = makeText({ animationOut: anim('slideOutDown', 1000) });
    expect(evaluateTextAnimation(zoom, 4500, CLIP_MS, FRAME_H).scale).toBeCloseTo(0.875);
    expect(evaluateTextAnimation(slide, 4000, CLIP_MS, FRAME_H).dy).toBe(0);
    expect(evaluateTextAnimation(slide, 4500, CLIP_MS, FRAME_H).dy).toBeCloseTo(18.75);
  });
});

describe('loop', () => {
  it('pulse oscila a escala entre 0.94 e 1.06 com período durationMs', () => {
    const text = makeText({ animationLoop: anim('pulse', 1000) });
    expect(evaluateTextAnimation(text, 0, CLIP_MS, FRAME_H).scale).toBeCloseTo(1);
    expect(evaluateTextAnimation(text, 250, CLIP_MS, FRAME_H).scale).toBeCloseTo(1.06);
    expect(evaluateTextAnimation(text, 750, CLIP_MS, FRAME_H).scale).toBeCloseTo(0.94);
    expect(evaluateTextAnimation(text, 1000, CLIP_MS, FRAME_H).scale).toBeCloseTo(1);
  });

  it('wiggle oscila a rotação entre -4 e 4 graus', () => {
    const text = makeText({ animationLoop: anim('wiggle', 800) });
    expect(evaluateTextAnimation(text, 200, CLIP_MS, FRAME_H).rotation).toBeCloseTo(4);
    expect(evaluateTextAnimation(text, 600, CLIP_MS, FRAME_H).rotation).toBeCloseTo(-4);
  });
});

describe('estado fora das janelas', () => {
  it('é neutro antes do clipe e no instante final do clipe', () => {
    const text = makeText({
      animationIn: anim('fadeIn', 1000),
      animationOut: anim('fadeOut', 1000),
      animationLoop: anim('pulse', 1000),
    });
    expect(isNeutral(evaluateTextAnimation(text, -1, CLIP_MS, FRAME_H))).toBe(true);
    expect(isNeutral(evaluateTextAnimation(text, CLIP_MS, CLIP_MS, FRAME_H))).toBe(true);
  });

  it('texto sem animação é sempre neutro dentro do clipe', () => {
    expect(isNeutral(evaluateTextAnimation(makeText(), 2000, CLIP_MS, FRAME_H))).toBe(true);
  });

  it('entrada e saída se combinam multiplicando a opacidade quando as janelas são curtas', () => {
    const text = makeText({
      animationIn: anim('fadeIn', 400),
      animationOut: anim('fadeOut', 400),
    });
    const state = evaluateTextAnimation(text, 800, 1000, FRAME_H);
    expect(state.opacity).toBeCloseTo(0.875);
  });
});
