// Vozes do speechSynthesis do navegador: listagem com espera e escolha da melhor voz em português.

/** Tempo máximo, em ms, esperando o navegador carregar as vozes. */
const VOICES_TIMEOUT_MS = 1000;

/** Campos de uma voz usados para escolher. */
export type VoiceLike = Pick<SpeechSynthesisVoice, 'voiceURI' | 'lang'>;

/** Pontuação de uma voz: 2 para pt-BR, 1 para outro português, 0 para as demais. */
export function rankVoice(voice: Pick<VoiceLike, 'lang'>): number {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  if (lang === 'pt-br') return 2;
  if (lang === 'pt' || lang.startsWith('pt-')) return 1;
  return 0;
}

/** Escolhe a voz pedida; senão a primeira pt-BR, depois qualquer pt, depois a primeira da lista. Undefined se a lista estiver vazia. */
export function pickPortugueseVoice<V extends VoiceLike>(voices: readonly V[], voiceURI?: string): V | undefined {
  if (voiceURI !== undefined && voiceURI !== '') {
    const requested = voices.find((voice) => voice.voiceURI === voiceURI);
    if (requested !== undefined) return requested;
  }
  let best: V | undefined;
  let bestRank = 0;
  for (const voice of voices) {
    const rank = rankVoice(voice);
    if (rank > bestRank) {
      best = voice;
      bestRank = rank;
    }
  }
  return best ?? voices[0];
}

/** Devolve as vozes do navegador; se ainda não carregaram, espera o evento voiceschanged por até 1 s. Lista vazia sem suporte. */
export function listVoices(timeoutMs: number = VOICES_TIMEOUT_MS): Promise<SpeechSynthesisVoice[]> {
  const synth = currentSynthesis();
  if (synth === null) return Promise.resolve([]);
  const loaded = synth.getVoices();
  if (loaded.length > 0) return Promise.resolve(loaded);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      synth.removeEventListener('voiceschanged', finish);
      if (timer !== null) clearTimeout(timer);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish);
    timer = setTimeout(finish, timeoutMs);
  });
}

/** Sintetizador de fala do navegador, ou null se a API não existir neste ambiente. */
export function currentSynthesis(): SpeechSynthesis | null {
  if (typeof globalThis === 'undefined' || !('speechSynthesis' in globalThis)) return null;
  const synth = globalThis.speechSynthesis as SpeechSynthesis | undefined;
  return synth ?? null;
}
