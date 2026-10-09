// Seção de áudio do inspetor: volume do clipe e fades de entrada e saída.
import { t } from '@/i18n/pt-BR';
import { updateClip } from '@/engine/timeline/clipOps';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip } from '@/types';
import { NumberField } from './NumberField';
import { Section } from './Section';
import { useKeyframeProperty } from './useKeyframeProperty';

/** Propriedades de AudioSection. */
export interface AudioSectionProps {
  /** Clipe com som (vídeo ou áudio) cujo volume e fades são editados. */
  clip: Clip;
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

/** Seção Áudio: volume de 0 a 200% e fades de entrada e saída em milissegundos. */
export function AudioSection({ clip }: AudioSectionProps) {
  const volume = useKeyframeProperty(clip.id, 'volume', (raw) =>
    editAudio(clip.id, 'volume', (c) => ({ ...c, volume: raw })),
  );
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
      <NumberField
        label={t.inspector.fadeIn}
        value={clip.audio.fadeInMs}
        min={0}
        max={10000}
        step={10}
        unit={t.inspector.unitMs}
        onChange={(value) =>
          editAudio(clip.id, 'fadeIn', (c) => ({ ...c, audio: { ...c.audio, fadeInMs: value } }))
        }
      />
      <NumberField
        label={t.inspector.fadeOut}
        value={clip.audio.fadeOutMs}
        min={0}
        max={10000}
        step={10}
        unit={t.inspector.unitMs}
        onChange={(value) =>
          editAudio(clip.id, 'fadeOut', (c) => ({ ...c, audio: { ...c.audio, fadeOutMs: value } }))
        }
      />
    </Section>
  );
}
