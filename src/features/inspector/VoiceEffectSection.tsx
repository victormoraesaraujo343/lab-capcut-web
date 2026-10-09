// Efeito de voz do clipe de áudio: escolhe o tipo (tom, eco, reverberação, robô, telefone) e ajusta os parâmetros; grava em audio.voiceEffect.
import { t } from '@/i18n/pt-BR';
import { defaultVoiceParams, isVoiceEffectType, VOICE_EFFECT_TYPES, type VoiceEffectType } from '@/engine/audio/voiceEffects';
import { updateClip } from '@/engine/timeline/clipOps';
import { createId } from '@/engine/project/createProject';
import { useTimelineStore } from '@/stores/timelineStore';
import type { AudioFx, Clip, ParamValue } from '@/types';
import { lookupText, type TextGroup } from './EffectParamControl';
import { NumberField } from './NumberField';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Rótulos dos parâmetros dos efeitos de voz, pela chave. */
const PARAM_TEXTS: TextGroup = t.audioTools.voiceParams;

/** Especificação de um parâmetro: chave, limites, passo e unidade opcional. */
interface VoiceParamSpec {
  key: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

/** Parâmetros editáveis de cada tipo de efeito de voz, com os limites. */
const VOICE_PARAM_SPECS: Record<VoiceEffectType, readonly VoiceParamSpec[]> = {
  pitch: [{ key: 'semitones', min: -12, max: 12, step: 1, unit: t.inspector.unitSemitones }],
  echo: [
    { key: 'delayMs', min: 50, max: 1000, step: 10, unit: t.inspector.unitMs },
    { key: 'feedback', min: 0, max: 0.9, step: 0.01 },
    { key: 'mix', min: 0, max: 1, step: 0.01 },
  ],
  reverb: [
    { key: 'roomSize', min: 0, max: 1, step: 0.01 },
    { key: 'mix', min: 0, max: 1, step: 0.01 },
  ],
  robot: [
    { key: 'frequency', min: 20, max: 200, step: 1, unit: t.inspector.unitHz },
    { key: 'mix', min: 0, max: 1, step: 0.01 },
  ],
  telephone: [{ key: 'drive', min: 0, max: 1, step: 0.01 }],
};

/** Grava uma mudança no efeito de voz do clipe; ajustes seguidos do mesmo parâmetro viram um passo só do histórico. */
function writeVoice(clipId: string, change: (audio: AudioFx) => AudioFx, coalesceKey?: string): void {
  useTimelineStore.getState().edit(
    'voice-effect',
    (tracks) => updateClip(tracks, clipId, (c) => ({ ...c, audio: change(c.audio) })),
    undefined,
    coalesceKey === undefined ? undefined : { coalesceKey },
  );
}

/** Troca o tipo do efeito de voz; escolher um tipo grava os parâmetros padrão, 'nenhum' tira o efeito. */
function chooseType(clipId: string, value: string): void {
  if (!isVoiceEffectType(value)) {
    writeVoice(clipId, (audio) => ({ ...audio, voiceEffect: undefined }));
    return;
  }
  writeVoice(clipId, (audio) => ({
    ...audio,
    voiceEffect: { id: createId(), type: value, params: defaultVoiceParams(value) },
  }));
}

/** Grava um parâmetro do efeito de voz atual; sem efeito, não faz nada. */
function writeParam(clipId: string, key: string, value: number): void {
  writeVoice(
    clipId,
    (audio) => {
      const current = audio.voiceEffect;
      if (current === undefined) return audio;
      return { ...audio, voiceEffect: { ...current, params: { ...current.params, [key]: value } } };
    },
    `voice:${clipId}:${key}`,
  );
}

/** Lê um parâmetro numérico do efeito, com o padrão do tipo se faltar. */
function readParam(params: Record<string, ParamValue>, type: VoiceEffectType, key: string): number {
  const value = params[key];
  if (typeof value === 'number') return value;
  return Number(defaultVoiceParams(type)[key] ?? 0);
}

/** Propriedades de VoiceEffectSection. */
export interface VoiceEffectSectionProps {
  /** Clipe com som cujo efeito de voz é editado. */
  clip: Clip;
}

/** Linha de escolha do efeito de voz e os campos dos parâmetros do tipo escolhido; faz parte da seção de áudio. */
export function VoiceEffectSection({ clip }: VoiceEffectSectionProps) {
  const effect = clip.audio.voiceEffect;
  const type = effect !== undefined && isVoiceEffectType(effect.type) ? effect.type : undefined;
  const specs = type === undefined ? [] : VOICE_PARAM_SPECS[type];

  return (
    <>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{t.audioTools.voiceEffect}</span>
        <select
          className={sectionStyles.select}
          aria-label={t.audioTools.voiceEffect}
          value={type ?? ''}
          style={{ gridColumn: 'span 2' }}
          onChange={(event) => chooseType(clip.id, event.target.value)}
        >
          <option value="">{t.audioTools.voiceEffects.none}</option>
          {VOICE_EFFECT_TYPES.map((item) => (
            <option key={item} value={item}>
              {t.audioTools.voiceEffects[item]}
            </option>
          ))}
        </select>
      </div>
      {type !== undefined && effect !== undefined
        ? specs.map((spec) => (
            <NumberField
              key={`${effect.id}:${spec.key}`}
              label={lookupText(PARAM_TEXTS, spec.key) ?? spec.key}
              value={readParam(effect.params, type, spec.key)}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              unit={spec.unit}
              onChange={(value) => writeParam(clip.id, spec.key, value)}
            />
          ))
        : null}
    </>
  );
}
