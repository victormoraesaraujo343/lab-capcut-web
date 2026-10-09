import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VoiceEffectSection } from '@/features/inspector/VoiceEffectSection';
import { defaultVoiceParams } from '@/engine/audio/voiceEffects';
import { createProject } from '@/engine/project/createProject';
import { createClipFromAsset } from '@/engine/timeline/clipFactory';
import { t } from '@/i18n/pt-BR';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Clip, Project } from '@/types';

/** Áudio de teste de 5 s. */
const AUDIO: Asset = {
  id: 'audio-1',
  kind: 'audio',
  name: 'voz.webm',
  mimeType: 'audio/webm',
  opfsPath: 'media/voz.webm',
  sizeBytes: 1000,
  durationMs: 5000,
  thumbnails: [],
  createdAt: 0,
};

/** Projeto com um clipe de áudio na trilha 'audio-track'; `effect` opcional já aplicado ao clipe. */
function buildProject(withEchoEffect: boolean): { project: Project; clip: Clip } {
  const base = createProject('Teste');
  const created = createClipFromAsset(AUDIO, 'audio-track', 0);
  const clip: Clip = withEchoEffect
    ? {
        ...created,
        audio: {
          ...created.audio,
          voiceEffect: { id: 'fx-1', type: 'echo', params: { delayMs: 250, feedback: 0.35, mix: 0.4 } },
        },
      }
    : created;
  const tracks = [
    { id: 'audio-track', kind: 'audio' as const, name: 'Áudio', clips: [clip], muted: false, locked: false, hidden: false },
  ];
  return { project: { ...base, tracks, assets: [AUDIO] }, clip };
}

/** Clipe atual no projeto da store. */
function storedClip(clipId: string): Clip | undefined {
  return useProjectStore
    .getState()
    .project?.tracks.flatMap((track) => track.clips)
    .find((clip) => clip.id === clipId);
}

beforeEach(() => {
  const { project } = buildProject(false);
  useProjectStore.setState({ project });
  useTimelineStore.getState().resetHistory();
});

afterEach(() => {
  cleanup();
  cancelPendingSave();
  useProjectStore.setState({ project: null });
  useTimelineStore.getState().resetHistory();
});

describe('VoiceEffectSection', () => {
  it('trocar o tipo grava os parâmetros padrão do tipo escolhido', () => {
    const { project, clip } = buildProject(false);
    useProjectStore.setState({ project });
    render(<VoiceEffectSection clip={clip} />);

    fireEvent.change(screen.getByRole('combobox', { name: t.audioTools.voiceEffect }), {
      target: { value: 'robot' },
    });

    const saved = storedClip(clip.id)?.audio.voiceEffect;
    expect(saved?.type).toBe('robot');
    expect(saved?.params).toEqual(defaultVoiceParams('robot'));
  });

  it('escolher nenhum tira o efeito de voz', () => {
    const { project, clip } = buildProject(true);
    useProjectStore.setState({ project });
    render(<VoiceEffectSection clip={clip} />);

    fireEvent.change(screen.getByRole('combobox', { name: t.audioTools.voiceEffect }), { target: { value: '' } });

    expect(storedClip(clip.id)?.audio.voiceEffect).toBeUndefined();
  });

  it('mudar um parâmetro grava o novo valor e mantém os outros', () => {
    const { project, clip } = buildProject(true);
    useProjectStore.setState({ project });
    render(<VoiceEffectSection clip={clip} />);

    const delay = screen.getByRole('spinbutton', { name: t.audioTools.voiceParams.delayMs });
    fireEvent.change(delay, { target: { value: '400' } });
    fireEvent.keyDown(delay, { key: 'Enter' });

    const saved = storedClip(clip.id)?.audio.voiceEffect;
    expect(saved?.params).toEqual({ delayMs: 400, feedback: 0.35, mix: 0.4 });
  });

  it('limita o valor do parâmetro ao intervalo do efeito', () => {
    const { project, clip } = buildProject(true);
    useProjectStore.setState({ project });
    render(<VoiceEffectSection clip={clip} />);

    const mix = screen.getByRole('spinbutton', { name: t.audioTools.voiceParams.mix });
    fireEvent.change(mix, { target: { value: '5' } });
    fireEvent.keyDown(mix, { key: 'Enter' });

    expect(storedClip(clip.id)?.audio.voiceEffect?.params.mix).toBe(1);
  });
});
