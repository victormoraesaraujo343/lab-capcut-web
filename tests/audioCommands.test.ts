import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import {
  clampFadeMs,
  clipHasOwnSound,
  detachAudio,
  reattachAudio,
  setClipVolume,
  setFade,
  toggleClipMute,
} from '@/stores/audioCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { createProject } from '@/engine/project/createProject';
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Asset,
  type Clip,
  type Project,
  type Track,
} from '@/types';

/** Asset de vídeo com som, de 10 s. */
const VIDEO: Asset = {
  id: 'a1',
  kind: 'video',
  name: 'praia.mp4',
  mimeType: 'video/mp4',
  opfsPath: 'media/a1.mp4',
  sizeBytes: 1000,
  durationMs: 10000,
  width: 1920,
  height: 1080,
  fps: 30,
  waveform: [0.2, 0.9, 0.4],
  thumbnails: [],
  createdAt: 0,
};

/** Asset de vídeo sem nenhum som (forma de onda toda zero). */
const MUTE_VIDEO: Asset = { ...VIDEO, id: 'a2', name: 'mudo.mp4', waveform: [0, 0, 0] };

/** Clipe de teste: 4 s na timeline, com recorte, volume, fades e keyframes de volume. */
function makeClip(overrides: Partial<Clip> & { id: string }): Clip {
  return {
    assetId: 'a1',
    trackId: 'v1',
    startMs: 1000,
    durationMs: 4000,
    trimInMs: 500,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 0.8,
    keyframes: { volume: [{ timeMs: 0, value: 0.8, easing: 'linear' }] },
    filters: [],
    effects: [],
    audio: { ...defaultAudioFx(), fadeInMs: 300, fadeOutMs: 500 },
    reversed: false,
    ...overrides,
  };
}

/** Trilha de vídeo destravada com os clipes dados. */
function videoTrack(clips: Clip[]): Track {
  return { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false, clips };
}

/** Trilha de áudio destravada com os clipes dados. */
function audioTrack(id: string, clips: Clip[]): Track {
  return { id, kind: 'audio', name: id, muted: false, locked: false, hidden: false, clips };
}

/** Abre um projeto com as trilhas e os assets dados. */
function openProject(tracks: Track[], assets: Asset[] = [VIDEO, MUTE_VIDEO]): Project {
  const project: Project = { ...createProject('Áudio'), tracks, assets };
  useProjectStore.setState({ project });
  return project;
}

/** Clipes de todas as trilhas do projeto aberto. */
function allClips(): Clip[] {
  return (useProjectStore.getState().project?.tracks ?? []).flatMap((track) => track.clips);
}

/** Clipe pelo id no projeto aberto. */
function clipById(id: string): Clip {
  const clip = allClips().find((c) => c.id === id);
  if (clip === undefined) throw new Error(`clipe ${id} não encontrado`);
  return clip;
}

