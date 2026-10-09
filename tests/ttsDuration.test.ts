import { describe, expect, it } from 'vitest';
import { estimateSpeechMs } from '@/engine/tts/ttsDuration';

describe('estimateSpeechMs', () => {
  it('estima 14 caracteres por segundo na velocidade 1', () => {
    const text = 'a'.repeat(28);
    expect(estimateSpeechMs(text, 1)).toBe(2000);
  });

  it('acelera ou desacelera pela velocidade', () => {
    const text = 'a'.repeat(28);
    expect(estimateSpeechMs(text, 2)).toBe(1000);
    expect(estimateSpeechMs(text, 0.5)).toBe(4000);
  });

  it('nunca fica abaixo de 800 ms', () => {
    expect(estimateSpeechMs('oi', 2)).toBe(800);
    expect(estimateSpeechMs('', 1)).toBe(800);
  });

  it('não conta espaços das pontas do texto', () => {
    expect(estimateSpeechMs(`   ${'a'.repeat(28)}   `, 1)).toBe(2000);
  });

  it('usa velocidade 1 quando o valor é inválido', () => {
    expect(estimateSpeechMs('a'.repeat(28), 0)).toBe(2000);
    expect(estimateSpeechMs('a'.repeat(28), Number.NaN)).toBe(2000);
  });
});
