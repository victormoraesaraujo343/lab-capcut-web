import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import {
  addCaptions,
  addText,
  applyTextPreset,
  replaceCaptionText,
  setTextAnimation,
  updateText,
} from '@/stores/textCommands';
import { undo } from '@/engine/timeline/history';
import { createProject } from '@/engine/project/createProject';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { CAPTION_PRESET_ID, TEXT_PRESETS } from '@/engine/text/textPresets';
import { t } from '@/i18n/pt-BR';
import type { Project, Track } from '@/types';

/** Abre um projeto de teste e devolve-o. */
function openProject(): Project {
  const project = createProject('Texto');
  useProjectStore.setState({ project });
  return project;
}

/** Trilhas do projeto aberto. */
function tracksNow(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Clipe de texto pelo id, em qualquer trilha. */
function textClip(clipId: string) {
  return tracksNow().flatMap((track) => track.clips).find((clip) => clip.id === clipId);
}

describe('textCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('addText cria trilha de texto no topo, põe o texto no cursor e seleciona', () => {
    openProject();
    usePlaybackStore.setState({ currentTimeMs: 1200 });
    const id = addText();
    const top = tracksNow()[0];
    expect(top?.kind).toBe('text');
    expect(top?.clips.map((c) => c.id)).toEqual([id]);
    expect(textClip(id)?.startMs).toBe(1200);
    expect(textClip(id)?.text?.content).toBe(t.text.defaultContent);
    expect(textClip(id)?.text?.style).toEqual(defaultTextStyle());
    expect(useTimelineStore.getState().selectedClipIds).toEqual([id]);
  });

  it('addText reusa a primeira trilha de texto livre em vez de criar outra', () => {
    openProject();
    const first = addText({ atMs: 0 });
    const second = addText({ atMs: 5000 });
    const texts = tracksNow().filter((track) => track.kind === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0]?.clips.map((c) => c.id)).toEqual([first, second]);
  });

  it('addText não sobrescreve legenda ocupando o mesmo tempo: cria trilha de texto nova no topo', () => {
    openProject();
    addCaptions([
      { startMs: 0, endMs: 2000, text: 'legenda um' },
      { startMs: 2000, endMs: 4000, text: 'legenda dois' },
    ]);
    const captionTrackId = tracksNow()[0]?.id;
    const id = addText({ atMs: 1000, content: 'novo' });
    const texts = tracksNow().filter((track) => track.kind === 'text');
    expect(texts).toHaveLength(2);
    expect(tracksNow()[0]?.id).not.toBe(captionTrackId);
    expect(tracksNow()[0]?.clips.map((c) => c.id)).toEqual([id]);
    const captions = tracksNow().find((track) => track.id === captionTrackId);
    expect(captions?.clips.map((c) => c.text?.content)).toEqual(['legenda um', 'legenda dois']);
  });

  it('addText nunca usa a trilha de legendas, mesmo com o tempo livre nela', () => {
    openProject();
    addCaptions([{ startMs: 0, endMs: 2000, text: 'legenda' }]);
    const captionTrackId = tracksNow()[0]?.id;
    const id = addText({ atMs: 5000, content: 'depois' });
    const captions = tracksNow().find((track) => track.id === captionTrackId);
    expect(captions?.clips.map((c) => c.id)).not.toContain(id);
    expect(tracksNow().filter((track) => track.kind === 'text')).toHaveLength(2);
    expect(tracksNow()[0]?.clips.map((c) => c.id)).toEqual([id]);
  });

  it('addText aplica o predefinido e sua animação de entrada', () => {
    openProject();
    const preset = TEXT_PRESETS.find((p) => p.animationIn !== undefined);
    if (preset === undefined) throw new Error('predefinido com animação esperado');
    const id = addText({ presetId: preset.id, content: 'Olá' });
    expect(textClip(id)?.text?.content).toBe('Olá');
    expect(textClip(id)?.text?.animationIn).toEqual(preset.animationIn);
  });

  it('addText sem projeto aberto devolve string vazia', () => {
    expect(addText()).toBe('');
  });

  it('updateText seguidos viram 1 passo de histórico', () => {
    openProject();
    const id = addText();
    const afterAdd = tracksNow();
    const pastBefore = useTimelineStore.getState().history.past.length;
    updateText(id, { content: 'a' });
    updateText(id, { content: 'ab' });
    updateText(id, { style: { color: '#ff0000' } });
    expect(textClip(id)?.text?.content).toBe('ab');
    expect(textClip(id)?.text?.style.color).toBe('#ff0000');
    const history = useTimelineStore.getState().history;
    expect(history.past).toHaveLength(pastBefore + 1);
    const result = undo(history, tracksNow());
    if (result === null) throw new Error('undo esperado');
    expect(result.tracks).toEqual(afterAdd);
  });

  it('updateText em clipe que não é de texto não faz nada', () => {
    openProject();
    const before = useTimelineStore.getState().history.past.length;
    updateText('inexistente', { content: 'x' });
    expect(useTimelineStore.getState().history.past.length).toBe(before);
  });

  it('applyTextPreset troca o estilo e aplica a animação do predefinido', () => {
    openProject();
    const id = addText({ content: 'Oi' });
    applyTextPreset(id, CAPTION_PRESET_ID);
    const style = textClip(id)?.text?.style;
    expect(style?.color).toBe('#ffd400');
    expect(style?.fontFamily).toBe('Roboto');
    expect(textClip(id)?.text?.content).toBe('Oi');
  });

  it('setTextAnimation define, troca e remove a animação de cada slot', () => {
    openProject();
    const id = addText();
    setTextAnimation(id, 'in', { type: 'fadeIn', durationMs: 400 });
    setTextAnimation(id, 'out', { type: 'fadeOut', durationMs: 300 });
    setTextAnimation(id, 'loop', { type: 'pulse', durationMs: 900 });
    expect(textClip(id)?.text?.animationIn).toEqual({ type: 'fadeIn', durationMs: 400 });
    expect(textClip(id)?.text?.animationOut).toEqual({ type: 'fadeOut', durationMs: 300 });
    expect(textClip(id)?.text?.animationLoop).toEqual({ type: 'pulse', durationMs: 900 });
    setTextAnimation(id, 'in', null);
    expect(textClip(id)?.text?.animationIn).toBeUndefined();
    expect(textClip(id)?.text?.animationOut).toEqual({ type: 'fadeOut', durationMs: 300 });
  });

  it('addCaptions cria uma trilha no topo com um clipe por legenda, em um passo', () => {
    const project = openProject();
    const captions = [
      { startMs: 0, endMs: 1000, text: 'um' },
      { startMs: 1000, endMs: 2500, text: 'dois' },
      { startMs: 3000, endMs: 4000, text: 'três' },
    ];
    const ids = addCaptions(captions);
    expect(ids).toHaveLength(3);
    const track = tracksNow()[0];
    expect(track?.kind).toBe('text');
    expect(track?.name).toBe(t.captions.trackName);
    expect(track?.clips.map((c) => c.text?.content)).toEqual(['um', 'dois', 'três']);
    expect(track?.clips.map((c) => c.durationMs)).toEqual([1000, 1500, 1000]);
    const style = track?.clips[0]?.text?.style;
    if (style === undefined) throw new Error('estilo de legenda esperado');
    // 35% abaixo do centro, menos metade da altura de 2 linhas (2 × fonte 65 × entrelinha).
    const y = project.height * 0.35 - 65 * style.lineHeight;
    expect(track?.clips.every((c) => c.transform.y === y)).toBe(true);
    expect(track?.clips[0]?.text?.style.color).toBe('#ffd400');
    expect(useTimelineStore.getState().history.past).toHaveLength(1);
  });

  it('addCaptions em 1080x1920 usa fonte 65, largura máxima 972 e trilha com role captions', () => {
    const base = createProject('Vertical');
    useProjectStore.setState({ project: { ...base, width: 1080, height: 1920, aspectRatio: '9:16' } });
    addCaptions([{ startMs: 0, endMs: 1000, text: 'vertical' }]);
    const track = tracksNow()[0];
    expect(track?.role).toBe('captions');
    const clip = track?.clips[0];
    expect(clip?.text?.style.fontSize).toBe(65);
    expect(clip?.text?.maxWidth).toBe(972);
  });

  it('addText define largura máxima de 90% da largura do projeto', () => {
    openProject();
    const id = addText({ content: 'longo texto' });
    expect(textClip(id)?.text?.maxWidth).toBe(1728);
  });

  it('renomear a trilha de legendas não faz addText cair nela', () => {
    openProject();
    addCaptions([{ startMs: 0, endMs: 2000, text: 'legenda' }]);
    const captionTrackId = tracksNow()[0]?.id;
    const current = useProjectStore.getState().project;
    if (current === null) throw new Error('projeto esperado');
    const renamed = current.tracks.map((track) =>
      track.id === captionTrackId ? { ...track, name: 'Renomeada' } : track,
    );
    useProjectStore.setState({ project: { ...current, tracks: renamed } });
    const id = addText({ atMs: 5000, content: 'depois' });
    const captions = tracksNow().find((track) => track.id === captionTrackId);
    expect(captions?.clips.map((c) => c.id)).not.toContain(id);
    expect(tracksNow().filter((track) => track.kind === 'text')).toHaveLength(2);
  });

  it('addCaptions com lista vazia não mexe no projeto', () => {
    openProject();
    expect(addCaptions([])).toEqual([]);
    expect(tracksNow()).toHaveLength(2);
  });

  it('undo depois de addCaptions remove a trilha e todas as legendas', () => {
    openProject();
    const before = tracksNow();
    addCaptions([
      { startMs: 0, endMs: 500, text: 'a' },
      { startMs: 500, endMs: 900, text: 'b' },
    ]);
    const result = undo(useTimelineStore.getState().history, tracksNow());
    if (result === null) throw new Error('undo esperado');
    expect(result.tracks).toEqual(before);
  });

  it('replaceCaptionText troca só o texto da legenda', () => {
    openProject();
    const [id] = addCaptions([{ startMs: 0, endMs: 1000, text: 'velho' }]);
    if (id === undefined) throw new Error('id esperado');
    replaceCaptionText(id, 'novo');
    expect(textClip(id)?.text?.content).toBe('novo');
    expect(textClip(id)?.durationMs).toBe(1000);
  });
});
