import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InspectorPanel } from '@/features/inspector/InspectorPanel';
import { createProject } from '@/engine/project/createProject';
import { createClipFromAsset, createTextClip } from '@/engine/timeline/clipFactory';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { t } from '@/i18n/pt-BR';
import { applyTextPreset, updateText } from '@/stores/textCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Clip, Project, Track } from '@/types';

vi.mock('@/stores/textCommands', () => ({
  updateText: vi.fn(),
  applyTextPreset: vi.fn(),
  setTextAnimation: vi.fn(),
}));

const updateTextMock = vi.mocked(updateText);
const applyPresetMock = vi.mocked(applyTextPreset);

/** Mídia de vídeo de teste. */
const videoAsset: Asset = {
  id: 'asset-video',
  kind: 'video',
  name: 'video.mp4',
  mimeType: 'video/mp4',
  opfsPath: 'media/video.mp4',
  sizeBytes: 1000,
  durationMs: 5000,
  width: 1920,
  height: 1080,
  thumbnails: [],
  createdAt: 0,
};

/** Monta um projeto com uma trilha de vídeo (com clipe de vídeo) e uma de texto (com clipe de texto). */
function buildProject(): { project: Project; videoClip: Clip; textClip: Clip } {
  const base = createProject('Teste');
  const videoClip = createClipFromAsset(videoAsset, 'track-video', 0);
  const textClip = createTextClip('track-text', 0, 'Oi', defaultTextStyle());
  const tracks: Track[] = [
    { id: 'track-video', kind: 'video', name: 'Vídeo', clips: [videoClip], muted: false, locked: false, hidden: false },
    { id: 'track-text', kind: 'text', name: 'Texto', clips: [textClip], muted: false, locked: false, hidden: false },
  ];
  return { project: { ...base, tracks, assets: [videoAsset] }, videoClip, textClip };
}

/** Abre o projeto de teste e seleciona os clipes dados. */
function select(project: Project, ids: string[]): void {
  useProjectStore.setState({ project });
  useTimelineStore.setState({ selectedClipIds: ids });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  useTimelineStore.setState({ selectedClipIds: [] });
  useProjectStore.setState({ project: null });
  vi.clearAllMocks();
});

describe('InspectorPanel', () => {
  it('sem seleção mostra o texto de vazio', () => {
    const { project } = buildProject();
    select(project, []);

    render(<InspectorPanel />);

    expect(screen.getByText(t.inspector.empty)).toBeInTheDocument();
  });

  it('com seleção múltipla mostra o aviso de vários clipes', () => {
    const { project, videoClip, textClip } = buildProject();
    select(project, [videoClip.id, textClip.id]);

    render(<InspectorPanel />);

    expect(screen.getByText(t.inspector.multiple)).toBeInTheDocument();
  });

  it('clipe de texto mostra a área de texto e digitar chama updateText', () => {
    const { project, textClip } = buildProject();
    select(project, [textClip.id]);

    render(<InspectorPanel />);
    const textarea = screen.getByRole('textbox', { name: t.text.content });
    expect(textarea).toHaveValue('Oi');

    fireEvent.change(textarea, { target: { value: 'Olá' } });

    expect(updateTextMock).toHaveBeenCalledWith(textClip.id, { content: 'Olá' });
  });

  it('clicar num estilo pronto chama applyTextPreset', () => {
    const { project, textClip } = buildProject();
    select(project, [textClip.id]);

    render(<InspectorPanel />);
    fireEvent.click(screen.getByRole('button', { name: t.inspector.presets['classic-outline'] }));

    expect(applyPresetMock).toHaveBeenCalledWith(textClip.id, 'classic-outline');
  });

  it('clipe de vídeo mostra a transformação e o áudio', () => {
    const { project, videoClip } = buildProject();
    select(project, [videoClip.id]);

    render(<InspectorPanel />);

    expect(screen.getByRole('spinbutton', { name: t.inspector.x })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: t.inspector.rotation })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: t.inspector.volume })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: t.text.content })).not.toBeInTheDocument();
  });
});
