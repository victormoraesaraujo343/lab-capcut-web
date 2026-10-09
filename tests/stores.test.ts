import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore, useTimelineStore, useUiStore } from '../src/stores';

describe('timelineStore', () => {
  beforeEach(() => {
    useTimelineStore.setState(useTimelineStore.getInitialState());
  });

  it('limita o zoom entre 10 e 2000', () => {
    useTimelineStore.getState().setZoom(5);
    expect(useTimelineStore.getState().zoom).toBe(10);
    useTimelineStore.getState().setZoom(5000);
    expect(useTimelineStore.getState().zoom).toBe(2000);
    useTimelineStore.getState().setZoom(300);
    expect(useTimelineStore.getState().zoom).toBe(300);
  });

  it('não deixa a rolagem ficar negativa', () => {
    useTimelineStore.getState().setScrollLeft(-40);
    expect(useTimelineStore.getState().scrollLeft).toBe(0);
  });
});

describe('playbackStore', () => {
  beforeEach(() => {
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
  });

  it('togglePlay alterna entre tocando e pausado', () => {
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    usePlaybackStore.getState().togglePlay();
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it('seek com valor negativo vai para 0', () => {
    usePlaybackStore.getState().seek(-500);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(0);
  });

  it('seek com máximo prende a posição no fim do projeto', () => {
    usePlaybackStore.getState().seek(9000, 4000);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(4000);
    usePlaybackStore.getState().seek(1500, 4000);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1500);
  });

  it('seek com máximo zero (projeto vazio) fica em 0', () => {
    usePlaybackStore.getState().seek(800, 0);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(0);
  });
});

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState());
  });

  it('toggleTheme alterna entre dark e light', () => {
    expect(useUiStore.getState().theme).toBe('dark');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('light');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('dark');
  });

  it('setPanelSize respeita os limites de cada painel', () => {
    useUiStore.getState().setPanelSize('mediaWidth', 100);
    expect(useUiStore.getState().panelSizes.mediaWidth).toBe(200);
    useUiStore.getState().setPanelSize('inspectorWidth', 900);
    expect(useUiStore.getState().panelSizes.inspectorWidth).toBe(600);
    useUiStore.getState().setPanelSize('timelineHeight', 100);
    expect(useUiStore.getState().panelSizes.timelineHeight).toBe(150);
    useUiStore.getState().setPanelSize('timelineHeight', 700);
    expect(useUiStore.getState().panelSizes.timelineHeight).toBe(600);
  });
});
