import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYMAP,
  eventToCombo,
  isTypingTarget,
  resolveShortcut,
} from "@/utils/keymap";

const NO_MODS = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

describe("eventToCombo", () => {
  it("monta Ctrl+B a partir de Ctrl e tecla b", () => {
    expect(eventToCombo({ ...NO_MODS, key: "b", ctrlKey: true })).toBe(
      "Ctrl+B",
    );
  });

  it("trata Meta como Ctrl", () => {
    expect(eventToCombo({ ...NO_MODS, key: "b", metaKey: true })).toBe(
      "Ctrl+B",
    );
  });

  it("converte espaço em Space", () => {
    expect(eventToCombo({ ...NO_MODS, key: " " })).toBe("Space");
  });

  it("mantém Shift em Delete", () => {
    expect(eventToCombo({ ...NO_MODS, key: "Delete", shiftKey: true })).toBe(
      "Shift+Delete",
    );
  });

  it("não acrescenta Shift para o sinal de igual", () => {
    expect(eventToCombo({ ...NO_MODS, key: "=", shiftKey: true })).toBe("=");
    expect(
      eventToCombo({ ...NO_MODS, key: "+", shiftKey: true, ctrlKey: true }),
    ).toBe("Ctrl++");
  });

  it("ordena Ctrl, Alt, Shift antes da tecla", () => {
    expect(
      eventToCombo({
        key: "g",
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: true,
      }),
    ).toBe("Ctrl+Alt+Shift+G");
  });

  it("retorna vazio para modificador sozinho", () => {
    expect(eventToCombo({ ...NO_MODS, key: "Shift", shiftKey: true })).toBe("");
    expect(eventToCombo({ ...NO_MODS, key: "Control", ctrlKey: true })).toBe(
      "",
    );
  });
});

describe("resolveShortcut", () => {
  it("resolve combinações padrão para a ação", () => {
    expect(resolveShortcut("Ctrl+B", DEFAULT_KEYMAP)).toBe("split");
    expect(resolveShortcut("Space", DEFAULT_KEYMAP)).toBe("playPause");
    expect(resolveShortcut("Shift+Delete", DEFAULT_KEYMAP)).toBe(
      "rippleDelete",
    );
    expect(resolveShortcut("Ctrl+Shift+Z", DEFAULT_KEYMAP)).toBe("redo");
  });

  it("retorna null para combinação desconhecida ou vazia", () => {
    expect(resolveShortcut("Ctrl+Q", DEFAULT_KEYMAP)).toBeNull();
    expect(resolveShortcut("", DEFAULT_KEYMAP)).toBeNull();
  });

  it("usa o mapa recebido, não o padrão", () => {
    const custom = { ...DEFAULT_KEYMAP, split: ["X"] };
    expect(resolveShortcut("X", custom)).toBe("split");
    expect(resolveShortcut("S", custom)).toBeNull();
  });

  it("combina eventos de teclado com o mapa padrão", () => {
    const combo = eventToCombo({
      key: "b",
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    });
    expect(resolveShortcut(combo, DEFAULT_KEYMAP)).toBe("split");
  });
});

describe("isTypingTarget", () => {
  it("reconhece campos de texto", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("reconhece elementos contentEditable", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(isTypingTarget(div)).toBe(true);
  });

  it("retorna false para elementos comuns, null ou alvo que não é elemento", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});
