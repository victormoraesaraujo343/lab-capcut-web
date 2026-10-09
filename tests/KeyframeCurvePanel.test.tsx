// Testes do painel de curva: mostra só com keyframes e troca o easing do keyframe do cursor, com a store real.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KeyframeCurvePanel } from '@/features/inspector/KeyframeCurvePanel';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project } from '@/types';

/** Clipe de teste começando em 1000 ms, com 2000 ms de duração e keyframes de x em 0 ms e 500 ms. */
function makeClip(keyframes: Clip['keyframes']): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 1000,
    durationMs: 2000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes,
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
  };
}

/** Abre um projeto com uma trilha de vídeo contendo o clipe de teste. */
function openClip(keyframes: Clip['keyframes']): void {
  const base: Project = createProject('Curva');
  const tracks = base.tracks.map((track, index) =>
    index === 0 ? { ...track, id: 't1', kind: 'video' as const, clips: [makeClip(keyframes)] } : track,
  );
  useProjectStore.setState({ project: { ...base, tracks } });
}

/** Clipe de teste lido da store. */
function clipNow(): Clip {
  const clip = useProjectStore.getState().project?.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1');
  if (!clip) throw new Error('clipe esperado');
  return clip;
}

describe('KeyframeCurvePanel', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState({ project: null });
    vi.clearAllMocks();
  });

  it('sem keyframes na propriedade, não mostra nada', () => {
    openClip({});
    const { container } = render(<KeyframeCurvePanel clipId="c1" property="x" label="Posição X" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('troca o easing do keyframe do cursor pelo botão escolhido', () => {
    openClip({
      x: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: 500, value: 100, easing: 'linear' },
      ],
    });
    usePlaybackStore.getState().seek(1500);
    render(<KeyframeCurvePanel clipId="c1" property="x" label="Posição X" />);

    fireEvent.click(screen.getByRole('button', { name: 'Desacelerar' }));

    expect(clipNow().keyframes['x']).toEqual([
      { timeMs: 0, value: 0, easing: 'linear' },
      { timeMs: 500, value: 100, easing: 'easeOut' },
    ]);
  });

  it('sem keyframe no cursor, os botões de easing ficam desabilitados', () => {
    openClip({ x: [{ timeMs: 0, value: 0, easing: 'linear' }] });
    usePlaybackStore.getState().seek(1800);
    render(<KeyframeCurvePanel clipId="c1" property="x" label="Posição X" />);

    expect(screen.getByRole('button', { name: 'Suave' })).toBeDisabled();
  });
});
