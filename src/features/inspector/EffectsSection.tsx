// Seção Efeitos do inspetor: lista os efeitos do clipe, com parâmetros, ordem, remoção e andamento do fundo removido.
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { getEffect } from '@/engine/render/registry';
import { moveEffect, removeEffect } from '@/stores/effectCommands';
import { useJobsStore, type Job } from '@/stores/jobsStore';
import type { Clip, EffectInstance } from '@/types';
import { EffectParamControl, lookupText, type TextGroup } from './EffectParamControl';
import { JobProgress } from './ClipToolsSection';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Nomes dos efeitos, pelo tipo (t.effects.blur, t.effects.mirror...). */
const EFFECT_NAMES: TextGroup = t.effects;

/** Propriedades de EffectsSection. */
export interface EffectsSectionProps {
  /** Clipe cujos efeitos são listados e editados. */
  clip: Clip;
}

/** Propriedades de EffectCard. */
interface EffectCardProps {
  clipId: string;
  effect: EffectInstance;
  index: number;
  count: number;
  /** Trabalhos de fundo removido do clipe, mostrados sob o efeito. */
  jobs: Job[];
}

/** Um efeito: nome, botões de ordem e remoção e os parâmetros gerados pelo registro. */
function EffectCard({ clipId, effect, index, count, jobs }: EffectCardProps) {
  const def = getEffect(effect.type);
  const name = lookupText(EFFECT_NAMES, effect.type) ?? effect.type;

  return (
    <div className={sectionStyles.stack}>
      <div className={sectionStyles.actions}>
        <span>{name}</span>
        <IconButton
          icon={ChevronUp}
          label={t.inspector.moveUp}
          disabled={index === 0}
          onClick={() => moveEffect(clipId, effect.id, index - 1)}
        />
        <IconButton
          icon={ChevronDown}
          label={t.inspector.moveDown}
          disabled={index === count - 1}
          onClick={() => moveEffect(clipId, effect.id, index + 1)}
        />
        <IconButton icon={Trash2} label={t.inspector.removeEffect} onClick={() => removeEffect(clipId, effect.id)} />
      </div>
      {def?.params.map((spec) => (
        <EffectParamControl
          key={spec.key}
          clipId={clipId}
          instanceId={effect.id}
          spec={spec}
          value={effect.params[spec.key]}
        />
      ))}
      {effect.type === 'removeBackground' && jobs.map((job) => <JobProgress key={job.id} job={job} />)}
    </div>
  );
}

/** Seção Efeitos: uma linha por efeito do clipe, na ordem em que são aplicados. */
export function EffectsSection({ clip }: EffectsSectionProps) {
  const jobs = useJobsStore((s) => s.jobs);
  const removeBackgroundJobs = jobs.filter((job) => job.clipId === clip.id && job.kind === 'removeBackground');

  return (
    <Section title={t.inspector.tabEffects}>
      {clip.effects.length === 0 && <p>{t.inspector.noEffects}</p>}
      {clip.effects.map((effect, index) => (
        <EffectCard
          key={effect.id}
          clipId={clip.id}
          effect={effect}
          index={index}
          count={clip.effects.length}
          jobs={removeBackgroundJobs}
        />
      ))}
    </Section>
  );
}
