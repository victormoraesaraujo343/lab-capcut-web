// Testes das alças de fade: arrastar a alça de entrada ou de saída chama setFade com o valor em ms.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FadeHandles } from '@/features/timeline/FadeHandles';
import { setFade } from '@/stores/audioCommands';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip } from '@/types';

vi.mock('@/stores/audioCommands', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/audioCommands')>();
  return { ...original, setFade: vi.fn() };
});

/** Clipe de 4 s com fade de entrada de 300 ms e de saída de 500 ms. */
function makeClip(): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 'a1-track',
    startMs: 0,
    durationMs: 4000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: { ...defaultAudioFx(), fadeInMs: 300, fadeOutMs: 500 },
    reversed: false,
  };
}

describe('alças de fade', () => {
  beforeEach(() => {
    vi.mocked(setFade).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('arrastar a alça de entrada chama setFade com o novo valor e não propaga o clique', () => {
    const onParentDown = vi.fn();
    render(
      <div onPointerDown={onParentDown}>
        <FadeHandles clip={makeClip()} zoom={100} />
      </div>,
    );
    const handle = screen.getByRole('slider', { name: 'Fade de entrada' });

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 150, clientY: 10, pointerId: 1 });

    expect(onParentDown).not.toHaveBeenCalled();
    expect(setFade).toHaveBeenLastCalledWith('c1', 'in', 800);
  });

  it('arrastar a alça de saída para a esquerda aumenta o fade de saída', () => {
    render(<FadeHandles clip={makeClip()} zoom={100} />);
    const handle = screen.getByRole('slider', { name: 'Fade de saída' });

    fireEvent.pointerDown(handle, { button: 0, clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 280, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 280, clientY: 10, pointerId: 1 });

    expect(setFade).toHaveBeenLastCalledWith('c1', 'out', 700);
  });
});
