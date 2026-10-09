import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { PreviewControls } from '@/features/preview/PreviewControls';
import { PreviewPanel } from '@/features/preview/PreviewPanel';
import { startPlaybackController } from '@/features/preview/playbackController';
import { disposePreviewEngine } from '@/features/preview/previewEngine';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore, useProjectStore } from '@/stores';
import { createProject } from '@/engine/project/createProject';

vi.mock('@/features/preview/usePreviewRenderer', () => ({ usePreviewRenderer: () => ({ error: null }) }));
vi.mock('@/features/preview/playbackController', () => ({ startPlaybackController: vi.fn(() => () => undefined) }));
vi.mock('@/features/preview/previewEngine', () => ({ getPreviewEngine: vi.fn(), disposePreviewEngine: vi.fn() }));

const initialPlayback = usePlaybackStore.getState();

/** Monta a barra de controles com uma referência de tela cheia vazia. */
function renderControls(): void {
  render(<PreviewControls fullscreenTarget={createRef<HTMLDivElement>()} />);
}

/** Abre um projeto de teste com a duração dada. */
function openProject(durationMs: number): void {
  useProjectStore.setState({ project: { ...createProject('Teste'), durationMs } });
}

afterEach(() => {
  cleanup();
  usePlaybackStore.setState(initialPlayback, true);
  useProjectStore.setState({ project: null });
  vi.clearAllMocks();
});

describe('PreviewControls', () => {
  it('botão de reproduzir chama togglePlay e vira pausa quando está tocando', () => {
    const togglePlay = vi.fn();
    usePlaybackStore.setState({ togglePlay });
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: t.preview.play }));
    expect(togglePlay).toHaveBeenCalledTimes(1);
    cleanup();
    usePlaybackStore.setState({ isPlaying: true });
    renderControls();
    expect(screen.getByRole('button', { name: t.preview.pause })).toBeInTheDocument();
  });

  it('repetição alterna o estado do loop e o aria-pressed', () => {
    renderControls();
    const loop = screen.getByRole('button', { name: t.preview.loopOff });
    expect(loop).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(loop);
    expect(usePlaybackStore.getState().loop).toBe(true);
    expect(screen.getByRole('button', { name: t.preview.loopOn })).toHaveAttribute('aria-pressed', 'true');
  });

  it('trocar a qualidade chama setQuality com o valor escolhido', () => {
    const setQuality = vi.fn();
    usePlaybackStore.setState({ setQuality });
    renderControls();
    fireEvent.change(screen.getByRole('combobox', { name: t.preview.quality }), { target: { value: '1' } });
    expect(setQuality).toHaveBeenCalledWith(1);
  });

  it('ir ao fim leva a posição à duração do projeto', () => {
    openProject(4000);
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: t.preview.goToEnd }));
    expect(usePlaybackStore.getState().currentTimeMs).toBe(4000);
  });

  it('avançar quadro não passa da duração do projeto', () => {
    openProject(4000);
    usePlaybackStore.setState({ currentTimeMs: 3999 });
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: t.preview.frameForward }));
    fireEvent.click(screen.getByRole('button', { name: t.preview.frameForward }));
    expect(usePlaybackStore.getState().currentTimeMs).toBe(4000);
  });
});

describe('PreviewPanel: liberação do motor da prévia', () => {
  it('para o controlador e depois libera o motor ao desmontar', () => {
    const order: string[] = [];
    const stop = vi.fn(() => order.push('stop'));
    vi.mocked(startPlaybackController).mockReturnValue(stop);
    vi.mocked(disposePreviewEngine).mockImplementation(() => order.push('dispose'));
    const view = render(<PreviewPanel />);
    expect(startPlaybackController).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stop', 'dispose']);
  });
});
