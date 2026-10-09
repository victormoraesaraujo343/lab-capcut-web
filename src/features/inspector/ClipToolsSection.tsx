// Seção Ferramentas do inspetor: congelar quadro, inverter, estabilizar e remover fundo, com o andamento e erros de cada trabalho.
import { useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { runReverseJob } from '@/engine/jobs/reverseJob';
import { freezeFrame } from '@/stores/clipToolCommands';
import { removeBackground } from '@/stores/removeBackgroundCommands';
import { stabilizeClip } from '@/stores/stabilizeCommands';
import { useJobsStore, type Job, type JobKind } from '@/stores/jobsStore';
import type { Clip } from '@/types';
import { lookupText, type TextGroup } from './EffectParamControl';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Mensagens de erro dos trabalhos, pelo código do erro. */
const ERROR_TEXTS: TextGroup = t.inspector.toolErrors;
/** Tipos de trabalho que as ferramentas do clipe disparam. */
const TOOL_KINDS: readonly JobKind[] = ['reverse', 'stabilize', 'removeBackground'];

/** Propriedades de JobProgress. */
export interface JobProgressProps {
  /** Trabalho a mostrar. */
  job: Job;
}

/** Andamento de um trabalho em segundo plano: barra, porcentagem e cancelar; falha mostra a mensagem e pode ser fechada. */
export function JobProgress({ job }: JobProgressProps) {
  const jobs = useJobsStore.getState();
  if (job.status === 'done') return null;
  if (job.status === 'error') {
    return (
      <div className={sectionStyles.actions}>
        <span>{lookupText(ERROR_TEXTS, job.errorCode ?? '') ?? t.inspector.toolErrors.generic}</span>
        <IconButton icon={X} label={t.inspector.dismissJob} onClick={() => jobs.dismiss(job.id)} />
      </div>
    );
  }
  return (
    <div className={sectionStyles.actions}>
      <progress max={1} value={job.progress} aria-label={t.inspector.jobRunning} style={{ flex: '1 1 120px' }} />
      <span>{`${Math.round(job.progress * 100)}${t.inspector.unitPercent}`}</span>
      <IconButton icon={X} label={t.inspector.cancelJob} onClick={() => jobs.cancelJob(job.id)} />
    </div>
  );
}

/** Propriedades de ClipToolsSection. */
export interface ClipToolsSectionProps {
  /** Clipe de vídeo ou imagem sobre o qual as ferramentas agem. */
  clip: Clip;
}

/** Seção Ferramentas: botões de congelar, inverter, estabilizar (com força) e remover fundo; cada um mostra o próprio trabalho. */
export function ClipToolsSection({ clip }: ClipToolsSectionProps) {
  const [strength, setStrength] = useState(50);
  const jobs = useJobsStore((s) => s.jobs);
  const mine = jobs.filter((job) => job.clipId === clip.id && TOOL_KINDS.includes(job.kind));
  const running = (kind: JobKind): boolean => mine.some((job) => job.kind === kind && job.status === 'running');

  return (
    <Section title={t.inspector.tabTools}>
      <div className={sectionStyles.actions}>
        <button type="button" className={sectionStyles.action} onClick={() => freezeFrame(clip.id)}>
          {t.inspector.toolFreeze}
        </button>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={running('reverse')}
          onClick={() => void runReverseJob(clip.id)}
        >
          {t.inspector.toolReverse}
        </button>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={running('removeBackground')}
          onClick={() => void removeBackground(clip.id)}
        >
          {t.inspector.toolRemoveBackground}
        </button>
      </div>
      <NumberField
        label={t.inspector.toolStrength}
        value={strength}
        min={0}
        max={100}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value) => setStrength(value)}
      />
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          disabled={running('stabilize')}
          onClick={() => void stabilizeClip(clip.id, strength / 100)}
        >
          {t.inspector.toolStabilize}
        </button>
      </div>
      {mine.map((job) => (
        <JobProgress key={job.id} job={job} />
      ))}
    </Section>
  );
}
