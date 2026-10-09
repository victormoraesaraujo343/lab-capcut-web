// Testes da seção Efeitos: os controles saem do spec do registro e cada mudança chama updateEffectParam.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EffectsSection } from '@/features/inspector/EffectsSection';
import { registerEffect } from '@/engine/render/registry';
import { moveEffect, removeEffect, updateEffectParam } from '@/stores/effectCommands';
import { t } from '@/i18n/pt-BR';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type EffectInstance } from '@/types';

vi.mock('@/stores/effectCommands', () => ({
  updateEffectParam: vi.fn(),
  moveEffect: vi.fn(),
  removeEffect: vi.fn(),
}));

const updateMock = vi.mocked(updateEffectParam);
const moveMock = vi.mocked(moveEffect);
const removeMock = vi.mocked(removeEffect);

beforeAll(() => {
  // Efeito de teste com um parâmetro de cada tipo; registrado uma única vez neste arquivo.
  registerEffect({
    type: 'testFx',
    category: 'effect',
    labelKey: 'testFx',
    params: [
      { key: 'radius', type: 'number', default: 4, min: 0, max: 20, step: 1 },
      { key: 'tint', type: 'boolean', default: false },
      { key: 'keyColor', type: 'color', default: '#00ff00' },
      { key: 'mode', type: 'select', default: 'horizontal', options: ['horizontal', 'vertical', 'quad'] },
    ],
    fragmentSource: '',
  });
});

/** Instância de efeito de teste com valores salvos. */
function effectInstance(id: string): EffectInstance {
  return { id, type: 'testFx', params: { radius: 4, tint: false, keyColor: '#00ff00', mode: 'horizontal' } };
}

/** Clipe de teste com dois efeitos na lista. */
function clipWith(effects: EffectInstance[]): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    trackId: 'track-1',
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects,
    audio: defaultAudioFx(),
    reversed: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('EffectsSection', () => {
  it('sem efeitos mostra o aviso de nenhum efeito', () => {
    render(<EffectsSection clip={clipWith([])} />);

    expect(screen.getByText(t.inspector.noEffects)).toBeInTheDocument();
  });

  it('gera um controle para cada parâmetro do spec, com o tipo certo', () => {
    render(<EffectsSection clip={clipWith([effectInstance('fx-1')])} />);

    expect(screen.getByRole('spinbutton', { name: t.effects.params.radius })).toHaveValue(4);
    expect(screen.getByRole('checkbox', { name: 'tint' })).not.toBeChecked();
    expect(screen.getByLabelText(t.effects.params.keyColor)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: t.effects.params.mode })).toHaveValue('horizontal');
    expect(screen.getByRole('option', { name: t.effects.mirrorOptions.vertical })).toBeInTheDocument();
  });

  it('digitar um número e sair do campo chama updateEffectParam com o novo valor', () => {
    render(<EffectsSection clip={clipWith([effectInstance('fx-1')])} />);
    const field = screen.getByRole('spinbutton', { name: t.effects.params.radius });

    fireEvent.change(field, { target: { value: '8' } });
    fireEvent.blur(field);

    expect(updateMock).toHaveBeenCalledWith('clip-1', 'fx-1', 'radius', 8);
  });

  it('marcar o liga/desliga chama updateEffectParam com verdadeiro', () => {
    render(<EffectsSection clip={clipWith([effectInstance('fx-1')])} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'tint' }));

    expect(updateMock).toHaveBeenCalledWith('clip-1', 'fx-1', 'tint', true);
  });

  it('trocar a lista chama updateEffectParam com a opção escolhida', () => {
    render(<EffectsSection clip={clipWith([effectInstance('fx-1')])} />);

    fireEvent.change(screen.getByRole('combobox', { name: t.effects.params.mode }), { target: { value: 'quad' } });

    expect(updateMock).toHaveBeenCalledWith('clip-1', 'fx-1', 'mode', 'quad');
  });

  it('mover, remover e a ordem dos botões respeitam a posição do efeito', () => {
    render(<EffectsSection clip={clipWith([effectInstance('fx-1'), effectInstance('fx-2')])} />);
    const up = screen.getAllByRole('button', { name: t.inspector.moveUp });
    const down = screen.getAllByRole('button', { name: t.inspector.moveDown });

    expect(up[0]).toBeDisabled();
    expect(down[1]).toBeDisabled();
    fireEvent.click(down[0] as HTMLElement);
    expect(moveMock).toHaveBeenCalledWith('clip-1', 'fx-1', 1);

    fireEvent.click(screen.getAllByRole('button', { name: t.inspector.removeEffect })[1] as HTMLElement);
    expect(removeMock).toHaveBeenCalledWith('clip-1', 'fx-2');
  });
});
