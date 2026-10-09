import { describe, expect, it } from 'vitest';
import {
  curveAverageSpeed,
  curveSpeedAt,
  mediaOffsetAt,
  SPEED_CURVE_PRESETS,
  SPEED_MAX,
  SPEED_MIN,
  timelineDurationFor,
} from '../src/engine/timeline/speedCurve';
import type { Speed } from '../src/types/project';

/** Velocidade constante de teste. */
function constant(value: number): Speed {
  return { mode: 'constant', value, curve: [], preservePitch: true };
}

/** Velocidade por curva de teste. */
function curved(points: { t: number; speed: number }[]): Speed {
  return { mode: 'curve', value: 1, curve: points, preservePitch: false };
}

describe('limites de velocidade', () => {
  it('vai de 0,1x a 100x', () => {
    expect(SPEED_MIN).toBe(0.1);
    expect(SPEED_MAX).toBe(100);
  });
});

describe('velocidade constante', () => {
  it('2x avança o dobro da mídia e dura metade na timeline', () => {
    expect(mediaOffsetAt(constant(2), 1000, 5000)).toBe(2000);
    expect(timelineDurationFor(constant(2), 4000)).toBe(2000);
  });
});

describe('curveSpeedAt', () => {
  it('interpola linearmente entre pontos', () => {
    const curve = [
      { t: 0, speed: 1 },
      { t: 1, speed: 3 },
    ];
    expect(curveSpeedAt(curve, 0.5)).toBeCloseTo(2, 9);
    expect(curveSpeedAt(curve, 0.25)).toBeCloseTo(1.5, 9);
  });

  it('repete o extremo fora dos pontos e usa 1x sem pontos', () => {
    const curve = [
      { t: 0.2, speed: 4 },
      { t: 0.8, speed: 2 },
    ];
    expect(curveSpeedAt(curve, 0)).toBe(4);
    expect(curveSpeedAt(curve, 1)).toBe(2);
    expect(curveSpeedAt([], 0.5)).toBe(1);
  });

  it('aceita pontos fora de ordem', () => {
    const curve = [
      { t: 1, speed: 3 },
      { t: 0, speed: 1 },
    ];
    expect(curveSpeedAt(curve, 0.5)).toBeCloseTo(2, 9);
  });
});

describe('curveAverageSpeed', () => {
  it('curva constante tem a própria velocidade como média', () => {
    expect(curveAverageSpeed([{ t: 0, speed: 2 }, { t: 1, speed: 2 }])).toBeCloseTo(2, 9);
  });

  it('a integral de uma rampa de 1x a 3x é 2', () => {
    expect(curveAverageSpeed([{ t: 0, speed: 1 }, { t: 1, speed: 3 }])).toBeCloseTo(2, 9);
  });
});

describe('curva de velocidade', () => {
  it('curva constante dá o mesmo resultado que a velocidade constante', () => {
    const flat = curved([{ t: 0, speed: 2 }, { t: 1, speed: 2 }]);
    expect(mediaOffsetAt(flat, 1000, 5000)).toBeCloseTo(mediaOffsetAt(constant(2), 1000, 5000), 6);
    expect(timelineDurationFor(flat, 4000)).toBeCloseTo(timelineDurationFor(constant(2), 4000), 6);
  });

  it('o avanço da mídia até o meio de uma rampa 1x a 3x é a integral parcial', () => {
    const ramp = curved([{ t: 0, speed: 1 }, { t: 1, speed: 3 }]);
    // Integral de (1 + 2u) de 0 a 0,5 = 0,75; vezes a duração do clipe de 1000 ms.
    expect(mediaOffsetAt(ramp, 500, 1000)).toBeCloseTo(750, 6);
    // Até o fim: média 2, então 2000 ms de mídia.
    expect(mediaOffsetAt(ramp, 1000, 1000)).toBeCloseTo(2000, 6);
  });

  it('a duração na timeline segue a média da curva', () => {
    const ramp = curved([{ t: 0, speed: 1 }, { t: 1, speed: 3 }]);
    expect(timelineDurationFor(ramp, 4000)).toBeCloseTo(2000, 6);
  });
});

describe('SPEED_CURVE_PRESETS', () => {
  it('tem os seis presets esperados, com curvas de t=0 a t=1 e velocidades válidas', () => {
    expect(SPEED_CURVE_PRESETS.map((p) => p.id).sort()).toEqual(
      ['bullet', 'flashIn', 'flashOut', 'hero', 'jumpCut', 'montage'].sort(),
    );
    for (const preset of SPEED_CURVE_PRESETS) {
      const first = preset.curve[0];
      const last = preset.curve[preset.curve.length - 1];
      expect(first?.t).toBe(0);
      expect(last?.t).toBe(1);
      for (const point of preset.curve) {
        expect(point.speed).toBeGreaterThanOrEqual(SPEED_MIN);
        expect(point.speed).toBeLessThanOrEqual(SPEED_MAX);
      }
    }
  });

  it('flash in começa rápido e flash out termina rápido', () => {
    const flashIn = SPEED_CURVE_PRESETS.find((p) => p.id === 'flashIn')?.curve ?? [];
    const flashOut = SPEED_CURVE_PRESETS.find((p) => p.id === 'flashOut')?.curve ?? [];
    expect(curveSpeedAt(flashIn, 0)).toBeGreaterThan(curveSpeedAt(flashIn, 1));
    expect(curveSpeedAt(flashOut, 1)).toBeGreaterThan(curveSpeedAt(flashOut, 0));
  });
});
