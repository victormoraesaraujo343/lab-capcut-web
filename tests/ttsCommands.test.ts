import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { addSpeech, previewSpeech, updateSpeech } from '@/stores/ttsCommands';
import { createProject } from '@/engine/project/createProject';
import { estimateSpeechMs } from '@/engine/tts/ttsDuration';
import type { Clip, Project, Track } from '@/types';

/** Abre um projeto de teste e devolve-o. */
function openProject(): Project {
  const project = createProject('Fala');
  useProjectStore.setState({ project });
  return project;
}

/** Trilhas do projeto aberto. */
function tracksNow(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Clipe pelo id, em qualquer trilha. */
function clipNow(clipId: string): Clip | undefined {
  return tracksNow().flatMap((track) => track.clips).find((clip) => clip.id === clipId);
}

/** Trilha que contém o clipe dado. */
function trackOf(clipId: string): Track | undefined {
  return tracksNow().find((track) => track.clips.some((clip) => clip.id === clipId));
}

describe('ttsCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('addSpeech cria clipe sem asset na trilha de áudio no cursor, com a duração estimada', () => {
    openProject();
    usePlaybackStore.setState({ currentTimeMs: 1500 });
    const text = 'Olá, este é um teste de fala.';
    const id = addSpeech(text, { voiceURI: 'voz-br', rate: 1.5, pitch: 1.2 });
    const clip = clipNow(id);
    expect(clip).toBeDefined();
    expect(clip?.assetId).toBeUndefined();
    expect(clip?.startMs).toBe(1500);
    expect(clip?.durationMs).toBe(estimateSpeechMs(text, 1.5));
    expect(clip?.tts).toEqual({ text, voiceURI: 'voz-br', rate: 1.5, pitch: 1.2 });
    expect(trackOf(id)?.kind).toBe('audio');
    expect(useTimelineStore.getState().selectedClipIds).toEqual([id]);
  });

  it('addSpeech usa uma trilha de áudio livre no intervalo e cria outra quando ocupada', () => {
    openProject();
    const first = addSpeech('Primeira fala bem comprida para ocupar espaço.', { atMs: 0 });
    const firstTrackId = trackOf(first)?.id;
    const sameSpot = addSpeech('Segunda fala no mesmo lugar.', { atMs: 100 });
    expect(trackOf(sameSpot)?.id).not.toBe(firstTrackId);
    const later = addSpeech('Terceira fala depois.', { atMs: 60_000 });
    expect(trackOf(later)?.id).toBe(firstTrackId);
  });

  it('addSpeech com texto vazio não faz nada', () => {
    openProject();
    expect(addSpeech('   ')).toBe('');
    expect(tracksNow().flatMap((track) => track.clips)).toHaveLength(0);
  });

  it('updateSpeech re-estima a duração quando o texto muda', () => {
    openProject();
    const id = addSpeech('Oi', { atMs: 0 });
    const longText = 'a'.repeat(56);
    updateSpeech(id, { text: longText });
    expect(clipNow(id)?.durationMs).toBe(4000);
    expect(clipNow(id)?.tts?.text).toBe(longText);
  });

  it('updateSpeech só troca o tom sem mudar a duração', () => {
    openProject();
    const id = addSpeech('a'.repeat(56), { atMs: 0 });
    const before = clipNow(id)?.durationMs;
    updateSpeech(id, { pitch: 0.5 });
    expect(clipNow(id)?.durationMs).toBe(before);
    expect(clipNow(id)?.tts?.pitch).toBe(0.5);
  });

  it('updateSpeech empurra os clipes seguintes quando a fala passa do próximo clipe', () => {
    openProject();
    const id = addSpeech('Oi', { atMs: 0 });
    const trackId = trackOf(id)?.id;
    const next = addSpeech('Depois', { atMs: 900 });
    expect(trackOf(next)?.id).toBe(trackId);
    updateSpeech(id, { text: 'a'.repeat(70) });
    const grown = clipNow(id);
    const newEnd = (grown?.startMs ?? 0) + (grown?.durationMs ?? 0);
    expect(newEnd).toBe(5000);
    expect(clipNow(next)?.startMs).toBe(newEnd);
  });

  it('updateSpeech é ignorado em clipe que não é de fala', () => {
    openProject();
    expect(() => updateSpeech('inexistente', { text: 'x' })).not.toThrow();
  });

  it('previewSpeech não falha sem speechSynthesis', () => {
    expect(() => previewSpeech('Teste', '', 1, 1)).not.toThrow();
  });
});
