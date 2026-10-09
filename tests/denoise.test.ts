import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDenoiseChain, denoiseSettings, ensureNoiseGateModule } from '../src/engine/audio/denoise';
import { DEFAULT_GATE_PARAMS } from '../src/engine/audio/noiseGate';

/** Parâmetro de áudio falso: só guarda o valor. */
class FakeParam {
  value = 0;
}

/** Nó de áudio falso da redução de ruído: parâmetros usados pela cadeia e ligações feitas. */
class FakeNode {
  readonly outputs: unknown[] = [];
  disconnects = 0;
  type = '';
  readonly frequency = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  constructor(readonly kind: string) {}
  connect(target: unknown): void {
    this.outputs.push(target);
  }
  disconnect(): void {
    this.outputs.length = 0;
    this.disconnects++;
  }
}

/** Nó falso do AudioWorklet: grava o nome do processador e as opções recebidas. */
class FakeWorkletNode extends FakeNode {
  constructor(
    context: FakeContext,
    readonly processorName: string,
    readonly options: AudioWorkletNodeOptions,
  ) {
    super('worklet');
    context.nodes.push(this);
  }
}

/** Contexto falso que grava os nós criados e simula o carregamento de módulos do worklet. */
class FakeContext {
  readonly nodes: FakeNode[] = [];
  readonly addModule = vi.fn(async (): Promise<void> => undefined);
  readonly audioWorklet = { addModule: this.addModule };
  createBiquadFilter(): FakeNode {
    return this.add('biquad');
  }
  createDynamicsCompressor(): FakeNode {
    return this.add('compressor');
  }
  private add(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('denoiseSettings', () => {
  it('usa passa-alta em 80 Hz, passa-baixa em 9 kHz e compressor leve abaixo de -50 dB', () => {
    expect(denoiseSettings()).toEqual({
      highpassHz: 80,
      lowpassHz: 9000,
      thresholdDb: -50,
      kneeDb: 10,
      ratio: 1.5,
      attackS: 0.003,
      releaseS: 0.25,
    });
  });
});

describe('ensureNoiseGateModule', () => {
  it('carrega o módulo uma única vez por contexto e devolve true', async () => {
    const fake = new FakeContext();
    const ctx = fake as unknown as BaseAudioContext;
    expect(await ensureNoiseGateModule(ctx)).toBe(true);
    expect(await ensureNoiseGateModule(ctx)).toBe(true);
    expect(fake.addModule).toHaveBeenCalledTimes(1);
  });

  it('devolve false, sem rejeitar, quando o carregamento falha', async () => {
    const fake = new FakeContext();
    fake.addModule.mockRejectedValueOnce(new Error('sem worklet'));
    expect(await ensureNoiseGateModule(fake as unknown as BaseAudioContext)).toBe(false);
  });

  it('devolve false quando o contexto não tem AudioWorklet', async () => {
    const bare = {} as unknown as BaseAudioContext;
    expect(await ensureNoiseGateModule(bare)).toBe(false);
  });
});

describe('buildDenoiseChain', () => {
  it('sem o módulo do portão, monta passa-alta → passa-baixa → compressor de reserva', () => {
    const fake = new FakeContext();
    const stage = buildDenoiseChain(fake as unknown as BaseAudioContext);
    const [highpass, lowpass] = fake.nodes.filter((node) => node.kind === 'biquad');
    const [compressor] = fake.nodes.filter((node) => node.kind === 'compressor');
    expect(highpass?.type).toBe('highpass');
    expect(highpass?.frequency.value).toBe(80);
    expect(lowpass?.type).toBe('lowpass');
    expect(lowpass?.frequency.value).toBe(9000);
    expect(compressor?.threshold.value).toBe(-50);
    expect(compressor?.knee.value).toBe(10);
    expect(compressor?.ratio.value).toBe(1.5);
    expect(stage.input).toBe(highpass);
    expect(stage.output).toBe(compressor);
    expect(highpass?.outputs).toContain(lowpass);
    expect(lowpass?.outputs).toContain(compressor);
  });

  it('com o módulo carregado, usa o AudioWorklet noise-gate no lugar do compressor', async () => {
    const fake = new FakeContext();
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    await ensureNoiseGateModule(fake as unknown as BaseAudioContext);
    const stage = buildDenoiseChain(fake as unknown as BaseAudioContext);
    const [highpass, lowpass] = fake.nodes.filter((node) => node.kind === 'biquad');
    const [gate] = fake.nodes.filter((node): node is FakeWorkletNode => node instanceof FakeWorkletNode);
    expect(fake.nodes.some((node) => node.kind === 'compressor')).toBe(false);
    expect(gate?.processorName).toBe('noise-gate');
    expect(gate?.options.processorOptions).toEqual(DEFAULT_GATE_PARAMS);
    expect(stage.input).toBe(highpass);
    expect(stage.output).toBe(gate);
    expect(highpass?.outputs).toContain(lowpass);
    expect(lowpass?.outputs).toContain(gate);
  });

  it('dispose desconecta todos os nós', () => {
    const fake = new FakeContext();
    const stage = buildDenoiseChain(fake as unknown as BaseAudioContext);
    stage.dispose();
    expect(fake.nodes.every((node) => node.disconnects > 0)).toBe(true);
  });
});
