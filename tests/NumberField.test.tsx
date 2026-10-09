import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NumberField } from '@/features/inspector/NumberField';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NumberField', () => {
  it('digitar um valor e apertar Enter confirma o valor final', () => {
    const onChange = vi.fn();
    render(<NumberField label="Escala" value={50} min={0} max={100} step={1} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Escala' });

    fireEvent.change(input, { target: { value: '70' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(70, true);
  });

  it('valor digitado fora do intervalo é limitado ao máximo', () => {
    const onChange = vi.fn();
    render(<NumberField label="Escala" value={50} min={0} max={100} step={1} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Escala' });

    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(100, true);
  });

  it('seta para cima soma um passo', () => {
    const onChange = vi.fn();
    render(<NumberField label="Escala" value={50} min={0} max={100} step={1} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Escala' }), { key: 'ArrowUp' });

    expect(onChange).toHaveBeenCalledWith(51, true);
  });

  it('Shift com seta soma dez passos', () => {
    const onChange = vi.fn();
    render(<NumberField label="Escala" value={50} min={0} max={100} step={1} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Escala' }), { key: 'ArrowUp', shiftKey: true });

    expect(onChange).toHaveBeenCalledWith(60, true);
  });

  it('seta para baixo respeita o passo decimal e o mínimo', () => {
    const onChange = vi.fn();
    render(<NumberField label="Altura" value={0.8} min={0.8} max={3} step={0.05} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Altura' }), { key: 'ArrowDown' });

    expect(onChange).toHaveBeenCalledWith(0.8, true);
  });

  it('mexer no slider manda valores parciais e o ao soltar manda o final', () => {
    const onChange = vi.fn();
    render(<NumberField label="Volume" value={10} min={0} max={200} step={1} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider, { target: { value: '40' } });
    fireEvent.pointerUp(slider);

    expect(onChange).toHaveBeenNthCalledWith(1, 40, false);
    expect(onChange).toHaveBeenNthCalledWith(2, 40, true);
  });

  it('sem keyframe, não mostra controle de keyframe', () => {
    render(<NumberField label="Escala" value={50} min={0} max={100} step={1} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Adicionar ponto-chave' })).toBeNull();
  });

  it('com keyframe no campo, o losango chama onToggle e mostra Adicionar quando não há ponto ali', () => {
    const onToggle = vi.fn();
    render(
      <NumberField
        label="Escala"
        value={50}
        min={0}
        max={100}
        step={1}
        onChange={vi.fn()}
        keyframe={{ active: false, animated: false, onToggle, onPrev: vi.fn(), onNext: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto-chave' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Ponto-chave anterior' })).toBeNull();
  });

  it('com ponto no cursor, o losango mostra Remover e aria-pressed verdadeiro', () => {
    render(
      <NumberField
        label="Escala"
        value={50}
        min={0}
        max={100}
        step={1}
        onChange={vi.fn()}
        keyframe={{ active: true, animated: true, onToggle: vi.fn(), onPrev: vi.fn(), onNext: vi.fn() }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Remover ponto-chave' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('campo animado mostra setas que chamam onPrev e onNext', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <NumberField
        label="Escala"
        value={50}
        min={0}
        max={100}
        step={1}
        onChange={vi.fn()}
        keyframe={{ active: false, animated: true, onToggle: vi.fn(), onPrev, onNext }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ponto-chave anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo ponto-chave' }));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
