import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTtsPlayer, type SpeechOutput } from '@/engine/tts/ttsPlayer';
import { createProject, createTrack } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

/** Utterance falsa com os campos que o player preenche. */
class FakeUtterance {
  text: string;
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  constructor(text: string) {
    this.text = text;
  }
}

/** speechSynthesis falso: guarda as falas pedidas e conta os cancelamentos. */
function fakeSynth() {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speak: vi.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
    }),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
  };
  return { synth, spoken };
}

/** Clipe de fala de teste, sem asset, no intervalo dado. */
function speechClip(id: string, trackId: string, startMs: number, durationMs: number, text: string): Clip {
  return {
    id,
    trackId,
    startMs,
    durationMs,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 0.8,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    tts: { text, voiceURI: '', rate: 1.25, pitch: 0.9 },
  };
}

/** Projeto de teste com uma trilha de áudio contendo os clipes dados. */
function projectWith(clips: Clip[], muted = false): Project {
  const base = createProject('Fala');
  const track: Track = { ...createTrack('audio', 'Áudio 1'), clips, muted };
  return { ...base, tracks: [track] };
}

beforeEach(() => {
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTtsPlayer', () => {
  it('fala ao entrar no clipe de fala, com voz, velocidade, tom e volume do clipe', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 1000, 2000, 'Olá mundo')]);
    player.sync(project, 1000, true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toBe('Olá mundo');
    expect(spoken[0]?.rate).toBe(1.25);
    expect(spoken[0]?.pitch).toBe(0.9);
    expect(spoken[0]?.volume).toBe(0.8);
  });

  it('não fala fora da janela de 200 ms do início', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 1000, 2000, 'Oi')]);
    player.sync(project, 999, true);
    player.sync(project, 1200, true);
    expect(spoken).toHaveLength(0);
  });

  it('não repete o mesmo clipe enquanto o cursor anda dentro dele', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 1000, 2000, 'Oi')]);
    for (let ms = 1000; ms <= 1150; ms += 16) player.sync(project, ms, true);
    expect(spoken).toHaveLength(1);
  });

  it('cala a fala quando o cursor sai do clipe', () => {
    const { synth } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 1000, 1000, 'Oi')]);
    player.sync(project, 1000, true);
    synth.cancel.mockClear();
    player.sync(project, 2500, true);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancela ao pausar e fala de novo na próxima passagem', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 1000, 2000, 'Oi')]);
    player.sync(project, 1000, true);
    player.sync(project, 1050, false);
    expect(synth.cancel).toHaveBeenCalled();
    player.sync(project, 1000, true);
    expect(spoken).toHaveLength(2);
  });

  it('cancel() cala a fala e zera a passagem', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    const project = projectWith([speechClip('s1', 'x', 0, 2000, 'Oi')]);
    player.sync(project, 0, true);
    player.cancel();
    expect(synth.cancel).toHaveBeenCalled();
    player.sync(project, 0, true);
    expect(spoken).toHaveLength(2);
  });

  it('não fala em trilha silenciada', () => {
    const { synth, spoken } = fakeSynth();
    vi.stubGlobal('speechSynthesis', synth);
    const player = createTtsPlayer();
    player.sync(projectWith([speechClip('s1', 'x', 0, 2000, 'Oi')], true), 0, true);
    expect(spoken).toHaveLength(0);
  });

  it('sem speechSynthesis não faz nada e não falha', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const player = createTtsPlayer();
    expect(() => player.sync(projectWith([speechClip('s1', 'x', 0, 2000, 'Oi')]), 0, true)).not.toThrow();
  });

  it('usa a saída informada quando recebe uma', () => {
    const output: SpeechOutput = { speak: vi.fn(), cancel: vi.fn() };
    const player = createTtsPlayer(output);
    player.sync(projectWith([speechClip('s1', 'x', 0, 2000, 'Oi')]), 0, true);
    expect(output.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Oi', rate: 1.25 }));
  });
});
