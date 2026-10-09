// Converte eventos de teclado em combinações normalizadas ('Ctrl+Shift+Z') e formata essas combinações para exibição em pt-BR.
/** Indica se o alvo do evento é um campo de texto editável; nesse caso os atalhos não disparam. */
export { isTypingTarget } from '@/utils/keymap';

/** Campos do evento de teclado usados para montar a combinação. */
export interface ComboEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Teclas que só modificam outras e não formam combinação sozinhas. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph']);

/** Nomes de tecla que levam Shift na combinação (ex.: Shift+Z, Shift+Delete); símbolos como '?' já trazem o Shift embutido. */
const WORD_KEY = /^[A-Za-z0-9]+$/;

/** Nomes exibidos em pt-BR para as teclas que têm rótulo próprio. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  Space: 'Espaço',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Home: 'Início',
  End: 'Fim',
  Escape: 'Esc',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
};

/** Rótulo da tecla principal: letras em maiúsculas, espaço como 'Space' e teclas sem nome legível pelo código. */
function keyLabel(key: string, code: string | undefined): string {
  if (key === ' ' || code === 'Space') return 'Space';
  if (key === 'Unidentified' || key === '' || key === 'Dead') {
    if (code === undefined) return '';
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter?.[1] !== undefined) return letter[1];
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit?.[1] !== undefined) return digit[1];
    return code;
  }
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  return key;
}

/** Monta a combinação canônica ('Ctrl+Alt+Shift+Tecla') de um evento; Meta conta como Ctrl. Vazia para modificador sozinho. */
export function comboFromEvent(e: ComboEventLike): string {
  if (MODIFIER_KEYS.has(e.key)) return '';
  const label = keyLabel(e.key, e.code);
  if (label === '') return '';

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && WORD_KEY.test(label)) parts.push('Shift');
  parts.push(label);
  return parts.join('+');
}

/** Separa uma combinação em teclas ('Ctrl+Shift+Z' vira ['Ctrl', 'Shift', 'Z']); trata a própria tecla '+' corretamente. */
export function splitCombo(combo: string): string[] {
  if (combo === '') return [];
  if (combo === '+') return ['+'];
  if (combo.endsWith('++')) {
    const modifiers = combo.slice(0, -2);
    return [...(modifiers === '' ? [] : modifiers.split('+')), '+'];
  }
  return combo.split('+');
}

/** Nome de uma tecla para exibição em pt-BR ('ArrowLeft' vira '←', 'Space' vira 'Espaço'). */
export function formatKey(part: string): string {
  return KEY_NAMES[part] ?? part;
}

/** Combinação pronta para exibir em pt-BR, por exemplo 'Ctrl + Shift + Z' ou 'Espaço'. */
export function formatCombo(combo: string): string {
  return splitCombo(combo).map(formatKey).join(' + ');
}

/** Indica se o alvo do evento está dentro de um diálogo modal, onde os atalhos do editor não devem agir. */
export function isInsideDialog(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest('[role="dialog"], [aria-modal="true"], dialog') !== null;
}
