// Testes da matemática pura do editor de curva de velocidade: conversões de eixo, inserir, remover, mover e teclado.
import { describe, expect, it } from 'vitest';
import {
  CHART_HEIGHT,
  CHART_MAX_SPEED,
  CHART_MIN_SPEED,
  CHART_PAD,
  insertPoint,
  movePoint,
  nudgeSpeed,
  nudgeT,
  removePoint,
  sameCurve,
  speedToY,
  tToX,
  xToT,
  yToSpeed,
} from '@/features/inspector/speedCurveMath';
import type { SpeedCurvePoint } from '@/types';

/** Curva de teste com três pontos fora de ordem. */
const CURVE: SpeedCurvePoint[] = [
  { t: 0.5, speed: 2 },
  { t: 0, speed: 1 },
  { t: 1, speed: 4 },
];

describe('eixos do gráfico', () => {
  it('1x fica no meio do gráfico no eixo logarítmico 0,1x a 10x', () => {
    expect(speedToY(1)).toBeCloseTo(CHART_HEIGHT / 2, 6);
  });

  it('10x fica no topo e 0,1x na base, dentro da margem', () => {
    expect(speedToY(CHART_MAX_SPEED)).toBeCloseTo(CHART_PAD, 6);
    expect(speedToY(CHART_MIN_SPEED)).toBeCloseTo(CHART_HEIGHT - CHART_PAD, 6);
  });

  it('yToSpeed é a inversa de speedToY', () => {
    for (const speed of [0.1, 0.5, 1, 2.5, 10]) {
      expect(yToSpeed(speedToY(speed))).toBeCloseTo(speed, 6);
    }
  });

  it('velocidade fora do gráfico é limitada a 0,1x..10x', () => {
    expect(speedToY(100)).toBeCloseTo(speedToY(CHART_MAX_SPEED), 6);
    expect(speedToY(0.001)).toBeCloseTo(speedToY(CHART_MIN_SPEED), 6);
  });

  it('t vai de 0 a 1 na largura e xToT é a inversa de tToX', () => {
    expect(tToX(0)).toBe(CHART_PAD);
    expect(xToT(tToX(0.25))).toBeCloseTo(0.25, 6);
    expect(xToT(-50)).toBe(0);
    expect(xToT(10000)).toBe(1);
  });
});

describe('inserir e remover pontos', () => {
  it('inserir ordena os pontos e devolve a posição do novo', () => {
    const { curve, index } = insertPoint(CURVE, 0.25, 3);
    expect(curve.map((p) => p.t)).toEqual([0, 0.25, 0.5, 1]);
    expect(index).toBe(1);
    expect(curve[index]).toEqual({ t: 0.25, speed: 3 });
  });

  it('inserir limita t e a velocidade e não muta a entrada', () => {
    const before = structuredClone(CURVE);
    const { curve } = insertPoint(CURVE, 2, 50);
    expect(curve[curve.length - 1]).toEqual({ t: 1, speed: CHART_MAX_SPEED });
    expect(CURVE).toEqual(before);
  });

  it('remover tira o ponto da posição dada', () => {
    expect(removePoint(CURVE, 1)).toEqual([{ t: 0.5, speed: 2 }, { t: 1, speed: 4 }]);
  });

  it('remover não deixa a curva com menos de dois pontos', () => {
    const two = [{ t: 0, speed: 1 }, { t: 1, speed: 1 }];
    expect(removePoint(two, 0)).toEqual(two);
  });

  it('remover com posição inválida não muda nada', () => {
    expect(removePoint(CURVE, 9)).toEqual(CURVE);
  });
});

describe('mover pontos', () => {
  it('mover limita t entre 0 e 1 e reordena, seguindo o ponto movido', () => {
    const { curve, index } = movePoint(CURVE, 0, 0.9, 1);
    expect(curve.map((p) => p.t)).toEqual([0, 0.9, 1]);
    expect(index).toBe(1);
  });

  it('mover para antes de todos volta a posição 0', () => {
    const spread = [
      { t: 0.2, speed: 1 },
      { t: 0.6, speed: 2 },
      { t: 1, speed: 3 },
    ];
    const { index, curve } = movePoint(spread, 2, -3, 1);
    expect(index).toBe(0);
    expect(curve[0]).toEqual({ t: 0, speed: 1 });
  });
});

describe('teclado', () => {
  it('passo de velocidade acelera e desacelera 5% e fica dentro do gráfico', () => {
    expect(nudgeSpeed(1, 1)).toBeCloseTo(1.05, 6);
    expect(nudgeSpeed(1, -1)).toBeCloseTo(1 / 1.05, 6);
    expect(nudgeSpeed(CHART_MAX_SPEED, 1)).toBe(CHART_MAX_SPEED);
  });

  it('passo de t fica entre 0 e 1', () => {
    expect(nudgeT(0.995, 0.01)).toBe(1);
    expect(nudgeT(0.005, -0.01)).toBe(0);
  });
});

describe('comparação de curvas', () => {
  it('curvas iguais em valores e ordem são iguais', () => {
    expect(sameCurve(CURVE, structuredClone(CURVE))).toBe(true);
    expect(sameCurve(CURVE, removePoint(CURVE, 0))).toBe(false);
  });
});
