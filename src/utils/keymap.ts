// Mapa de atalhos do editor: ações, combinações padrão, tradução de eventos de teclado e alvos de digitação.

/** Ações do editor que podem ser acionadas por atalho. */
export type ShortcutAction =
  | "playPause"
  | "split"
  | "delete"
  | "rippleDelete"
  | "undo"
  | "redo"
  | "duplicate"
  | "copy"
  | "paste"
  | "cut"
  | "trimStartToPlayhead"
  | "trimEndToPlayhead"
  | "prevEdge"
  | "nextEdge"
  | "zoomIn"
  | "zoomOut"
  | "selectAll"
  | "group"
  | "ungroup"
  | "bladeTool"
  | "selectTool"
  | "frameBack"
  | "frameForward"
  | "goToStart"
  | "goToEnd"
  | "toggleSnap";

/** Mapa de cada ação às combinações de teclas que a acionam. */
export type Keymap = Record<ShortcutAction, string[]>;

/** Atalhos padrão do editor. */
export const DEFAULT_KEYMAP: Keymap = {
  playPause: ["Space"],
  split: ["S", "Ctrl+B"],
  delete: ["Delete", "Backspace"],
  rippleDelete: ["Shift+Delete", "Shift+Backspace"],
  undo: ["Ctrl+Z"],
  redo: ["Ctrl+Y", "Ctrl+Shift+Z"],
  duplicate: ["Ctrl+D"],
  copy: ["Ctrl+C"],
  paste: ["Ctrl+V"],
  cut: ["Ctrl+X"],
  trimStartToPlayhead: ["Q"],
  trimEndToPlayhead: ["W"],
  prevEdge: ["["],
  nextEdge: ["]"],
  zoomIn: ["+", "=", "Ctrl+="],
  zoomOut: ["-", "Ctrl+-"],
  selectAll: ["Ctrl+A"],
  group: ["Ctrl+G"],
  ungroup: ["Ctrl+Shift+G"],
  bladeTool: ["B"],
  selectTool: ["A", "V"],
  frameBack: ["ArrowLeft"],
  frameForward: ["ArrowRight"],
  goToStart: ["Home"],
  goToEnd: ["End"],
  toggleSnap: ["N"],
};

/** Teclas que são apenas modificadoras e não formam combinação sozinhas. */
const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "AltGraph",
]);

/** Converte o nome de uma tecla (key ou code) no rótulo usado nos atalhos; vazio se não houver tecla. */
function keyLabel(key: string, code: string | undefined): string {
  if (key === " " || code === "Space") return "Space";
  if (key === "Unidentified" || key === "" || key === "Dead") {
    if (code === undefined) return "";
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter?.[1] !== undefined) return letter[1];
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit?.[1] !== undefined) return digit[1];
    return code;
  }
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  return key;
}

/** Monta a combinação canônica ('Ctrl+Alt+Shift+Tecla') a partir de um evento de teclado; vazia para modificadores sozinhos. */
export function eventToCombo(e: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): string {
  if (MODIFIER_KEYS.has(e.key)) return "";
  const label = keyLabel(e.key, e.code);
  if (label === "") return "";

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  const shiftIsImplicit = label === "+" || label === "=";
  if (e.shiftKey && !shiftIsImplicit) parts.push("Shift");
  parts.push(label);
  return parts.join("+");
}

/** Encontra a ação cuja lista de combinações contém a combinação dada; null se nenhuma corresponder. */
export function resolveShortcut(
  combo: string,
  keymap: Keymap,
): ShortcutAction | null {
  if (combo === "") return null;
  for (const action of Object.keys(keymap) as ShortcutAction[]) {
    if (keymap[action].includes(combo)) return action;
  }
  return null;
}

/** Indica se o alvo do evento é um campo de texto editável (input, textarea, select ou contentEditable). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement))
    return false;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const editable = target.getAttribute("contenteditable");
  return editable !== null && editable !== "false";
}
