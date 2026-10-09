import { describe, expect, it } from "vitest";
import {
  collectSnapPoints,
  findEdge,
  msToPx,
  pxToMs,
  snapRange,
  snapThresholdMs,
  snapValue,
} from "@/engine/timeline/snap";
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Clip,
  type Track,
} from "@/types";

function makeClip(id: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    trackId: "t1",
    startMs,
    durationMs,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
  };
}

function makeTrack(id: string, clips: Clip[]): Track {
  return {
    id,
    kind: "video",
    name: id,
    clips,
    muted: false,
    locked: false,
    hidden: false,
  };
}

describe("collectSnapPoints", () => {
  it("reúne zero, playhead, marcadores e bordas dos clipes, ordenados e sem repetição", () => {
    const tracks = [
      makeTrack("t1", [makeClip("a", 1000, 500), makeClip("b", 1500, 500)]),
    ];
    expect(collectSnapPoints(tracks, [], 1500, [250, 1000])).toEqual([
      0, 250, 1000, 1500, 2000,
    ]);
  });

  it("ignora clipes excluídos", () => {
    const tracks = [
      makeTrack("t1", [makeClip("a", 1000, 500), makeClip("b", 3000, 500)]),
    ];
    expect(collectSnapPoints(tracks, ["a"], 0, [])).toEqual([0, 3000, 3500]);
  });

  it("retorna só zero e playhead quando não há clipes nem marcadores", () => {
    expect(collectSnapPoints([], [], 400, [])).toEqual([0, 400]);
  });
});

describe("snapValue", () => {
  it("encaixa no ponto mais próximo dentro do limiar", () => {
    expect(snapValue(1003, [0, 1000, 2000], 5)).toEqual({
      value: 1000,
      snappedTo: 1000,
    });
  });

  it("aceita o limite exato do limiar", () => {
    expect(snapValue(1005, [1000], 5)).toEqual({
      value: 1000,
      snappedTo: 1000,
    });
  });

  it("não encaixa fora do limiar", () => {
    expect(snapValue(1010, [1000], 5)).toEqual({
      value: 1010,
      snappedTo: null,
    });
  });

  it("sem pontos, devolve o valor original", () => {
    expect(snapValue(700, [], 50)).toEqual({ value: 700, snappedTo: null });
  });
});

describe("snapRange", () => {
  it("encaixa a borda inicial quando é a mais próxima", () => {
    expect(snapRange(1002, 1000, [1000], 5)).toEqual({
      startMs: 1000,
      snappedTo: 1000,
    });
  });

  it("encaixa a borda final e recalcula o início", () => {
    expect(snapRange(0, 2998, [3000], 5)).toEqual({
      startMs: 2,
      snappedTo: 3000,
    });
  });

  it("quando as duas bordas encaixam, usa a mais próxima", () => {
    expect(snapRange(1001, 1000, [1000, 2003], 5)).toEqual({
      startMs: 1000,
      snappedTo: 1000,
    });
  });

  it("em empate de distância, a borda final ganha", () => {
    expect(snapRange(1000, 1000, [1000, 2000], 5)).toEqual({
      startMs: 1000,
      snappedTo: 2000,
    });
  });

  it("sem pontos, mantém o início", () => {
    expect(snapRange(300, 500, [], 5)).toEqual({
      startMs: 300,
      snappedTo: null,
    });
  });
});

describe("conversão px e ms", () => {
  it("converte pixels em milissegundos e vice-versa", () => {
    expect(pxToMs(100, 50)).toBe(2000);
    expect(msToPx(2000, 50)).toBe(100);
  });

  it("zoom inválido resulta em zero", () => {
    expect(pxToMs(100, 0)).toBe(0);
    expect(msToPx(100, -1)).toBe(0);
  });

  it("calcula o limiar padrão de 8 px", () => {
    expect(snapThresholdMs(100)).toBe(80);
    expect(snapThresholdMs(100, 4)).toBe(40);
  });
});

describe("findEdge", () => {
  const tracks = [
    makeTrack("t1", [makeClip("a", 1000, 1000)]),
    makeTrack("t2", [makeClip("b", 3000, 500)]),
  ];

  it("encontra a borda anterior estritamente menor", () => {
    expect(findEdge(tracks, 2000, "prev")).toBe(1000);
    expect(findEdge(tracks, 1000, "prev")).toBe(null);
  });

  it("encontra a borda seguinte estritamente maior", () => {
    expect(findEdge(tracks, 2000, "next")).toBe(3000);
    expect(findEdge(tracks, 1000, "next")).toBe(2000);
  });

  it("retorna null quando não há borda na direção", () => {
    expect(findEdge(tracks, 3500, "next")).toBe(null);
    expect(findEdge([], 0, "prev")).toBe(null);
  });
});
