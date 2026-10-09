// Testes da seção Forma do inspetor: espessura chama updateShape e a altura some para seta e linha.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShapeSection } from '@/features/inspector/ShapeSection';
import { t } from '@/i18n/pt-BR';
import { updateShape } from '@/stores/shapeCommands';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type ShapeData } from '@/types';

vi.mock('@/stores/shapeCommands', () => ({ updateShape: vi.fn() }));

/** Clipe de forma de teste com a forma dada. */
function shapeClip(shape: ShapeData['shape']): Clip {
  return {
    id: 'c1',
    trackId: 't1',
    startMs: 0,
    durationMs: 3000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    shape: { shape, fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 0, width: 600, height: 340, cornerRadius: 24 },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShapeSection', () => {
  it('mudar a espessura chama updateShape com o clipe e o novo valor', () => {
    render(<ShapeSection clip={shapeClip('rectangle')} />);
    const input = screen.getByRole('spinbutton', { name: t.shapes.strokeWidth });

    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(updateShape).toHaveBeenCalledWith('c1', { strokeWidth: 30 });
  });

  it('seta não mostra altura nem arredondamento', () => {
    render(<ShapeSection clip={shapeClip('arrow')} />);
    expect(screen.queryByRole('spinbutton', { name: t.shapes.height })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: t.shapes.cornerRadius })).toBeNull();
  });

  it('o botão Nenhum põe o preenchimento como transparente', () => {
    render(<ShapeSection clip={shapeClip('circle')} />);
    fireEvent.click(screen.getByRole('button', { name: t.shapes.none }));
    expect(updateShape).toHaveBeenCalledWith('c1', { fill: 'transparent' });
  });
});
