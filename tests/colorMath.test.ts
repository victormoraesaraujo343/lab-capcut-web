import { describe, expect, it } from 'vitest';
import {
  applyColorAdjust,
  hslParamKey,
  hslToRgb,
  hueBandWeight,
  rgbToHsl,
  type Rgb,
} from '../src/engine/render/filters/colorMath';

const SAMPLES: Rgb[] = [
  [0.2, 0.5, 0.8],
  [0.9, 0.1, 0.1],
  [0.05, 0.6, 0.3],
  [0.5, 0.5, 0.5],
  [0, 0, 0],
  [1, 1, 1],
];

describe('applyColorAdjust', () => {
  it('sem parâmetros (ou todos zerados) é identidade', () => {
    for (const rgb of SAMPLES) {
      const out = applyColorAdjust(rgb, {});
      expect(out[0]).toBeCloseTo(rgb[0], 6);
      expect(out[1]).toBeCloseTo(rgb[1], 6);
      expect(out[2]).toBeCloseTo(rgb[2], 6);
    }
    const zeroed = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, hue: 0, exposure: 0, highlights: 0, shadows: 0, fade: 0, hslRedH: 0, hslRedS: 0, hslRedL: 0 };
    const out = applyColorAdjust([0.2, 0.5, 0.8], zeroed);
    expect(out[0]).toBeCloseTo(0.2, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0.8, 6);
  });

  it('brilho positivo clareia o cinza médio', () => {
    const out = applyColorAdjust([0.5, 0.5, 0.5], { brightness: 0.5 });
    expect(out[0]).toBeGreaterThan(0.5);
    expect(out[1]).toBeGreaterThan(0.5);
    expect(out[2]).toBeGreaterThan(0.5);
  });

  it('saturação -1 deixa a cor em cinza com a luminância dela', () => {
    const rgb: Rgb = [0.9, 0.2, 0.1];
    const out = applyColorAdjust(rgb, { saturation: -1 });
    const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    expect(out[0]).toBeCloseTo(luma, 6);
    expect(out[1]).toBeCloseTo(luma, 6);
    expect(out[2]).toBeCloseTo(luma, 6);
  });

  it('temperatura positiva aumenta R e diminui B', () => {
    const warm = applyColorAdjust([0.5, 0.5, 0.5], { temperature: 1 });
    expect(warm[0]).toBeGreaterThan(0.5);
    expect(warm[2]).toBeLessThan(0.5);
    const cool = applyColorAdjust([0.5, 0.5, 0.5], { temperature: -1 });
    expect(cool[0]).toBeLessThan(0.5);
    expect(cool[2]).toBeGreaterThan(0.5);
  });

  it('HSL do vermelho só afeta vermelhos', () => {
    const params = { [hslParamKey('red', 'L')]: -0.5 };
    const red: Rgb = [0.9, 0.1, 0.1];
    const blue: Rgb = [0.1, 0.1, 0.9];
    const green: Rgb = [0.1, 0.9, 0.1];
    const redOut = applyColorAdjust(red, params);
    expect(redOut[0]).toBeLessThan(red[0] - 0.05);
    const blueOut = applyColorAdjust(blue, params);
    const greenOut = applyColorAdjust(green, params);
    expect(blueOut[2]).toBeCloseTo(blue[2], 6);
    expect(blueOut[0]).toBeCloseTo(blue[0], 6);
    expect(greenOut[1]).toBeCloseTo(green[1], 6);
    expect(greenOut[0]).toBeCloseTo(green[0], 6);
  });

  it('cinza não muda com o HSL, mesmo com saturação de faixa', () => {
    const out = applyColorAdjust([0.5, 0.5, 0.5], { hslRedS: 1, hslRedH: 30 });
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0.5, 6);
  });
});

describe('rgbToHsl e hslToRgb', () => {
  it('convertem de ida e volta sem perda relevante', () => {
    for (const rgb of SAMPLES) {
      const [h, s, l] = rgbToHsl(rgb);
      const back = hslToRgb(h, s, l);
      expect(back[0]).toBeCloseTo(rgb[0], 6);
      expect(back[1]).toBeCloseTo(rgb[1], 6);
      expect(back[2]).toBeCloseTo(rgb[2], 6);
    }
  });

  it('vermelho puro tem matiz 0 e saturação 1', () => {
    const [h, s, l] = rgbToHsl([1, 0, 0]);
    expect(h).toBeCloseTo(0, 6);
    expect(s).toBeCloseTo(1, 6);
    expect(l).toBeCloseTo(0.5, 6);
  });
});

describe('hueBandWeight', () => {
  it('vale 1 no centro da faixa e 0 longe dela', () => {
    expect(hueBandWeight(0, 'red')).toBeCloseTo(1, 9);
    expect(hueBandWeight(180, 'red')).toBe(0);
    expect(hueBandWeight(240, 'blue')).toBeCloseTo(1, 9);
  });

  it('considera o círculo de matiz (359 está perto de 0)', () => {
    expect(hueBandWeight(359, 'red')).toBeCloseTo(hueBandWeight(1, 'red'), 9);
    expect(hueBandWeight(359, 'red')).toBeGreaterThan(0.9);
  });
});
