import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project } from '@/types';

/** Abre um projeto novo no store do projeto. */
function openProject(name = 'Teste'): Project {
  const project = createProject(name);
  useProjectStore.setState({ project });
  return project;
}

/** Devolve o projeto aberto, ou falha se nenhum estiver aberto. */
function current(): Project {
  const project = useProjectStore.getState().project;
  if (project === null) throw new Error('nenhum projeto aberto');
  return project;
}

/** Cria um clipe de vídeo simples na trilha dada. */
function makeClip(id: string, trackId: string, startMs: number): Clip {
  return {
    id,
    assetId: 'asset-1',
    trackId,
    startMs,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
  };
}

describe('timelineStore: histórico', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('edit sem mudança não cria histórico', () => {
    openProject();
    useTimelineStore.getState().edit('noop', (tracks) => tracks);
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
  });

  it('edit com mudança registra, pode ser desfeita e refeita', () => {
    const project = openProject();
    const before = current().tracks;
    useTimelineStore.getState().edit('mute', (tracks) =>
      tracks.map((t) => ({ ...t, muted: true })),
    );
    expect(useTimelineStore.getState().history.past).toHaveLength(1);
    expect(useTimelineStore.getState().history.past[0]?.label).toBe('mute');
    expect(current().tracks.every((t) => t.muted)).toBe(true);
    expect(current().id).toBe(project.id);

    useTimelineStore.getState().undo();
    expect(current().tracks).toEqual(before);
    expect(useTimelineStore.getState().history.future).toHaveLength(1);

    useTimelineStore.getState().redo();
    expect(current().tracks.every((t) => t.muted)).toBe(true);
  });

  it('edit sem projeto aberto não faz nada', () => {
    useTimelineStore.getState().edit('mute', (tracks) => tracks.map((t) => ({ ...t, muted: true })));
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('nova edição depois de desfazer limpa o futuro', () => {
    openProject();
    const store = useTimelineStore.getState();
    store.edit('a', (tracks) => tracks.map((t) => ({ ...t, muted: true })));
    store.undo();
    useTimelineStore.getState().edit('b', (tracks) => tracks.map((t) => ({ ...t, locked: true })));
    expect(useTimelineStore.getState().history.future).toHaveLength(0);
  });

  it('undo e redo sem histórico não mudam nada', () => {
    const project = openProject();
    useTimelineStore.getState().undo();
    useTimelineStore.getState().redo();
    expect(current().tracks).toEqual(project.tracks);
  });

  it('undo tira da seleção os clipes que deixaram de existir', () => {
    const project = openProject();
    const videoId = project.tracks[0]?.id ?? '';
    const clip = makeClip('c1', videoId, 0);
    useTimelineStore.getState().edit(
      'add',
      (tracks) => tracks.map((t) => (t.id === videoId ? { ...t, clips: [clip] } : t)),
      ['c1'],
    );
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['c1']);
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
  });

  it('trocar de projeto zera o histórico e a seleção', () => {
    openProject('A');
    useTimelineStore.getState().edit('mute', (tracks) => tracks.map((t) => ({ ...t, muted: true })));
    useTimelineStore.getState().selectClips(['x']);
    openProject('B');
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
  });

  it('trocar de projeto zera área de transferência e ferramenta, e para a reprodução no início', () => {
    openProject('A');
    useTimelineStore.getState().setClipboard({ items: [] });
    useTimelineStore.getState().setTool('blade');
    usePlaybackStore.getState().seek(500);
    usePlaybackStore.getState().play();
    openProject('B');
    expect(useTimelineStore.getState().clipboard).toBeNull();
    expect(useTimelineStore.getState().tool).toBe('select');
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(0);
  });

  it('resetHistory esvazia passado e futuro', () => {
    openProject();
    useTimelineStore.getState().edit('mute', (tracks) => tracks.map((t) => ({ ...t, muted: true })));
    useTimelineStore.getState().resetHistory();
    expect(useTimelineStore.getState().history).toEqual({ past: [], future: [] });
  });
});

describe('timelineStore: seleção, ferramenta e zoom', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('toggleClipSelection liga e desliga um clipe', () => {
    const store = useTimelineStore.getState();
    store.toggleClipSelection('a');
    store.toggleClipSelection('b');
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a', 'b']);
    useTimelineStore.getState().toggleClipSelection('a');
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['b']);
  });

  it('zoomBy multiplica o zoom dentro dos limites', () => {
    useTimelineStore.getState().zoomBy(2);
    expect(useTimelineStore.getState().zoom).toBe(200);
    useTimelineStore.getState().zoomBy(0.001);
    expect(useTimelineStore.getState().zoom).toBe(10);
  });

  it('setTool e setClipboard guardam os valores', () => {
    useTimelineStore.getState().setTool('blade');
    expect(useTimelineStore.getState().tool).toBe('blade');
    useTimelineStore.getState().setClipboard({ items: [] });
    expect(useTimelineStore.getState().clipboard).toEqual({ items: [] });
    useTimelineStore.getState().setClipboard(null);
    expect(useTimelineStore.getState().clipboard).toBeNull();
  });
});

describe('projectStore.setTracks e playbackStore.stepFrame', () => {
  beforeEach(() => {
    cancelPendingSave();
    useProjectStore.setState({ project: null });
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
  });

  it('setTracks troca as trilhas e recalcula a duração', () => {
    const project = openProject();
    const [video, ...rest] = project.tracks;
    if (video === undefined) throw new Error('projeto sem trilhas');
    useProjectStore.getState().setTracks([{ ...video, clips: [makeClip('c1', video.id, 500)] }, ...rest]);
    expect(current().durationMs).toBe(1500);
    expect(current().updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it('setTracks sem projeto não faz nada', () => {
    useProjectStore.getState().setTracks([]);
    expect(useProjectStore.getState().project).toBeNull();
  });

  it('stepFrame anda um quadro e não vai abaixo de zero', () => {
    usePlaybackStore.getState().seek(100);
    usePlaybackStore.getState().stepFrame(1, 25);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(140);
    usePlaybackStore.getState().stepFrame(-1, 25);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(100);
    for (let i = 0; i < 4; i += 1) usePlaybackStore.getState().stepFrame(-1, 25);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(0);
  });

  it('stepFrame para frente para no máximo informado', () => {
    usePlaybackStore.getState().seek(990);
    usePlaybackStore.getState().stepFrame(1, 25, 1000);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
    usePlaybackStore.getState().stepFrame(1, 25, 1000);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
  });

  it('stepFrame sem máximo segue andando além da duração', () => {
    usePlaybackStore.getState().seek(990);
    usePlaybackStore.getState().stepFrame(1, 25);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1030);
  });

  it('stepFrame com fps inválido não muda a posição', () => {
    usePlaybackStore.getState().seek(200);
    usePlaybackStore.getState().stepFrame(1, 0);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(200);
  });
});
