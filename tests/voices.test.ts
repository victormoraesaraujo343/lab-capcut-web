import { afterEach, describe, expect, it, vi } from 'vitest';
import { listVoices, pickPortugueseVoice, rankVoice } from '@/engine/tts/voices';

/** Voz falsa com os campos usados na escolha. */
function voice(voiceURI: string, lang: string): SpeechSynthesisVoice {
  return { voiceURI, lang, name: voiceURI, default: false, localService: true } as SpeechSynthesisVoice;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('rankVoice', () => {
  it('dá mais pontos a pt-BR, depois a outro português, e zero às demais', () => {
    expect(rankVoice({ lang: 'pt-BR' })).toBe(2);
    expect(rankVoice({ lang: 'pt_br' })).toBe(2);
    expect(rankVoice({ lang: 'pt-PT' })).toBe(1);
    expect(rankVoice({ lang: 'pt' })).toBe(1);
    expect(rankVoice({ lang: 'en-US' })).toBe(0);
  });
});

describe('pickPortugueseVoice', () => {
  it('usa a voz pedida quando ela existe', () => {
    const voices = [voice('a', 'pt-BR'), voice('b', 'pt-PT')];
    expect(pickPortugueseVoice(voices, 'b')?.voiceURI).toBe('b');
  });

  it('cai para pt-BR quando a voz pedida some', () => {
    const voices = [voice('en', 'en-US'), voice('pt-pt', 'pt-PT'), voice('br', 'pt-BR')];
    expect(pickPortugueseVoice(voices, 'sumiu')?.voiceURI).toBe('br');
    expect(pickPortugueseVoice(voices)?.voiceURI).toBe('br');
  });

  it('usa qualquer português quando não há pt-BR', () => {
    const voices = [voice('en', 'en-US'), voice('pt-pt', 'pt-PT')];
    expect(pickPortugueseVoice(voices)?.voiceURI).toBe('pt-pt');
  });

  it('usa a primeira voz quando não há português', () => {
    const voices = [voice('en', 'en-US'), voice('fr', 'fr-FR')];
    expect(pickPortugueseVoice(voices)?.voiceURI).toBe('en');
  });

  it('devolve undefined sem vozes', () => {
    expect(pickPortugueseVoice([])).toBeUndefined();
  });
});

describe('listVoices', () => {
  it('devolve as vozes já carregadas sem esperar', async () => {
    const loaded = [voice('br', 'pt-BR')];
    vi.stubGlobal('speechSynthesis', fakeSynth(loaded));
    await expect(listVoices()).resolves.toEqual(loaded);
  });

  it('espera o evento voiceschanged quando as vozes ainda não carregaram', async () => {
    const synth = fakeSynth([]);
    vi.stubGlobal('speechSynthesis', synth);
    const pending = listVoices(1000);
    synth.loadVoices([voice('br', 'pt-BR')]);
    await expect(pending).resolves.toEqual([voice('br', 'pt-BR')]);
  });

  it('desiste depois do tempo limite e devolve a lista vazia', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('speechSynthesis', fakeSynth([]));
    const pending = listVoices(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual([]);
  });

  it('devolve lista vazia sem suporte ao speechSynthesis', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    await expect(listVoices()).resolves.toEqual([]);
  });
});

/** Sintetizador falso: vozes controláveis e disparo do evento voiceschanged. */
function fakeSynth(initial: SpeechSynthesisVoice[]) {
  let voices = initial;
  const listeners = new Set<() => void>();
  return {
    getVoices: () => voices,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    /** Carrega as vozes e dispara voiceschanged. */
    loadVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
