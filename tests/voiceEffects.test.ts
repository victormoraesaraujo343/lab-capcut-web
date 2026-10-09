import { describe, expect, it } from 'vitest';
import {
  buildVoiceChain,
  defaultVoiceParams,
  isVoiceEffectType,
  softClipCurve,
  voicePitchFactor,
} from '../src/engine/audio/voiceEffects';
import type { EffectInstance } from '../src/types/effects';

/** Parâmetro de áudio falso: só guarda o valor. */
class FakeParam {
  constructor(public value: number) {}
}

/** Nó de áudio falso: registra o tipo, os parâmetros e as ligações feitas. */
class FakeNode {
  readonly outputs: unknown[] = [];
  disconnects = 0;
  type = '';
  buffer: unknown = null;
  curve: Float32Array | null = null;
  readonly gain = new FakeParam(1);
  readonly delayTime = new FakeParam(0);
  readonly frequency = new FakeParam(0);
  readonly Q = new FakeParam(1);
  started = 0;
  stopped = 0;
  constructor(readonly kind: string) {}
  connect(target: unknown): void {
    this.outputs.push(target);
  }
  disconnect(): void {
    this.outputs.length = 0;
    this.disconnects++;
  }
  start(): void {
    this.started++;
  }
  stop(): void {
    this.stopped++;
  }
}

