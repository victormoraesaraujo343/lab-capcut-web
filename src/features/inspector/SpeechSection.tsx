// Seção Texto para fala do inspetor: texto, voz, velocidade, tom, ouvir e aviso de exportação. Também exporta os controles de voz usados pela aba Áudio.
import { useEffect, useState } from 'react';
import { t } from '@/i18n/pt-BR';
import { listVoices, pickPortugueseVoice, rankVoice } from '@/engine/tts/voices';
import { previewSpeech, updateSpeech } from '@/stores/ttsCommands';
import type { Clip } from '@/types';
import { NumberField } from './NumberField';
import { Section } from './Section';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Limites da velocidade e do tom da fala. */
const RATE_RANGE = { min: 0.5, max: 2, step: 0.05 } as const;
const PITCH_RANGE = { min: 0, max: 2, step: 0.05 } as const;

/** Vozes do navegador, com as pt-BR primeiro e depois as demais em ordem alfabética; `loaded` indica que a lista já foi lida. */
export function useSpeechVoices(): { voices: SpeechSynthesisVoice[]; loaded: boolean } {
  const [state, setState] = useState<{ voices: SpeechSynthesisVoice[]; loaded: boolean }>({ voices: [], loaded: false });
  useEffect(() => {
    let active = true;
    void listVoices().then((list) => {
      if (active) setState({ voices: sortVoices(list), loaded: true });
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}

/** Ordena as vozes: português primeiro (pt-BR antes de outros pt), depois pelo nome. */
export function sortVoices(list: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...list].sort((a, b) => rankVoice(b) - rankVoice(a) || a.name.localeCompare(b.name));
}

/** Propriedades de SpeechControls. */
export interface SpeechControlsProps {
  /** Texto que o botão Ouvir vai falar. */
  text: string;
  /** Vozes disponíveis, já ordenadas. */
  voices: SpeechSynthesisVoice[];
  /** Se a lista de vozes já foi lida (para decidir mostrar o aviso de nenhuma voz). */
  loaded: boolean;
  /** voiceURI escolhido ('' = automática). */
  voiceURI: string;
  /** Velocidade da fala. */
  rate: number;
  /** Tom da fala. */
  pitch: number;
  /** Recebe a voz escolhida. */
  onVoice: (voiceURI: string) => void;
  /** Recebe a velocidade nova. */
  onRate: (rate: number) => void;
  /** Recebe o tom novo. */
  onPitch: (pitch: number) => void;
}

/** Controles de voz de uma fala: seletor de voz, aviso sem voz, velocidade, tom e botão Ouvir. */
export function SpeechControls({ text, voices, loaded, voiceURI, rate, pitch, onVoice, onRate, onPitch }: SpeechControlsProps) {
  const selected = pickPortugueseVoice(voices, voiceURI)?.voiceURI ?? '';
  const noVoices = loaded && voices.length === 0;
  return (
    <>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{t.tts.voice}</span>
        <select
          className={sectionStyles.select}
          aria-label={t.tts.voice}
          value={selected}
          disabled={noVoices}
          style={{ gridColumn: 'span 2' }}
          onChange={(event) => onVoice(event.target.value)}
        >
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      </div>
      {noVoices ? <p>{t.tts.noVoices}</p> : null}
      <NumberField
        label={t.tts.rate}
        value={rate}
        min={RATE_RANGE.min}
        max={RATE_RANGE.max}
        step={RATE_RANGE.step}
        onChange={(value) => onRate(value)}
      />
      <NumberField
        label={t.tts.pitch}
        value={pitch}
        min={PITCH_RANGE.min}
        max={PITCH_RANGE.max}
        step={PITCH_RANGE.step}
        onChange={(value) => onPitch(value)}
      />
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={text.trim() === ''}
          onClick={() => previewSpeech(text, selected, rate, pitch)}
        >
          {t.tts.listen}
        </button>
      </div>
    </>
  );
}

/** Propriedades de SpeechSection. */
export interface SpeechSectionProps {
  /** Clipe de fala sintética (com tts) cujos dados são editados. */
  clip: Clip;
}

/** Seção de um clipe de fala: edita o texto (ao sair do campo), a voz, a velocidade e o tom, e mostra o aviso de exportação. */
export function SpeechSection({ clip }: SpeechSectionProps) {
  const { voices, loaded } = useSpeechVoices();
  const tts = clip.tts;
  const [draft, setDraft] = useState(tts?.text ?? '');
  if (tts === undefined) return null;

  /** Grava o texto digitado quando ele não está vazio e mudou. */
  const commitText = (): void => {
    if (draft.trim() !== '' && draft !== tts.text) updateSpeech(clip.id, { text: draft });
  };

  return (
    <Section title={t.tts.title}>
      <textarea
        className={sectionStyles.textarea}
        aria-label={t.inspector.speechText}
        placeholder={t.tts.placeholder}
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitText}
      />
      <SpeechControls
        text={draft}
        voices={voices}
        loaded={loaded}
        voiceURI={tts.voiceURI}
        rate={tts.rate}
        pitch={tts.pitch}
        onVoice={(voiceURI) => updateSpeech(clip.id, { voiceURI })}
        onRate={(rate) => updateSpeech(clip.id, { rate })}
        onPitch={(pitch) => updateSpeech(clip.id, { pitch })}
      />
      <p>{t.tts.exportNotice}</p>
    </Section>
  );
}
