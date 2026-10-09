import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelativeDate, formatTimecode } from '../src/utils/time';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  it('formata zero como 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formata segundos com zero à esquerda', () => {
    expect(formatDuration(5_000)).toBe('0:05');
  });

  it('formata minutos e segundos', () => {
    expect(formatDuration(62_000)).toBe('1:02');
  });

  it('formata horas quando passa de uma hora', () => {
    expect(formatDuration(HOUR + 2 * MIN + 3_000)).toBe('1:02:03');
  });

  it('arredonda os segundos para baixo', () => {
    expect(formatDuration(1_999)).toBe('0:01');
  });

  it('trata valores negativos como zero', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('formatTimecode', () => {
  it('formata a origem como 00:00:00:00', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
  });

  it('calcula os quadros a partir da fração de segundo', () => {
    expect(formatTimecode(1_500, 30)).toBe('00:00:01:15');
  });

  it('formata horas, minutos e segundos com dois dígitos', () => {
    expect(formatTimecode(HOUR + 2 * MIN + 3_000, 24)).toBe('01:02:03:00');
  });

  it('trata negativos como zero', () => {
    expect(formatTimecode(-1_000, 30)).toBe('00:00:00:00');
  });
});

describe('formatRelativeDate', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0).getTime();

  it('mostra "agora" para menos de um minuto', () => {
    expect(formatRelativeDate(now - 30_000, now)).toBe('agora');
  });

  it('mostra "agora" para datas no futuro', () => {
    expect(formatRelativeDate(now + 10_000, now)).toBe('agora');
  });

  it('mostra minutos', () => {
    expect(formatRelativeDate(now - 5 * MIN, now)).toBe('há 5 min');
  });

  it('mostra horas', () => {
    expect(formatRelativeDate(now - 3 * HOUR, now)).toBe('há 3 h');
  });

  it('mostra "ontem" entre 24 e 48 horas', () => {
    expect(formatRelativeDate(now - 30 * HOUR, now)).toBe('ontem');
  });

  it('mostra dias até uma semana', () => {
    expect(formatRelativeDate(now - 4 * DAY, now)).toBe('há 4 dias');
    expect(formatRelativeDate(now - 7 * DAY, now)).toBe('há 7 dias');
  });

  it('usa data curta pt-BR acima de 7 dias', () => {
    const old = now - 8 * DAY;
    const expected = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(old));
    expect(formatRelativeDate(old, now)).toBe(expected);
  });
});
