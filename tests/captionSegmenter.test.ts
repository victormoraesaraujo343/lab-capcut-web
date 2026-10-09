import { describe, expect, it } from 'vitest';
import { segmentCaptions, type TimedText } from '../src/engine/captions/captionSegmenter';

describe('segmentCaptions', () => {
  it('apara espaços e colapsa espaços internos', () => {
    const result = segmentCaptions([{ text: '  olá   mundo  ', startMs: 0, endMs: 1500 }]);
    expect(result).toEqual([{ text: 'olá mundo', startMs: 0, endMs: 1500 }]);
  });

  it('remove marcadores e textos sem letras ou números', () => {
    const chunks: TimedText[] = [
      { text: '[Música]', startMs: 0, endMs: 1000 },
      { text: '(risos)', startMs: 1000, endMs: 2000 },
      { text: '[BLANK_AUDIO]', startMs: 2000, endMs: 3000 },
      { text: '...', startMs: 3000, endMs: 3500 },
    ];
    expect(segmentCaptions(chunks)).toEqual([]);
  });

  it('mantém parênteses no meio de uma fala', () => {
    const result = segmentCaptions([{ text: 'Vamos (eu acho) embora', startMs: 0, endMs: 2000 }]);
    expect(result[0]?.text).toBe('Vamos (eu acho) embora');
  });

  it('junta pedaços curtos sem pontuação final', () => {
    const result = segmentCaptions([
      { text: 'Oi', startMs: 0, endMs: 300 },
      { text: 'tudo bem?', startMs: 300, endMs: 1200 },
    ]);
    expect(result).toEqual([{ text: 'Oi tudo bem?', startMs: 0, endMs: 1200 }]);
  });

  it('separa frases que terminam com pontuação', () => {
    const result = segmentCaptions([
      { text: 'Primeira frase.', startMs: 0, endMs: 2000 },
      { text: 'Segunda frase.', startMs: 2000, endMs: 4000 },
    ]);
    expect(result).toEqual([
      { text: 'Primeira frase.', startMs: 0, endMs: 2000 },
      { text: 'Segunda frase.', startMs: 2000, endMs: 4000 },
    ]);
  });

  it('não junta pedaços separados por pausa longa', () => {
    const result = segmentCaptions([
      { text: 'Oi tudo', startMs: 0, endMs: 600 },
      { text: 'bem', startMs: 5000, endMs: 5400 },
    ]);
    expect(result).toEqual([
      { text: 'Oi tudo', startMs: 0, endMs: 700 },
      { text: 'bem', startMs: 5000, endMs: 5700 },
    ]);
  });

  it('não junta quando o texto passaria de 42 caracteres', () => {
    const first = 'uma frase sem ponto final que continua';
    const second = 'e depois segue pra outra parte da fala';
    const result = segmentCaptions([
      { text: first, startMs: 0, endMs: 2000 },
      { text: second, startMs: 2000, endMs: 4000 },
    ]);
    expect(result.map((caption) => caption.text)).toEqual([first, second]);
  });

  it('garante duração mínima de 700 ms em legenda curta', () => {
    expect(segmentCaptions([{ text: 'Ok.', startMs: 0, endMs: 100 }])).toEqual([
      { text: 'Ok.', startMs: 0, endMs: 700 },
    ]);
  });

  it('quebra frase longa em partes curtas, com tempos contíguos', () => {
    const text = 'uma frase bem longa com muitas palavras para testar a divisao das legendas automaticas';
    const result = segmentCaptions([{ text, startMs: 0, endMs: 9000 }]);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.map((caption) => caption.text).join(' ')).toBe(text);
    for (const caption of result) {
      expect(caption.text.length).toBeLessThanOrEqual(42);
      expect(caption.endMs - caption.startMs).toBeLessThanOrEqual(5000);
    }
    expect(result[0]?.startMs).toBe(0);
    expect(result[result.length - 1]?.endMs).toBe(9000);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]?.startMs).toBeGreaterThanOrEqual(result[i - 1]?.endMs ?? 0);
    }
  });

  it('nunca deixa legendas se sobreporem', () => {
    const result = segmentCaptions([
      { text: 'Primeiro trecho sem pontuação aqui', startMs: 0, endMs: 3000 },
      { text: 'segundo trecho', startMs: 1000, endMs: 2500 },
    ]);
    expect(result).toEqual([
      { text: 'Primeiro trecho sem pontuação aqui', startMs: 0, endMs: 3000 },
      { text: 'segundo trecho', startMs: 3000, endMs: 3700 },
    ]);
  });

  it('cada frase começa uma legenda nova, com pedaços por frase', () => {
    const result = segmentCaptions([
      { text: 'Welcome to the browser video editor.', startMs: 0, endMs: 2000 },
      { text: 'Today we are testing automatic captions.', startMs: 2000, endMs: 4500 },
      {
        text: 'The editor runs entirely inside the browser, without any server.',
        startMs: 4500,
        endMs: 8000,
      },
    ]);
    expect(result.map((caption) => caption.text)).toEqual([
      'Welcome to the browser video editor.',
      'Today we are testing automatic captions.',
      'The editor runs entirely inside the',
      'browser, without any server.',
    ]);
    expect(result.map((caption) => caption.startMs)).toEqual([0, 2000, 4500, 6444]);
    expect(result[3]?.endMs).toBe(8000);
  });

  it('com palavra a palavra (Whisper), não separa frase no meio nem deixa palavra solta', () => {
    const words = [
      'Welcome', 'to', 'the', 'browser', 'video', 'editor.', 'Today', 'we', 'are', 'testing',
      'automatic', 'captions.', 'The', 'editor', 'runs', 'entirely', 'inside', 'the', 'browser,',
      'without', 'any', 'server.',
    ];
    const chunks: TimedText[] = words.map((text, index) => ({
      text,
      startMs: index * 300,
      endMs: index * 300 + 300,
    }));
    const result = segmentCaptions(chunks);
    expect(result).toEqual([
      { text: 'Welcome to the browser video editor.', startMs: 0, endMs: 1800 },
      { text: 'Today we are testing automatic captions.', startMs: 1800, endMs: 3600 },
      { text: 'The editor runs entirely inside the', startMs: 3600, endMs: 5400 },
      { text: 'browser, without any server.', startMs: 5400, endMs: 6600 },
    ]);
  });

  it('respeita as opções de tamanho e duração', () => {
    const result = segmentCaptions(
      [{ text: 'um dois três quatro cinco seis', startMs: 0, endMs: 3000 }],
      { maxChars: 12, minDurationMs: 100 },
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const caption of result) {
      expect(caption.text.length).toBeLessThanOrEqual(12);
    }
  });
});