describe('comandos de áudio do clipe', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('separa o áudio criando um clipe de áudio igual, em trilha nova, e marca o vídeo', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);

    detachAudio('c1');

    const project = useProjectStore.getState().project;
    const audioTrackNew = project?.tracks.find((tr) => tr.kind === 'audio');
    expect(audioTrackNew).toBeDefined();
    const video = clipById('c1');
    expect(video.audioDetached).toBe(true);
    expect(video.groupId).toBeDefined();
    const audio = audioTrackNew?.clips[0];
    expect(audio).toBeDefined();
    expect(audio?.id).not.toBe('c1');
    expect(audio?.assetId).toBe('a1');
    expect(audio?.trackId).toBe(audioTrackNew?.id);
    expect(audio?.startMs).toBe(1000);
    expect(audio?.durationMs).toBe(4000);
    expect(audio?.trimInMs).toBe(500);
    expect(audio?.volume).toBe(0.8);
    expect(audio?.audio).toEqual({ fadeInMs: 300, fadeOutMs: 500, denoise: false });
    expect(audio?.keyframes).toEqual(video.keyframes);
    expect(audio?.groupId).toBe(video.groupId);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([audio?.id]);
  });

  it('usa uma trilha de áudio livre no intervalo, sem criar outra', () => {
    const busy = makeClip({ id: 'x', trackId: 'aud', startMs: 0, durationMs: 900 });
    openProject([videoTrack([makeClip({ id: 'c1' })]), audioTrack('aud', [busy])]);

    detachAudio('c1');

    const audioTracks = (useProjectStore.getState().project?.tracks ?? []).filter((tr) => tr.kind === 'audio');
    expect(audioTracks).toHaveLength(1);
    expect(audioTracks[0]?.clips.map((c) => c.id)).toEqual(['x', useTimelineStore.getState().selectedClipIds[0]]);
  });

  it('juntar o áudio de volta remove o clipe de áudio e desmarca o vídeo', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);
    detachAudio('c1');

    reattachAudio('c1');

    expect(clipById('c1').audioDetached).toBe(false);
    expect(allClips().filter((c) => c.id !== 'c1')).toHaveLength(0);
  });

  it('desfazer volta o vídeo ao estado anterior à separação', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);
    detachAudio('c1');

    useTimelineStore.getState().undo();

    const project = useProjectStore.getState().project;
    expect(project?.tracks).toHaveLength(1);
    expect(clipById('c1').audioDetached).toBeUndefined();
    expect(allClips()).toHaveLength(1);
  });

  it('não separa clipe de asset sem som, nem clipe já separado, nem clipe de áudio', () => {
    openProject([
      videoTrack([makeClip({ id: 'mudo', assetId: 'a2' })]),
      audioTrack('aud', [makeClip({ id: 'som', trackId: 'aud', assetId: 'a1' })]),
    ]);
    detachAudio('mudo');
    detachAudio('som');
    expect(useProjectStore.getState().project?.tracks).toHaveLength(2);
    expect(clipById('mudo').audioDetached).toBeUndefined();
  });

  it('limita o fade para não passar da duração menos o fade do outro lado', () => {
    const clip = makeClip({ id: 'c1' });
    expect(clampFadeMs(clip, 'in', 9000)).toBe(3500);
    expect(clampFadeMs(clip, 'out', -5)).toBe(0);

    openProject([videoTrack([clip])]);
    setFade('c1', 'out', 5000);
    expect(clipById('c1').audio.fadeOutMs).toBe(3700);
    setFade('c1', 'in', 9000);
    expect(clipById('c1').audio.fadeInMs).toBe(300);
  });

  it('arrastos de fade seguidos viram um passo só do histórico', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);
    useTimelineStore.getState().resetHistory();

    setFade('c1', 'in', 400);
    setFade('c1', 'in', 600);
    setFade('c1', 'in', 800);

    expect(useTimelineStore.getState().history.past).toHaveLength(1);
    expect(clipById('c1').audio.fadeInMs).toBe(800);
  });

  it('volume fica entre 0 e 2', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);
    setClipVolume('c1', 5);
    expect(clipById('c1').volume).toBe(2);
    setClipVolume('c1', -1);
    expect(clipById('c1').volume).toBe(0);
  });

  it('silenciar marca o clipe sem mexer no volume, e ativar tira a marca', () => {
    openProject([videoTrack([makeClip({ id: 'c1', volume: 1.5 })])]);

    toggleClipMute('c1');
    expect(clipById('c1')).toMatchObject({ volume: 1.5, audio: { muted: true } });
    toggleClipMute('c1');
    expect(clipById('c1')).toMatchObject({ volume: 1.5, audio: { muted: false } });
  });

  it('silenciar um clipe com keyframes de volume é um passo só do histórico e mantém os keyframes', () => {
    openProject([videoTrack([makeClip({ id: 'c1' })])]);
    useTimelineStore.getState().resetHistory();

    toggleClipMute('c1');

    expect(useTimelineStore.getState().history.past).toHaveLength(1);
    expect(clipById('c1').audio.muted).toBe(true);
    expect(clipById('c1').keyframes.volume).toHaveLength(1);
    useTimelineStore.getState().undo();
    expect(clipById('c1').audio.muted).toBeFalsy();
  });

  it('clipHasOwnSound vale para áudio e para vídeo ainda não separado', () => {
    const track = videoTrack([]);
    const clip = makeClip({ id: 'c1' });
    expect(clipHasOwnSound(clip, track, VIDEO)).toBe(true);
    expect(clipHasOwnSound({ ...clip, audioDetached: true }, track, VIDEO)).toBe(false);
    expect(clipHasOwnSound(clip, track, MUTE_VIDEO)).toBe(false);
    expect(clipHasOwnSound(clip, audioTrack('aud', []), VIDEO)).toBe(true);
  });
});
