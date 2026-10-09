// Testes do editor de curva de velocidade: arrastar, duplo clique e teclado chamam setSpeedCurve com a curva certa.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SpeedCurveEditor } from '@/features/inspector/SpeedCurveEditor';
import { setSpeedCurve } from '@/stores/speedCommands';
import { t } from '@/i18n/pt-BR';
import type { SpeedCurvePoint } from '@/types';

vi.mock('@/stores/speedCommands', () => ({
  setSpeedCurve: vi.fn(),
}));

const setSpeedCurveMock = vi.mocked(setSpeedCurve);

/** Curva de teste: 1x no início e no fim, 1x no meio (três pontos). */
const CURVE: SpeedCurvePoint[] = [
  { t: 0, speed: 1 },
  { t: 0.5, speed: 1 },
  { t: 1, speed: 1 },
];

/** Renderiza o editor com a curva de teste e devolve o gráfico e os pontos. */
function renderEditor(curve: SpeedCurvePoint[] = CURVE) {
  const view = render(<SpeedCurveEditor clipId="clip-1" curve={curve} />);
  const svg = view.container.querySelector('svg');
  if (svg === null) throw new Error('sem svg');
  const points = screen.getAllByRole('slider', { name: t.inspector.curvePoint });
  return { svg, points };
}

beforeAll(() => {
  // jsdom não implementa captura de ponteiro; o editor só precisa que a chamada não falhe.
  Element.prototype.setPointerCapture = vi.fn();
});

beforeEach(() => {
  setSpeedCurveMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('SpeedCurveEditor', () => {
  it('desenha um ponto arrastável por ponto da curva', () => {
    const { points } = renderEditor();
    expect(points).toHaveLength(3);
  });

  it('arrastar um ponto e soltar chama setSpeedCurve uma vez com a curva nova, reordenada', () => {
    const { svg, points } = renderEditor();
    const last = points[2];
    if (last === undefined) throw new Error('sem ponto');

    fireEvent.pointerDown(last, { clientX: 270, clientY: 70, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 70, pointerId: 1 });
    expect(setSpeedCurveMock).not.toHaveBeenCalled();
    fireEvent.pointerUp(svg, { clientX: 60, clientY: 70, pointerId: 1 });

    expect(setSpeedCurveMock).toHaveBeenCalledTimes(1);
    const [clipId, curve] = setSpeedCurveMock.mock.calls[0] ?? [];
    expect(clipId).toBe('clip-1');
    expect(curve?.[1]?.t).toBeCloseTo(50 / 260, 3);
    expect(curve?.map((p) => p.t)).toEqual([0, 50 / 260, 0.5]);
  });

  it('soltar sem mover não grava nada', () => {
    const { svg, points } = renderEditor();
    const first = points[0];
    if (first === undefined) throw new Error('sem ponto');

    fireEvent.pointerDown(first, { clientX: 10, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 10, clientY: 70, pointerId: 1 });

    expect(setSpeedCurveMock).not.toHaveBeenCalled();
  });

  it('duplo clique no fundo do gráfico adiciona um ponto', () => {
    const { svg } = renderEditor();

    fireEvent.doubleClick(svg, { clientX: 140, clientY: 40 });

    expect(setSpeedCurveMock).toHaveBeenCalledTimes(1);
    const curve = setSpeedCurveMock.mock.calls[0]?.[1] ?? [];
    expect(curve).toHaveLength(4);
  });

  it('duplo clique num ponto remove o ponto', () => {
    const { points } = renderEditor();
    const middle = points[1];
    if (middle === undefined) throw new Error('sem ponto');

    fireEvent.doubleClick(middle);

    expect(setSpeedCurveMock).toHaveBeenCalledTimes(1);
    expect(setSpeedCurveMock.mock.calls[0]?.[1]).toHaveLength(2);
  });

  it('não remove o ponto quando a curva tem só dois', () => {
    const { points } = renderEditor([
      { t: 0, speed: 1 },
      { t: 1, speed: 2 },
    ]);
    const first = points[0];
    if (first === undefined) throw new Error('sem ponto');

    fireEvent.doubleClick(first);

    expect(setSpeedCurveMock).not.toHaveBeenCalled();
  });

  it('seta para cima acelera o ponto focado e grava a curva', () => {
    const { points } = renderEditor();
    const middle = points[1];
    if (middle === undefined) throw new Error('sem ponto');

    fireEvent.keyDown(middle, { key: 'ArrowUp' });

    expect(setSpeedCurveMock).toHaveBeenCalledTimes(1);
    const curve = setSpeedCurveMock.mock.calls[0]?.[1] ?? [];
    expect(curve[1]?.speed).toBeCloseTo(1.05, 6);
  });

  it('Delete remove o ponto focado', () => {
    const { points } = renderEditor();
    const last = points[2];
    if (last === undefined) throw new Error('sem ponto');

    fireEvent.keyDown(last, { key: 'Delete' });

    expect(setSpeedCurveMock).toHaveBeenCalledTimes(1);
    expect(setSpeedCurveMock.mock.calls[0]?.[1]).toHaveLength(2);
  });
});
