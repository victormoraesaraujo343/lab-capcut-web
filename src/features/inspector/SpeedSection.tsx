// Seção Velocidade do inspetor: aba Normal (velocidade constante em escala logarítmica) e aba Curva (editor e presets).
import { handleTablistKeyDown } from '@/components/tabKeys';
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { t } from '@/i18n/pt-BR';
import { MIN_CLIP_MS } from '@/engine/timeline/constants';
import { isWebAudioSpeed } from '@/engine/audio/audioNodes';
import {
  mediaOffsetAt,
  SPEED_CURVE_PRESETS,
  SPEED_MAX,
  SPEED_MIN,
  timelineDurationFor,
} from '@/engine/timeline/speedCurve';
import { applySpeedPreset, setClipSpeed, setPreservePitch, setSpeedCurve } from '@/stores/speedCommands';
import { formatDuration } from '@/utils/time';
import type { Clip, Speed } from '@/types';
import { Section } from './Section';
import { SpeedCurveEditor } from './SpeedCurveEditor';
import { sameCurve } from './speedCurveMath';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Propriedades de SpeedSection. */
export interface SpeedSectionProps {
  /** Clipe com vídeo ou áudio cuja velocidade é editada. */
  clip: Clip;
}

/** Abas da seção de velocidade. */
type SpeedTab = 'constant' | 'curve';

/** Marcas rápidas do slider de velocidade constante. */
const SPEED_MARKS = [0.5, 1, 2, 5] as const;

/** Limites do slider em escala logarítmica (log10 de 0,1 e de 100). */
const LOG_MIN = Math.log10(SPEED_MIN);
const LOG_MAX = Math.log10(SPEED_MAX);

/** Arredonda a velocidade para exibição (até duas casas, sem zeros à direita). */
function formatSpeed(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Duração na timeline, em ms, que o clipe teria com a velocidade dada (mesma conta da troca de velocidade). */
function durationWith(clip: Clip, speed: Speed): number {
  const mediaSpanMs = mediaOffsetAt(clip.speed, clip.durationMs, clip.durationMs);
  return Math.max(MIN_CLIP_MS, Math.round(timelineDurationFor(speed, mediaSpanMs)));
}

/** Aviso quando a velocidade (constante ou algum ponto da curva) sai da faixa em que o áudio toca. */
function MutedNote({ speed }: { speed: Speed }) {
  if (isWebAudioSpeed(speed)) return null;
  return (
    <div className={sectionStyles.actions} role="note">
      <span>{t.speed.mutedRange}</span>
    </div>
  );
}

/** Linha com "Nova duração" do clipe depois da troca de velocidade. */
function DurationAfter({ clip, speed }: { clip: Clip; speed: Speed }) {
  return (
    <div className={sectionStyles.actions}>
      <span>{`${t.speed.durationAfter}: ${formatDuration(durationWith(clip, speed))}`}</span>
    </div>
  );
}

/** Aba Normal: slider logarítmico 0,1x a 100x, campo numérico, marcas, manter o tom e a nova duração. */
function ConstantSpeed({ clip }: { clip: Clip }) {
  const [draft, setDraft] = useState<number | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const shown = draft ?? clip.speed.value;

  /** Grava a velocidade constante; só vai para a store se mudou (ou se o clipe usava curva). */
  const commit = (value: number): void => {
    setDraft(null);
    setTyped(null);
    if (clip.speed.mode === 'curve' || value !== clip.speed.value) setClipSpeed(clip.id, value);
  };

  /** Grava o valor do campo numérico ao confirmar; texto inválido só descarta a digitação. */
  const commitTyped = (): void => {
    if (typed === null) return;
    const parsed = Number(typed.trim().replace(',', '.'));
    if (typed.trim() === '' || !Number.isFinite(parsed)) {
      setTyped(null);
      return;
    }
    commit(parsed);
  };

  /** Enter confirma o campo e Escape descarta a digitação. */
  const handleFieldKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commitTyped();
    if (event.key === 'Escape') setTyped(null);
  };

  return (
    <>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{t.speed.value}</span>
        <input
          className={fieldStyles.slider}
          type="range"
          aria-label={t.speed.value}
          min={LOG_MIN}
          max={LOG_MAX}
          step={0.005}
          value={Math.log10(shown)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(10 ** Number(event.target.value))}
          onPointerUp={() => {
            if (draft !== null) commit(draft);
          }}
          onKeyUp={() => {
            if (draft !== null) commit(draft);
          }}
        />
        <span className={fieldStyles.field}>
          <input
            className={fieldStyles.input}
            type="number"
            aria-label={t.speed.value}
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.1}
            value={typed ?? formatSpeed(shown)}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={handleFieldKey}
            onBlur={commitTyped}
          />
          <span className={fieldStyles.unit}>{t.inspector.unitSpeed}</span>
        </span>
      </div>
      <MutedNote speed={{ ...clip.speed, mode: 'constant', value: shown }} />
      <div className={sectionStyles.actions}>
        {SPEED_MARKS.map((mark) => (
          <button
            key={mark}
            type="button"
            className={sectionStyles.action}
            aria-pressed={clip.speed.mode === 'constant' && clip.speed.value === mark}
            onClick={() => commit(mark)}
          >
            {`${mark}${t.inspector.unitSpeed}`}
          </button>
        ))}
      </div>
      <label className={sectionStyles.actions}>
        <input
          type="checkbox"
          checked={clip.speed.preservePitch}
          onChange={(event) => setPreservePitch(clip.id, event.target.checked)}
        />
        {t.speed.preservePitch}
      </label>
      <DurationAfter clip={clip} speed={{ ...clip.speed, mode: 'constant', value: shown }} />
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={clip.speed.mode === 'constant' && clip.speed.value === 1}
          onClick={() => commit(1)}
        >
          {t.speed.reset}
        </button>
      </div>
    </>
  );
}

