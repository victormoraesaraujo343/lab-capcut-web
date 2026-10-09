import { describe, expect, it } from "vitest";
import {
  applyEntry,
  canRedo,
  canUndo,
  createHistory,
  diffTracks,
  pushEntry,
  redo,
  undo,
} from "@/engine/timeline/history";
import type { Track } from "@/types";

function makeTrack(id: string, name: string = id): Track {
  return {
    id,
    kind: "video",
    name,
    clips: [],
    muted: false,
    locked: false,
    hidden: false,
  };
}

describe("diffTracks", () => {
  it("retorna null quando nada mudou", () => {
    const tracks = [makeTrack("a"), makeTrack("b")];
    expect(diffTracks(tracks, [...tracks], "nada")).toBeNull();
  });

  it("retorna null quando o conteúdo é igual mas a referência mudou", () => {
    const before = [makeTrack("a")];
    const after = [makeTrack("a")];
    expect(diffTracks(before, after, "igual")).not.toBeNull();
  });

  it("registra trilha com referência nova como mudança", () => {
    const a = makeTrack("a");
    const changed = { ...a, muted: true };
    const entry = diffTracks([a], [changed], "mudo");
    expect(entry?.changes).toEqual([
      { trackId: "a", before: a, after: changed },
    ]);
    expect(entry?.label).toBe("mudo");
  });

  it("registra trilha adicionada com before null e removida com after null", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    expect(diffTracks([a], [a, b], "add")?.changes).toEqual([
      { trackId: "b", before: null, after: b },
    ]);
    expect(diffTracks([a, b], [a], "rm")?.changes).toEqual([
      { trackId: "b", before: b, after: null },
    ]);
  });

  it("registra reordenação mesmo sem mudança de conteúdo", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const entry = diffTracks([a, b], [b, a], "ordem");
    expect(entry).not.toBeNull();
    expect(entry?.changes).toEqual([]);
    expect(entry?.orderBefore).toEqual(["a", "b"]);
    expect(entry?.orderAfter).toEqual(["b", "a"]);
  });
});

describe("applyEntry e desfazer/refazer", () => {
  it("desfaz e refaz mudança numa trilha", () => {
    const a = makeTrack("a");
    const changed = { ...a, locked: true };
    const entry = diffTracks([a], [changed], "trancar");
    expect(entry).not.toBeNull();
    if (entry === null) return;
    const history = pushEntry(createHistory(), entry);
    const undone = undo(history, [changed]);
    expect(undone?.tracks).toEqual([a]);
    expect(undone?.tracks[0]).toBe(a);
    const redone = redo(undone?.history ?? history, undone?.tracks ?? []);
    expect(redone?.tracks[0]).toBe(changed);
  });

  it("desfaz a adição e refaz a remoção de uma trilha", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const entry = diffTracks([a], [a, b], "adicionar");
    if (entry === null) throw new Error("entrada esperada");
    const undone = undo(pushEntry(createHistory(), entry), [a, b]);
    expect(undone?.tracks).toEqual([a]);
    const redone = redo(
      undone?.history ?? createHistory(),
      undone?.tracks ?? [],
    );
    expect(redone?.tracks).toEqual([a, b]);
  });

  it("desfaz a remoção de uma trilha restaurando a posição", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const c = makeTrack("c");
    const entry = diffTracks([a, b, c], [a, c], "remover");
    if (entry === null) throw new Error("entrada esperada");
    const undone = undo(pushEntry(createHistory(), entry), [a, c]);
    expect(undone?.tracks).toEqual([a, b, c]);
    expect(undone?.tracks[1]).toBe(b);
  });

  it("desfaz uma reordenação", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const entry = diffTracks([a, b], [b, a], "reordenar");
    if (entry === null) throw new Error("entrada esperada");
    const undone = undo(pushEntry(createHistory(), entry), [b, a]);
    expect(undone?.tracks).toEqual([a, b]);
  });

  it("mantém trilhas que não estão no patch com a referência atual", () => {
    const a = makeTrack("a");
    const b = makeTrack("b");
    const bNow = { ...b, hidden: true };
    const changedA = { ...a, muted: true };
    const entry = diffTracks([a, b], [changedA, b], "mudo");
    if (entry === null) throw new Error("entrada esperada");
    const result = applyEntry([changedA, bNow], entry, "undo");
    expect(result).toEqual([a, bNow]);
    expect(result[1]).toBe(bNow);
  });

  it("três desfazeres voltam ao estado original", () => {
    const original = [makeTrack("a"), makeTrack("b")];
    let tracks = original;
    let history = createHistory();
    const steps = [
      (ts: Track[]): Track[] =>
        ts.map((t) => (t.id === "a" ? { ...t, muted: true } : t)),
      (ts: Track[]): Track[] => [...ts, makeTrack("c")],
      (ts: Track[]): Track[] =>
        [ts[1], ts[0], ts[2]].filter((t): t is Track => t !== undefined),
    ];
    for (const step of steps) {
      const next = step(tracks);
      const entry = diffTracks(tracks, next, "passo");
      if (entry === null) throw new Error("entrada esperada");
      history = pushEntry(history, entry);
      tracks = next;
    }
    for (let i = 0; i < 3; i += 1) {
      const result = undo(history, tracks);
      if (result === null) throw new Error("undo esperado");
      history = result.history;
      tracks = result.tracks;
    }
    expect(tracks).toEqual(original);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(true);
  });

  it("undo e redo retornam null quando não há ação", () => {
    expect(undo(createHistory(), [])).toBeNull();
    expect(redo(createHistory(), [])).toBeNull();
  });

  it("pushEntry limpa o futuro", () => {
    const a = makeTrack("a");
    const e1 = diffTracks([a], [{ ...a, muted: true }], "um");
    if (e1 === null) throw new Error("entrada esperada");
    const undone = undo(pushEntry(createHistory(), e1), [
      { ...a, muted: true },
    ]);
    if (undone === null) throw new Error("undo esperado");
    expect(canRedo(undone.history)).toBe(true);
    const e2 = diffTracks([a], [{ ...a, locked: true }], "dois");
    if (e2 === null) throw new Error("entrada esperada");
    const pushed = pushEntry(undone.history, e2);
    expect(canRedo(pushed)).toBe(false);
    expect(pushed.future).toEqual([]);
  });
});
