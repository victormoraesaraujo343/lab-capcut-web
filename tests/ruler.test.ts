import { describe, expect, it } from 'vitest';
import {
  chooseTickStep,
  computeTicks,
  formatRulerLabel,
} from '../src/engine/timeline/ruler';

describe('chooseTickStep', () => {
  it('escolhe 10 s de traço maior e 2 s de traço menor em 10 px/s', () => {
    expect(chooseTickStep(10)).toEqual({ majorMs: 10000, minorMs: 2000 });
  });

  it('escolhe 1 s de traço maior e 200 ms de traço menor em 100 px/s', () => {
    expect(chooseTickStep(100)).toEqual({ majorMs: 1000, minorMs: 200 });
  });

  it('escolhe 100 ms de traço maior e 20 ms de traço menor em 1000 px/s', () => {
    expect(chooseTickStep(1000)).toEqual({ majorMs: 100, minorMs: 20 });
  });

  it('nunca deixa o traço maior com menos espaço que o mínimo', () => {
    const { majorMs } = chooseTickStep(10);
    expect((majorMs / 1000) * 10).toBeGreaterThanOrEqual(80);
  });
});

describe('formatRulerLabel', () => {
  it('usa décimos quando o traço maior é menor que 1 s', () => {
    expect(formatRulerLabel(1500, 500)).toBe('0:01.5');
    expect(formatRulerLabel(100, 100)).toBe('0:00.1');
  });

  it('usa M:SS para traços maiores ou iguais a 1 s', () => {
    expect(formatRulerLabel(0, 10000)).toBe('0:00');
    expect(formatRulerLabel(90000, 30000)).toBe('1:30');
  });

  it('usa H:MM:SS a partir de 1 hora', () => {
    expect(formatRulerLabel(3600000, 60000)).toBe('1:00:00');
  });
});

describe('computeTicks', () => {
  it('gera traços com rótulo só nos maiores em 10 px/s', () => {
    const ticks = computeTicks(0, 60000, 10);
    expect(ticks).toHaveLength(31);
    const majors = ticks.filter((tick) => tick.major);
    expect(majors.map((tick) => tick.label)).toEqual([
      '0:00',
      '0:10',
      '0:20',
      '0:30',
      '0:40',
      '0:50',
      '1:00',
    ]);
    expect(ticks.filter((tick) => !tick.major).every((tick) => tick.label === null)).toBe(true);
  });

  it('calcula x em px relativo ao tempo 0', () => {
    const ticks = computeTicks(0, 4000, 100);
    const at2s = ticks.find((tick) => tick.ms === 2000);
    expect(at2s?.x).toBe(200);
  });

  it('mantém apenas traços dentro da janela', () => {
    const ticks = computeTicks(1000, 2000, 10);
    expect(ticks.map((tick) => tick.ms)).toEqual([2000]);
    expect(ticks.every((tick) => tick.ms >= 1000 && tick.ms <= 2000)).toBe(true);
  });

  it('não gera traços duplicados em uma janela longa', () => {
    const ticks = computeTicks(0, 600000, 1000);
    const msValues = ticks.map((tick) => tick.ms);
    expect(new Set(msValues).size).toBe(msValues.length);
    expect(msValues).toEqual([...msValues].sort((a, b) => a - b));
  });

  it('usa rótulos em décimos em 1000 px/s', () => {
    const ticks = computeTicks(0, 1000, 1000);
    const labels = ticks.filter((tick) => tick.major).map((tick) => tick.label);
    expect(labels.slice(0, 3)).toEqual(['0:00.0', '0:00.1', '0:00.2']);
    expect(labels.at(-1)).toBe('0:01.0');
  });

  it('retorna lista vazia para janela invertida ou zoom inválido', () => {
    expect(computeTicks(5000, 1000, 10)).toEqual([]);
    expect(computeTicks(0, 1000, 0)).toEqual([]);
    expect(computeTicks(0, 1000, Number.NaN)).toEqual([]);
  });
});