/** Contexto falso que grava todos os nós criados. */
class FakeContext {
  readonly sampleRate = 1000;
  readonly nodes: FakeNode[] = [];
  createGain(): FakeNode {
    return this.add('gain');
  }
  createDelay(): FakeNode {
    return this.add('delay');
  }
  createBiquadFilter(): FakeNode {
    return this.add('biquad');
  }
  createConvolver(): FakeNode {
    return this.add('convolver');
  }
  createOscillator(): FakeNode {
    return this.add('oscillator');
  }
  createWaveShaper(): FakeNode {
    return this.add('shaper');
  }
  createBuffer(channels: number, length: number) {
    return { channels, length, copyToChannel: () => undefined };
  }
  ofKind(kind: string): FakeNode[] {
    return this.nodes.filter((node) => node.kind === kind);
  }
  private add(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
}

/** Cria o contexto falso já tipado como contexto de áudio. */
function makeContext(): { fake: FakeContext; ctx: BaseAudioContext } {
  const fake = new FakeContext();
  return { fake, ctx: fake as unknown as BaseAudioContext };
}

/** Instância de efeito de voz com os parâmetros dados. */
function effect(type: string, params: Record<string, number>): EffectInstance {
  return { id: `${type}-1`, type, params };
}

describe('softClipCurve', () => {
  it('é monotônica e fica dentro de [-1, 1]', () => {
    for (const drive of [0, 0.5, 1]) {
      const curve = softClipCurve(drive, 256);
      expect(curve.length).toBe(256);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i] ?? 0).toBeGreaterThanOrEqual(curve[i - 1] ?? 0);
      }
      for (const value of curve) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('é simétrica: a saída de -x é o oposto da saída de x', () => {
    const curve = softClipCurve(0.8, 101);
    expect(curve[0]).toBeCloseTo(-(curve[100] ?? 0), 6);
    expect(curve[25]).toBeCloseTo(-(curve[75] ?? 0), 6);
  });

  it('com mais saturação, o meio da curva sobe mais depressa', () => {
    const soft = softClipCurve(0, 101)[75] ?? 0;
    const hard = softClipCurve(1, 101)[75] ?? 0;
    expect(hard).toBeGreaterThan(soft);
  });
});

describe('voicePitchFactor', () => {
  it('converte semitons em fator de tom', () => {
    expect(voicePitchFactor(effect('pitch', { semitones: 12 }))).toBeCloseTo(2, 10);
    expect(voicePitchFactor(effect('pitch', { semitones: -12 }))).toBeCloseTo(0.5, 10);
    expect(voicePitchFactor(effect('pitch', { semitones: 0 }))).toBe(1);
  });

  it('limita os semitons a -12..12 e ignora outros efeitos', () => {
    expect(voicePitchFactor(effect('pitch', { semitones: 40 }))).toBeCloseTo(2, 10);
    expect(voicePitchFactor(effect('echo', { delayMs: 300 }))).toBe(1);
    expect(voicePitchFactor(undefined)).toBe(1);
  });
});

describe('tipos e parâmetros padrão', () => {
  it('reconhece só os tipos de efeito de voz conhecidos', () => {
    expect(isVoiceEffectType('echo')).toBe(true);
    expect(isVoiceEffectType('blur')).toBe(false);
  });

  it('dá parâmetros padrão para cada tipo, dentro das faixas', () => {
    expect(defaultVoiceParams('pitch')).toEqual({ semitones: 4 });
    expect(defaultVoiceParams('echo')).toEqual({ delayMs: 250, feedback: 0.35, mix: 0.4 });
    expect(defaultVoiceParams('reverb')).toEqual({ roomSize: 0.5, mix: 0.3 });
    expect(defaultVoiceParams('robot')).toEqual({ frequency: 60, mix: 1 });
    expect(defaultVoiceParams('telephone')).toEqual({ drive: 0.3 });
  });
});

describe('buildVoiceChain', () => {
  it('sem efeito (ou tom, feito no buffer) passa o áudio direto: entrada e saída são o mesmo nó', () => {
    const none = makeContext();
    const undef = buildVoiceChain(none.ctx, undefined);
    expect(undef.input).toBe(undef.output);
    expect(none.fake.nodes).toHaveLength(1);

    const pitch = makeContext();
    const stage = buildVoiceChain(pitch.ctx, effect('pitch', { semitones: 3 }));
    expect(stage.input).toBe(stage.output);
    expect(pitch.fake.ofKind('delay')).toHaveLength(0);
  });

  it('eco cria atraso com realimentação e mistura seca/molhada', () => {
    const { fake, ctx } = makeContext();
    const stage = buildVoiceChain(ctx, effect('echo', { delayMs: 300, feedback: 0.5, mix: 0.25 }));
    const [delay] = fake.ofKind('delay');
    expect(delay).toBeDefined();
    expect(delay?.delayTime.value).toBeCloseTo(0.3, 10);
    const loop = fake.ofKind('gain').find((node) => node.gain.value === 0.5);
    expect(loop).toBeDefined();
    expect(delay?.outputs).toContain(loop);
    expect(loop?.outputs).toContain(delay);
    const wet = fake.ofKind('gain').find((node) => node.gain.value === 0.25);
    expect(wet).toBeDefined();
    expect(stage.input).not.toBe(stage.output);
  });

  it('eco limita o atraso a 1 s e a realimentação a 0,9', () => {
    const { fake, ctx } = makeContext();
    buildVoiceChain(ctx, effect('echo', { delayMs: 5000, feedback: 2 }));
    expect(fake.ofKind('delay')[0]?.delayTime.value).toBeCloseTo(1, 10);
    expect(fake.ofKind('gain').some((node) => node.gain.value === 0.9)).toBe(true);
  });

  it('reverberação cria um convolver com resposta ao impulso (mais longa com sala maior)', () => {
    const small = makeContext();
    buildVoiceChain(small.ctx, effect('reverb', { roomSize: 0, mix: 0.3 }));
    const smallBuffer = small.fake.ofKind('convolver')[0]?.buffer as { length: number } | null;
    expect(smallBuffer?.length).toBe(400);

    const big = makeContext();
    buildVoiceChain(big.ctx, effect('reverb', { roomSize: 1, mix: 0.3 }));
    const bigBuffer = big.fake.ofKind('convolver')[0]?.buffer as { length: number } | null;
    expect(bigBuffer?.length).toBe(3000);
  });

  it('robô modula o sinal com um oscilador na frequência pedida', () => {
    const { fake, ctx } = makeContext();
    buildVoiceChain(ctx, effect('robot', { frequency: 90, mix: 1 }));
    const [oscillator] = fake.ofKind('oscillator');
    expect(oscillator?.frequency.value).toBe(90);
    expect(oscillator?.type).toBe('sine');
    expect(oscillator?.started).toBe(1);
    const ring = fake.ofKind('gain').find((node) => oscillator?.outputs.includes(node.gain));
    expect(ring).toBeDefined();
    expect(ring?.gain.value).toBe(0);
  });

  it('telefone usa passa-alta em 300 Hz, passa-baixa em 3400 Hz e saturação', () => {
    const { fake, ctx } = makeContext();
    const stage = buildVoiceChain(ctx, effect('telephone', { drive: 0.5 }));
    const [highpass, lowpass] = fake.ofKind('biquad');
    expect(highpass?.type).toBe('highpass');
    expect(highpass?.frequency.value).toBe(300);
    expect(lowpass?.type).toBe('lowpass');
    expect(lowpass?.frequency.value).toBe(3400);
    const [shaper] = fake.ofKind('shaper');
    expect(shaper?.curve?.length).toBe(1024);
    expect(stage.input).toBe(highpass);
    expect(stage.output).toBe(shaper);
    expect(highpass?.outputs).toContain(lowpass);
    expect(lowpass?.outputs).toContain(shaper);
  });

  it('dispose desconecta os nós e parar o oscilador do robô é feito uma vez', () => {
    const { fake, ctx } = makeContext();
    const stage = buildVoiceChain(ctx, effect('robot', {}));
    stage.dispose();
    stage.dispose();
    const [oscillator] = fake.ofKind('oscillator');
    expect(oscillator?.stopped).toBe(1);
    expect(fake.nodes.every((node) => node.disconnects > 0)).toBe(true);
  });
});

describe('voiceTailSeconds', () => {
  it('eco: cauda até cair ~60 dB, limitada a 6 s', async () => {
    const { voiceTailSeconds } = await import('../src/engine/audio/voiceEffects');
    const echo = (delayMs: number, feedback: number) => ({ id: 'e', type: 'echo', params: { delayMs, feedback, mix: 0.4 } });
    expect(voiceTailSeconds(echo(250, 0.5))).toBeCloseTo(0.25 * (Math.log(0.001) / Math.log(0.5)), 5);
    expect(voiceTailSeconds(echo(1000, 0.9))).toBe(6);
  });
  it('reverb: duração do impulso; outros efeitos e sem efeito: 0', async () => {
    const { voiceTailSeconds } = await import('../src/engine/audio/voiceEffects');
    expect(voiceTailSeconds({ id: 'r', type: 'reverb', params: { roomSize: 1, mix: 0.3 } })).toBeCloseTo(3);
    expect(voiceTailSeconds({ id: 't', type: 'telephone', params: { drive: 0.5 } })).toBe(0);
    expect(voiceTailSeconds(undefined)).toBe(0);
  });
});
