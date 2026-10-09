import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import {
  addAssetToNewTrack,
  addAssetToTimeline,
  copySelected,
  deleteSelected,
  duplicateSelected,
  goToEdge,
  goToEnd,
  moveSelected,
  pasteAtPlayhead,
  selectClip,
  splitAtPlayhead,
  splitClipAtTime,
  toggleTrackFlag,
  trimClip,
} from '@/stores/timelineCommands';
import { createProject } from '@/engine/project/createProject';
import { type Asset, type AssetKind, type Clip, type Project, type Track } from '@/types';

/** Cria um asset de teste com a duração dada. */
function makeAsset(id: string, kind: AssetKind = 'video', durationMs = 1000): Asset {
  return {
    id,
    kind,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `projects/p/media/${id}.mp4`,
    sizeBytes: 10,
    durationMs,
    thumbnails: [],
    createdAt: 1,
  };
}

/** Abre um projeto de teste com os assets dados. */
function openProject(assets: Asset[]): Project {
  const base = createProject('Comandos');
  const project = { ...base, assets };
  useProjectStore.setState({ project });
  return project;
}

/** Trilhas do projeto aberto. */
function tracksNow(): Track[] {
  const project = useProjectStore.getState().project;
  if (project === null) throw new Error('nenhum projeto aberto');
  return project.tracks;
}

/** Trilha de vídeo do projeto aberto. */
function videoTrack(): Track {
  const track = tracksNow().find((t) => t.kind === 'video');
  if (track === undefined) throw new Error('sem trilha de vídeo');
  return track;
}

/** Clipe da trilha de vídeo que começa no instante dado. */
function clipAt(startMs: number): Clip {
  const clip = videoTrack().clips.find((c) => c.startMs === startMs);
  if (clip === undefined) throw new Error(`sem clipe em ${startMs}`);
  return clip;
}

/** Posiciona o cursor no instante dado. */
function placePlayhead(ms: number): void {
  usePlaybackStore.getState().seek(ms);
}

