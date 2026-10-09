import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSpeechAudio } from '@/engine/captions/speechAudio';
import { transcribe } from '@/engine/captions/transcribeClient';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { createTextClip } from '@/engine/timeline/clipFactory';
import { createTrack } from '@/engine/project/createProject';
import { CaptionsTab } from '@/features/library/CaptionsTab';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { addCaptions, replaceCaptionText } from '@/stores/textCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip, Project, Track } from '@/types/project';
import { formatDuration } from '@/utils/time';

vi.mock('@/engine/captions/speechAudio', () => ({
  prepareSpeechAudio: vi.fn(() => Promise.resolve<Float32Array | null>(new Float32Array(4))),
}));

vi.mock('@/engine/captions/transcribeClient', () => ({
  transcribe: vi.fn(),
}));

vi.mock('@/stores/textCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/textCommands')>();
  return {
    ...actual,
    addCaptions: vi.fn(() => ['clip-1']),
    replaceCaptionText: vi.fn(),
  };
});

const initialProjectState = useProjectStore.getState();
const initialTimelineState = useTimelineStore.getState();
const initialPlaybackState = usePlaybackStore.getState();

/** Projeto com as trilhas dadas. */
function makeProject(tracks: Track[]): Project {
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks,
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Trilha de vídeo com um clipe de 6 s, para o projeto ter duração. */
function baseTracks(): Track[] {
  const video = createTrack('video', 'Vídeo');
  return [{ ...video, clips: [createTextClip(video.id, 0, 'base', defaultTextStyle(), 6000)] }];
}

/** Gera legendas de um trecho com o botão, sem esperar a fala real. */
function clickGenerate() {
  fireEvent.click(screen.getByRole('button', { name: t.captions.generate }));
}

describe('CaptionsTab', () => {
  beforeEach(() => {
    vi.mocked(transcribe).mockImplementation(() => ({
      cancel: vi.fn(),
      result: Promise.resolve([{ text: 'Olá', startMs: 500, endMs: 1500 }]),
    }));
    vi.mocked(prepareSpeechAudio).mockImplementation(() => Promise.resolve(new Float32Array(4)));
    useProjectStore.setState({ ...initialProjectState, project: makeProject(baseTracks()) });
    useTimelineStore.setState({ ...initialTimelineState, selectedClipIds: [] });
    usePlaybackStore.setState({ ...initialPlaybackState, currentTimeMs: 0 });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialProjectState);
    useTimelineStore.setState(initialTimelineState);
    usePlaybackStore.setState(initialPlaybackState);
    vi.clearAllMocks();
  });

  it('gera as legendas do projeto inteiro sem deslocamento', async () => {
    render(<CaptionsTab />);
    clickGenerate();

    expect(await screen.findByText(t.captions.done)).toBeInTheDocument();
    expect(prepareSpeechAudio).toHaveBeenCalledWith(
      expect.anything(),
      { startMs: 0, endMs: 6000 },
      expect.any(AbortSignal),
    );
    expect(addCaptions).toHaveBeenCalledWith([{ startMs: 500, endMs: 1500, text: 'Olá' }]);
  });

  it('gera só o clipe selecionado e soma o início do intervalo aos tempos', async () => {
    const video = createTrack('video', 'Vídeo');
    const clip: Clip = createTextClip(video.id, 2000, 'base', defaultTextStyle(), 3000);
    useProjectStore.setState({ project: makeProject([{ ...video, clips: [clip] }]) });
    useTimelineStore.setState({ selectedClipIds: [clip.id] });
    render(<CaptionsTab />);

    fireEvent.change(screen.getByLabelText(t.captions.source), { target: { value: 'selected' } });
    clickGenerate();

    expect(await screen.findByText(t.captions.done)).toBeInTheDocument();
    expect(prepareSpeechAudio).toHaveBeenCalledWith(
      expect.anything(),
      { startMs: 2000, endMs: 5000 },
      expect.any(AbortSignal),
    );
    expect(addCaptions).toHaveBeenCalledWith([{ startMs: 2500, endMs: 3500, text: 'Olá' }]);
  });

  it('desabilita a origem do clipe selecionado sem seleção', () => {
    render(<CaptionsTab />);

    expect(screen.getByRole('option', { name: t.captions.sourceSelected })).toBeDisabled();
    expect(screen.getByText(t.library.selectClipHint)).toBeInTheDocument();
  });

  it('avisa quando não há fala no áudio', async () => {
    vi.mocked(prepareSpeechAudio).mockImplementationOnce(() => Promise.resolve(null));
    render(<CaptionsTab />);
    clickGenerate();

    expect(await screen.findByText(t.captions.noSpeech)).toBeInTheDocument();
    expect(addCaptions).not.toHaveBeenCalled();
  });

  it('mostra o erro em alerta quando a transcrição falha', async () => {
    vi.mocked(transcribe).mockImplementationOnce(() => ({
      cancel: vi.fn(),
      result: Promise.reject(new Error('falha')),
    }));
    render(<CaptionsTab />);
    clickGenerate();

    expect(await screen.findByRole('alert')).toHaveTextContent(t.captions.error);
  });

  it('cancela a transcrição em andamento', async () => {
    const cancel = vi.fn();
    vi.mocked(transcribe).mockImplementationOnce(() => ({ cancel, result: new Promise(() => undefined) }));
    render(<CaptionsTab />);
    clickGenerate();

    fireEvent.click(await screen.findByRole('button', { name: t.captions.cancel }));

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: t.captions.generate })).toBeEnabled();
  });

  it('lista as legendas existentes e troca o texto de uma delas', () => {
    const captionTrack: Track = { ...createTrack('text', t.captions.trackName), role: 'captions' };
    const first = createTextClip(captionTrack.id, 0, 'um', defaultTextStyle(), 1000);
    const second = createTextClip(captionTrack.id, 2000, 'dois', defaultTextStyle(), 1000);
    useProjectStore.setState({ project: makeProject([{ ...captionTrack, clips: [first, second] }]) });
    render(<CaptionsTab />);

    fireEvent.change(screen.getByDisplayValue('um'), { target: { value: 'um editado' } });

    expect(replaceCaptionText).toHaveBeenCalledWith(first.id, 'um editado');
  });

  it('trilha de texto sem role de legenda não aparece na lista, mesmo com o nome Legendas', () => {
    const named: Track = { ...createTrack('text', t.captions.trackName) };
    const clip = createTextClip(named.id, 0, 'solto', defaultTextStyle(), 1000);
    useProjectStore.setState({ project: makeProject([{ ...named, clips: [clip] }]) });
    render(<CaptionsTab />);

    expect(screen.getByText(t.library.noCaptions)).toBeInTheDocument();
  });

  it('clicar no tempo leva o cursor à legenda e a seleciona', () => {
    const captionTrack: Track = { ...createTrack('text', t.captions.trackName), role: 'captions' };
    const second = createTextClip(captionTrack.id, 2000, 'dois', defaultTextStyle(), 1000);
    useProjectStore.setState({ project: makeProject([{ ...captionTrack, clips: [second] }]) });
    render(<CaptionsTab />);

    fireEvent.click(screen.getByRole('button', { name: formatDuration(2000) }));

    expect(usePlaybackStore.getState().currentTimeMs).toBe(2000);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([second.id]);
  });
});
