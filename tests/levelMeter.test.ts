import { describe, expect, it, vi } from "vitest";
import { createLevelMeter, rmsLevel } from "@/engine/recording/levelMeter";

describe("rmsLevel", () => {
  it("vale 0 para lista vazia e para silêncio", () => {
    expect(rmsLevel(new Float32Array([]))).toBe(0);
    expect(rmsLevel(new Float32Array([0, 0, 0]))).toBe(0);
  });

  it("calcula o RMS de amostras de mesma amplitude", () => {
    expect(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });

  it("limita o resultado em 1", () => {
    expect(rmsLevel(new Float32Array([3, -3]))).toBe(1);
  });
});

describe("createLevelMeter", () => {
  it("lê o analisador, suaviza a queda e libera os nós", () => {
    const analyser = {
      fftSize: 0,
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => buffer.fill(0.5)),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const ctx = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
    } as unknown as AudioContext;

    const meter = createLevelMeter(ctx, {} as MediaStream);
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(meter.level()).toBeCloseTo(0.5);

    analyser.getFloatTimeDomainData.mockImplementation((buffer: Float32Array) => buffer.fill(0));
    expect(meter.level()).toBeCloseTo(0.35);

    meter.dispose();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
  });
});
