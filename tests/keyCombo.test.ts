// Testes da conversão de eventos de teclado em combinações, da formatação em pt-BR e dos alvos de digitação.
import { describe, expect, it } from 'vitest';
import {
  comboFromEvent,
  formatCombo,
  isInsideDialog,
  isTypingTarget,
  splitCombo,
} from '@/features/shortcuts/keyCombo';

const NO_MODS = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

describe('comboFromEvent', () => {
  it('monta Ctrl+B com Ctrl e a tecla b em maiúscula', () => {
    expect(comboFromEvent({ ...NO_MODS, key: 'b', ctrlKey: true })).toBe('Ctrl+B');
  });

  it('trata Meta (Command no Mac) como Ctrl', () => {
    expect(comboFromEvent({ ...NO_MODS, key: 'b', metaKey: true })).toBe('Ctrl+B');
    expect(comboFromEvent({ ...NO_MODS, key: 'z', metaKey: true, shiftKey: true })).toBe('Ctrl+Shift+Z');
  });

  it('converte a barra de espaço em Space', () => {
    expect(comboFromEvent({ ...NO_MODS, key: ' ' })).toBe('Space');
  });

  it('mantém Shift em teclas com nome, como Delete', () => {
    expect(comboFromEvent({ ...NO_MODS, key: 'Delete', shiftKey: true })).toBe('Shift+Delete');
  });

  it('não acrescenta Shift para símbolos que já o trazem, como ? e +', () => {
    expect(comboFromEvent({ ...NO_MODS, key: '?', shiftKey: true })).toBe('?');
    expect(comboFromEvent({ ...NO_MODS, key: '=', shiftKey: true })).toBe('=');
    expect(comboFromEvent({ ...NO_MODS, key: '+', shiftKey: true, ctrlKey: true })).toBe('Ctrl++');
  });

  it('monta Ctrl+/ com a barra', () => {
    expect(comboFromEvent({ ...NO_MODS, key: '/', ctrlKey: true })).toBe('Ctrl+/');
  });

  it('ordena Ctrl, Alt, Shift antes da tecla', () => {
    expect(comboFromEvent({ key: 'g', ctrlKey: true, metaKey: false, shiftKey: true, altKey: true })).toBe(
      'Ctrl+Alt+Shift+G',
    );
  });

  it('usa o código da tecla quando a tecla não tem nome', () => {
    expect(comboFromEvent({ ...NO_MODS, key: 'Dead', code: 'KeyQ' })).toBe('Q');
    expect(comboFromEvent({ ...NO_MODS, key: 'Unidentified', code: 'Digit4' })).toBe('4');
  });

  it('retorna vazio para modificador sozinho', () => {
    expect(comboFromEvent({ ...NO_MODS, key: 'Shift', shiftKey: true })).toBe('');
    expect(comboFromEvent({ ...NO_MODS, key: 'Control', ctrlKey: true })).toBe('');
    expect(comboFromEvent({ ...NO_MODS, key: 'Meta', metaKey: true })).toBe('');
  });
});

describe('splitCombo e formatCombo', () => {
  it('separa as teclas de uma combinação', () => {
    expect(splitCombo('Ctrl+Shift+Z')).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(splitCombo('Space')).toEqual(['Space']);
    expect(splitCombo('')).toEqual([]);
  });

  it('separa corretamente a própria tecla +', () => {
    expect(splitCombo('+')).toEqual(['+']);
    expect(splitCombo('Ctrl++')).toEqual(['Ctrl', '+']);
  });

  it('formata em pt-BR com setas e nomes traduzidos', () => {
    expect(formatCombo('Space')).toBe('Espaço');
    expect(formatCombo('ArrowLeft')).toBe('←');
    expect(formatCombo('ArrowRight')).toBe('→');
    expect(formatCombo('Home')).toBe('Início');
    expect(formatCombo('End')).toBe('Fim');
    expect(formatCombo('Escape')).toBe('Esc');
  });

  it('junta as teclas com sinal de mais e mantém o que não tem tradução', () => {
    expect(formatCombo('Ctrl+Shift+Z')).toBe('Ctrl + Shift + Z');
    expect(formatCombo('Shift+Delete')).toBe('Shift + Delete');
    expect(formatCombo('Ctrl++')).toBe('Ctrl + +');
    expect(formatCombo('')).toBe('');
  });
});

describe('isTypingTarget e isInsideDialog', () => {
  it('reconhece campos de texto como alvo de digitação', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('reconhece elementos dentro de um diálogo modal', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    expect(isInsideDialog(button)).toBe(true);
    expect(isInsideDialog(document.createElement('button'))).toBe(false);
    expect(isInsideDialog(null)).toBe(false);
  });
});
