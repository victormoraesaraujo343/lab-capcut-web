import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AudioTab } from '@/features/library/AudioTab';
import { createProject } from '@/engine/project/createProject';
import { t } from '@/i18n/pt-BR';
import { addSpeech } from '@/stores/ttsCommands';
import { addAssetToTimeline } from '@/stores/timelineCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import type { Asset, Project } from '@/types';

vi.mock('@/stores/ttsCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/ttsCommands')>();
  return { ...actual, addSpeech: vi.fn(() => 'speech-1') };
});

vi.mock('@/stores/timelineCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/timelineCommands')>();
  return { ...actual, addAssetToTimeline: vi.fn() };
});

/** Asset de áudio do projeto, sem papel. */
function audioAsset(id: string, name: string, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'audio',
    name,
    mimeType: 'audio/webm',
    opfsPath: `media/${id}.webm`,
    sizeBytes: 1000,
    durationMs: 4200,
    waveform: [0.2, 0.8, 0.5],
    thumbnails: [],
    createdAt: 0,
    ...extra,
  };
}

/** Projeto com um áudio comum, um áudio gerado (com papel) e um vídeo. */
function buildProject(): Project {
  return {
    ...createProject('Teste'),
    assets: [
      audioAsset('a-narracao', 'narracao.webm'),
      audioAsset('a-mascara', 'mascara.webm', { role: 'matte' }),
      audioAsset('v-clipe', 'clipe.mp4', { kind: 'video', mimeType: 'video/mp4' }),
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.setState({ project: buildProject() });
  usePlaybackStore.setState({ currentTimeMs: 0 });
});

afterEach(() => {
  cleanup();
  useProjectStore.setState({ project: null });
  usePlaybackStore.setState({ currentTimeMs: 0 });
});

describe('AudioTab', () => {
  it('lista só os áudios do projeto que não têm papel', () => {
    render(<AudioTab />);

    expect(screen.getByText('narracao.webm')).toBeInTheDocument();
    expect(screen.queryByText('mascara.webm')).not.toBeInTheDocument();
    expect(screen.queryByText('clipe.mp4')).not.toBeInTheDocument();
  });

  it('mostra o aviso de lista vazia quando não há áudios', () => {
    useProjectStore.setState({ project: { ...buildProject(), assets: [] } });

    render(<AudioTab />);

    expect(screen.getByText(t.library.audioEmpty)).toBeInTheDocument();
  });

  it('adicionar fala chama addSpeech com o texto e as opções da seção', () => {
    render(<AudioTab />);
    const add = screen.getByRole('button', { name: t.tts.addToTimeline });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: t.tts.placeholder }), { target: { value: 'Olá mundo' } });
    fireEvent.click(add);

    expect(addSpeech).toHaveBeenCalledTimes(1);
    expect(addSpeech).toHaveBeenCalledWith('Olá mundo', { voiceURI: '', rate: 1, pitch: 1 });
  });

  it('o botão + adiciona o áudio no cursor', () => {
    usePlaybackStore.setState({ currentTimeMs: 1500 });
    render(<AudioTab />);

    fireEvent.click(screen.getByRole('button', { name: t.library.audioAddAtCursor }));

    expect(addAssetToTimeline).toHaveBeenCalledWith('a-narracao', null, 1500, 'overwrite');
  });

  it('o áudio da lista é arrastável com o tipo de arrasto do painel de mídia', () => {
    render(<AudioTab />);
    const surface = screen.getByTitle('narracao.webm');
    const setData = vi.fn();

    fireEvent.dragStart(surface, { dataTransfer: { setData, types: [], effectAllowed: 'all' } });

    expect(setData).toHaveBeenCalledWith('application/x-capcut-asset', 'a-narracao');
  });
});
