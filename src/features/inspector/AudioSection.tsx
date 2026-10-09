// Seção de áudio do inspetor: volume, fades, silenciar, reduzir ruído, separar o áudio do vídeo, efeito de voz e batidas.
import { useState } from 'react';
import { t } from '@/i18n/pt-BR';
import { updateClip } from '@/engine/timeline/clipOps';
import { canDetachAudio, detachAudio, reattachAudio, setFade, toggleClipMute } from '@/stores/audioCommands';
import { clearMarkers, detectBeats, type DetectBeatsResult } from '@/stores/beatCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Clip } from '@/types';
import { NumberField } from './NumberField';
import { Section } from './Section';
import { useKeyframeProperty } from './useKeyframeProperty';
import { VoiceEffectSection } from './VoiceEffectSection';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Propriedades de AudioSection. */
export interface AudioSectionProps {
  /** Clipe com som (vídeo, áudio ou fala) cujo som é editado. */
  clip: Clip;
  /** Asset do clipe; ausente em clipes de fala sintética. */
  asset: Asset | undefined;
}

/** Edita o clipe em um passo de histórico; a chave de agrupamento faz o arraste virar um passo só. */
function editAudio(clipId: string, key: string, change: (clip: Clip) => Clip): void {
  useTimelineStore.getState().edit(
    'audio',
    (tracks) => updateClip(tracks, clipId, change),
    undefined,
    { coalesceKey: `inspector:${clipId}:${key}` },
  );
}

/** Propriedades de DetachRow. */
interface DetachRowProps {
  clip: Clip;
  asset: Asset;
}

/** Botão para separar o áudio do vídeo ou juntar de volta; separar fica desabilitado com dica quando o vídeo não pode. */
function DetachRow({ clip, asset }: DetachRowProps) {
  if (clip.audioDetached === true) {
    return (
      <div className={sectionStyles.actions}>
        <button type="button" className={sectionStyles.action} onClick={() => reattachAudio(clip.id)}>
          {t.audioTools.reattach}
        </button>
      </div>
    );
  }
  const allowed = canDetachAudio(clip, asset);
  return (
    <>
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={!allowed}
          onClick={() => detachAudio(clip.id)}
        >
          {t.audioTools.detach}
        </button>
      </div>
      {allowed ? null : <p>{t.inspector.detachUnavailable}</p>}
    </>
  );
}

/** Propriedades de BeatsBlock. */
interface BeatsBlockProps {
  clipId: string;
}

/** Detecção de batidas do trecho de mídia do clipe: sensibilidade, botão, resultado e limpar as marcações. */
function BeatsBlock({ clipId }: BeatsBlockProps) {
  const [sensitivity, setSensitivity] = useState(50);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DetectBeatsResult | null>(null);

  /** Roda a detecção e mostra o que achou. */
  const detect = async (): Promise<void> => {
    setRunning(true);
    const found = await detectBeats(clipId, sensitivity / 100);
    setResult(found);
    setRunning(false);
  };

  return (
    <>
      <NumberField
        label={t.beats.sensitivity}
        value={sensitivity}
        min={0}
        max={100}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value) => setSensitivity(value)}
      />
      <div className={sectionStyles.actions}>
        <button type="button" className={sectionStyles.action} disabled={running} onClick={() => void detect()}>
          {running ? t.beats.detecting : t.beats.detect}
        </button>
        <button
          type="button"
          className={sectionStyles.action}
          onClick={() => {
            clearMarkers();
            setResult(null);
          }}
        >
          {t.beats.clear}
        </button>
      </div>
      {result !== null ? <p>{describeBeats(result)}</p> : null}
    </>
  );
}

/** Texto do resultado da detecção: quantidade e BPM, ou aviso de nenhuma batida. */
function describeBeats(result: DetectBeatsResult): string {
  if (result.count === 0) return t.beats.none;
  if (result.bpm === null) return t.inspector.beatsCount.replace('{count}', String(result.count));
  return t.beats.found.replace('{count}', String(result.count)).replace('{bpm}', String(Math.round(result.bpm)));
}

/** Seção Áudio: volume com keyframes, fades em segundos, silenciar, e para clipes com arquivo, ruído, separar, efeito de voz e batidas. */
export function AudioSection({ clip, asset }: AudioSectionProps) {
  const volume = useKeyframeProperty(clip.id, 'volume', (raw) =>
    editAudio(clip.id, 'volume', (c) => ({ ...c, volume: raw })),
  );
  const hasFile = asset !== undefined;
  return (
    <Section title={t.inspector.audio}>
      <NumberField
        label={t.inspector.volume}
        value={Math.round(volume.value * 100)}
        min={0}
        max={200}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value, final) => volume.setValue(value / 100, final)}
        keyframe={{
          active: volume.onKeyframe,
          animated: volume.hasKeyframes,
          onToggle: volume.toggle,
          onPrev: volume.prev,
          onNext: volume.next,
        }}
      />
      {clip.tts === undefined ? (
        <>
          <NumberField
            label={t.audioTools.fadeIn}
            value={clip.audio.fadeInMs / 1000}
            min={0}
            max={10}
            step={0.1}
            unit={t.audioTools.secondsUnit}
            onChange={(value) => setFade(clip.id, 'in', value * 1000)}
          />
          <NumberField
            label={t.audioTools.fadeOut}
            value={clip.audio.fadeOutMs / 1000}
            min={0}
            max={10}
            step={0.1}
            unit={t.audioTools.secondsUnit}
            onChange={(value) => setFade(clip.id, 'out', value * 1000)}
          />
        </>
      ) : null}
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          aria-pressed={clip.audio.muted === true}
          onClick={() => toggleClipMute(clip.id)}
        >
          {clip.audio.muted === true ? t.audioTools.unmute : t.audioTools.mute}
        </button>
      </div>
      {hasFile ? (
        <div className={fieldStyles.row}>
          <span className={fieldStyles.label}>{t.audioTools.denoise}</span>
          <input
            type="checkbox"
            aria-label={t.audioTools.denoise}
            checked={clip.audio.denoise}
            onChange={(event) =>
              editAudio(clip.id, 'denoise', (c) => ({ ...c, audio: { ...c.audio, denoise: event.target.checked } }))
            }
          />
        </div>
      ) : null}
      {hasFile && asset.kind === 'video' ? <DetachRow clip={clip} asset={asset} /> : null}
      {hasFile ? <VoiceEffectSection clip={clip} /> : null}
      {hasFile ? <BeatsBlock clipId={clip.id} /> : null}
    </Section>
  );
}