/** Aba Curva: editor do gráfico, presets prontos e a opção Personalizada; sem curva, mostra a velocidade constante como reta. */
function CurveSpeed({ clip }: { clip: Clip }) {
  const isCurve = clip.speed.mode === 'curve';
  const curve = isCurve ? clip.speed.curve : [{ t: 0, speed: clip.speed.value }, { t: 1, speed: clip.speed.value }];
  const activePreset = SPEED_CURVE_PRESETS.find((preset) => isCurve && sameCurve(preset.curve, clip.speed.curve));
  const isCustom = isCurve && activePreset === undefined;

  return (
    <>
      <SpeedCurveEditor clipId={clip.id} curve={curve} />
      <MutedNote speed={{ ...clip.speed, mode: 'curve', curve }} />
      <div className={sectionStyles.actions}>
        {SPEED_CURVE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={sectionStyles.action}
            aria-pressed={activePreset?.id === preset.id}
            onClick={() => applySpeedPreset(clip.id, preset.id)}
          >
            {t.speed.presets[preset.id]}
          </button>
        ))}
        <button
          type="button"
          className={sectionStyles.action}
          aria-pressed={isCustom}
          onClick={() => {
            if (!isCurve) setSpeedCurve(clip.id, curve);
          }}
        >
          {t.speed.presets.custom}
        </button>
      </div>
      <DurationAfter clip={clip} speed={{ ...clip.speed, mode: 'curve', curve }} />
      <div className={sectionStyles.actions}>
        <button type="button" className={sectionStyles.action} onClick={() => setClipSpeed(clip.id, 1)}>
          {t.speed.reset}
        </button>
      </div>
    </>
  );
}

/** Seção Velocidade: abas Normal e Curva, cada uma com seus controles, e a nova duração do clipe. */
export function SpeedSection({ clip }: SpeedSectionProps) {
  const [tab, setTab] = useState<SpeedTab>(clip.speed.mode === 'curve' ? 'curve' : 'constant');
  const tabs: ReadonlyArray<{ id: SpeedTab; label: string }> = [
    { id: 'constant', label: t.speed.constant },
    { id: 'curve', label: t.speed.curve },
  ];

  return (
    <Section title={t.speed.title}>
      <div className={sectionStyles.actions} role="tablist" aria-label={t.speed.title}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={sectionStyles.action}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onKeyDown={handleTablistKeyDown}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'constant' ? <ConstantSpeed clip={clip} /> : <CurveSpeed clip={clip} />}
    </Section>
  );
}