describe('timelineCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('sequência de edições pode ser desfeita passo a passo e refeita', () => {
    const project = openProject(['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => makeAsset(id)));
    const videoId = project.tracks[0]?.id ?? '';
    const timeline = () => useTimelineStore.getState();
    const snapshots: Track[][] = [];
    /** Guarda o estado antes de uma operação e a executa. */
    const step = (op: () => void): void => {
      snapshots.push(tracksNow());
      op();
    };

    for (const [index, id] of ['a1', 'a2', 'a3', 'a4', 'a5'].entries()) {
      step(() => addAssetToTimeline(id, videoId, index * 1000, 'overwrite'));
    }
    expect(videoTrack().clips).toHaveLength(5);

    step(() => {
      timeline().clearSelection();
      placePlayhead(2500);
      splitAtPlayhead();
    });
    expect(videoTrack().clips).toHaveLength(6);

    step(() => {
      timeline().selectClips([clipAt(0).id]);
      moveSelected(300, 0, 'overwrite');
    });

    step(() => {
      timeline().selectClips([clipAt(2000).id]);
      deleteSelected(true);
    });

    step(() => {
      const last = videoTrack().clips.reduce((a, b) => (b.startMs > a.startMs ? b : a));
      timeline().selectClips([last.id]);
      duplicateSelected();
    });

    step(() => {
      copySelected();
      placePlayhead(9000);
      pasteAtPlayhead();
    });

    const finalTracks = tracksNow();
    expect(useTimelineStore.getState().history.past).toHaveLength(snapshots.length);

    for (let i = snapshots.length - 1; i >= 0; i -= 1) {
      timeline().undo();
      expect(tracksNow()).toEqual(snapshots[i]);
    }
    expect(tracksNow()).toEqual(project.tracks);
    expect(timeline().history.past).toHaveLength(0);

    for (let i = 0; i < snapshots.length; i += 1) {
      timeline().redo();
      expect(tracksNow()).toEqual(snapshots[i + 1] ?? finalTracks);
    }
    expect(tracksNow()).toEqual(finalTracks);
  });

  it('splitClipAtTime divide só o clipe dado', () => {
    const project = openProject([makeAsset('a1')]);
    addAssetToTimeline('a1', project.tracks[0]?.id ?? null, 0, 'overwrite');
    splitClipAtTime(clipAt(0).id, 400);
    expect(videoTrack().clips.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 400],
      [400, 600],
    ]);
  });

  it('edição em trilha travada não muda nada nem entra no histórico', () => {
    const project = openProject([makeAsset('a1')]);
    const videoId = project.tracks[0]?.id ?? '';
    addAssetToTimeline('a1', videoId, 0, 'overwrite');
    toggleTrackFlag(videoId, 'locked');
    const pastBefore = useTimelineStore.getState().history.past.length;
    const before = tracksNow();

    useTimelineStore.getState().selectClips([clipAt(0).id]);
    moveSelected(500, 0, 'overwrite');
    trimClip(clipAt(0).id, 'end', 800);
    addAssetToTimeline('a1', videoId, 2000, 'overwrite');

    expect(tracksNow()).toEqual(before);
    expect(useTimelineStore.getState().history.past).toHaveLength(pastBefore);
  });

  it('addAssetToTimeline com trackId null usa a primeira trilha livre; com kind errado cria trilha nova', () => {
    openProject([makeAsset('v1'), makeAsset('s1', 'audio', 2000)]);
    addAssetToTimeline('v1', null, 0, 'overwrite');
    expect(tracksNow()).toHaveLength(2);
    expect(videoTrack().clips).toHaveLength(1);

    addAssetToTimeline('s1', videoTrack().id, 0, 'overwrite');
    const audio = tracksNow().filter((t) => t.kind === 'audio');
    expect(tracksNow()).toHaveLength(3);
    expect(audio[1]?.clips[0]?.assetId).toBe('s1');
    expect(useTimelineStore.getState().selectedClipIds).toEqual([audio[1]?.clips[0]?.id]);
  });

  it('addAssetToNewTrack põe vídeo numa trilha nova no topo e áudio numa trilha nova no fim, já selecionada', () => {
    openProject([makeAsset('v1'), makeAsset('s1', 'audio', 2000)]);
    addAssetToNewTrack('v1', 500);
    expect(tracksNow().map((t) => t.name)).toEqual(['Vídeo 2', 'Vídeo 1', 'Áudio 1']);
    const top = tracksNow()[0];
    expect(top?.clips.map((c) => c.startMs)).toEqual([500]);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([top?.clips[0]?.id]);

    addAssetToNewTrack('s1', 0);
    expect(tracksNow().map((t) => t.name)).toEqual(['Vídeo 2', 'Vídeo 1', 'Áudio 1', 'Áudio 2']);
    expect(tracksNow()[3]?.clips[0]?.assetId).toBe('s1');
  });

  it('addAssetToNewTrack ignora asset inexistente', () => {
    openProject([makeAsset('a1')]);
    addAssetToNewTrack('nao-existe', 0);
    expect(tracksNow()).toHaveLength(2);
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
  });

  it('addAssetToTimeline ignora asset inexistente', () => {
    openProject([makeAsset('a1')]);
    addAssetToTimeline('nao-existe', null, 0, 'overwrite');
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
  });

  it('selectClip sem aditivo substitui e com aditivo soma', () => {
    openProject([makeAsset('a1')]);
    addAssetToTimeline('a1', null, 0, 'overwrite');
    addAssetToTimeline('a1', null, 2000, 'overwrite');
    selectClip(clipAt(0).id, false);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([clipAt(0).id]);
    selectClip(clipAt(2000).id, true);
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(2);
  });

  it('trimClip respeita a duração do asset', () => {
    openProject([makeAsset('a1', 'video', 1000)]);
    addAssetToTimeline('a1', null, 0, 'overwrite');
    trimClip(clipAt(0).id, 'end', 5000);
    expect(clipAt(0).durationMs).toBe(1000);
    trimClip(clipAt(0).id, 'end', 600);
    expect(clipAt(0).durationMs).toBe(600);
  });

  it('goToEdge e goToEnd movem o cursor', () => {
    openProject([makeAsset('a1')]);
    addAssetToTimeline('a1', null, 1000, 'overwrite');
    placePlayhead(0);
    goToEdge('next');
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
    goToEdge('next');
    expect(usePlaybackStore.getState().currentTimeMs).toBe(2000);
    goToEnd();
    expect(usePlaybackStore.getState().currentTimeMs).toBe(2000);
    goToEdge('prev');
    expect(usePlaybackStore.getState().currentTimeMs).toBe(1000);
  });
});
