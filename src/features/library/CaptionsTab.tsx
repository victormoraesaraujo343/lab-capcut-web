// Aba Legendas: gera legendas automáticas (projeto inteiro ou clipe selecionado) e lista as existentes para corrigir.

import { useMemo, useState, type ChangeEvent } from 'react';
import { Wand2 } from 'lucide-react';
import type { TranscribeLanguage, WhisperModelSize } from '@/engine/captions/transcribeProtocol';
import { canFetchLocalAssets } from '@/engine/env/runtimeEnv';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { selectClip } from '@/stores/timelineCommands';
import { replaceCaptionText } from '@/stores/textCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip, Track } from '@/types';
import { formatDuration } from '@/utils/time';
import { useCaptionGeneration, type CaptionStatus } from './useCaptionGeneration';
import styles from './CaptionsTab.module.css';

/** Quantas legendas aparecem por vez na lista; o restante vem com 'Mostrar mais'. */
const PAGE_SIZE = 200;

/** Estados em que a geração está ocupada. */
const RUNNING: readonly CaptionStatus[] = ['preparing', 'downloading', 'transcribing'];

/** Clipes de texto da(s) trilha(s) de legendas, em ordem de tempo. */
function captionClips(tracks: Track[]): Clip[] {
  return tracks
    .filter((track) => track.kind === 'text' && track.role === 'captions')
    .flatMap((track) => track.clips.filter((clip) => clip.text !== undefined))
    .sort((a, b) => a.startMs - b.startMs);
}

/** Rótulo do andamento enquanto a geração roda. */
function progressLabel(status: CaptionStatus): string {
  if (status === 'downloading') return t.captions.downloadingModel;
  if (status === 'preparing') return t.library.preparingAudio;
  return t.captions.transcribing;
}

/** Aba de legendas: opções e botão de gerar, andamento, resultado e lista editável. */
export function CaptionsTab() {
  const project = useProjectStore((s) => s.project);
  const selectedCount = useTimelineStore((s) => s.selectedClipIds.length);
  const { state, start, cancel } = useCaptionGeneration();
  const [source, setSource] = useState<'project' | 'selected'>('project');
  const [language, setLanguage] = useState<TranscribeLanguage>('auto');
  const [model, setModel] = useState<WhisperModelSize>('tiny');
  const [shown, setShown] = useState(PAGE_SIZE);

  const hasSelection = selectedCount > 0;
  const effectiveSource = hasSelection ? source : 'project';
  const running = RUNNING.includes(state.status);
  const captions = useMemo(() => captionClips(project?.tracks ?? []), [project]);
  const visibleCaptions = captions.slice(0, shown);

  /** Escolhe a origem; sem clipe selecionado, a opção fica desabilitada. */
  function handleSource(event: ChangeEvent<HTMLSelectElement>) {
    setSource(event.target.value === 'selected' ? 'selected' : 'project');
  }

  /** Abre a legenda: move o cursor para o início dela e a seleciona. */
  function focusCaption(clip: Clip) {
    usePlaybackStore.getState().seek(clip.startMs);
    selectClip(clip.id, false);
  }

  return (
    <div className={styles.root}>
      <div className={styles.options}>
        <label className={styles.field}>
          <span className={styles.label}>{t.captions.source}</span>
          <select className={styles.select} value={effectiveSource} disabled={running} onChange={handleSource}>
            <option value="project">{t.captions.sourceProject}</option>
            <option value="selected" disabled={!hasSelection}>
              {t.captions.sourceSelected}
            </option>
          </select>
        </label>
        {hasSelection ? null : <p className={styles.hint}>{t.library.selectClipHint}</p>}

        <label className={styles.field}>
          <span className={styles.label}>{t.captions.language}</span>
          <select
            className={styles.select}
            value={language}
            disabled={running}
            onChange={(event) => setLanguage(event.target.value as TranscribeLanguage)}
          >
            <option value="auto">{t.captions.languages.auto}</option>
            <option value="pt">{t.captions.languages.pt}</option>
            <option value="en">{t.captions.languages.en}</option>
            <option value="es">{t.captions.languages.es}</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t.captions.model}</span>
          <select
            className={styles.select}
            value={model}
            disabled={running}
            onChange={(event) => setModel(event.target.value as WhisperModelSize)}
          >
            <option value="tiny">{t.captions.modelTiny}</option>
            <option value="base">{t.captions.modelBase}</option>
          </select>
        </label>
      </div>

      {canFetchLocalAssets() ? (
        <button
          type="button"
          className={styles.generate}
          disabled={running || project === null}
          onClick={() => start({ source: effectiveSource, language, model })}
        >
          <Wand2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.captions.generate}</span>
        </button>
      ) : (
        <p className={styles.hint} role="note">{t.env.needsWebAddress}</p>
      )}
      <p className={styles.privacy}>{t.captions.privacy}</p>

      {running ? (
        <div className={styles.progress}>
          <p className={styles.status} role="status">
            {progressLabel(state.status)}
          </p>
          <progress className={styles.bar} max={100} value={Math.round(state.progress * 100)} />
          <button type="button" className={styles.cancel} onClick={cancel}>
            {t.captions.cancel}
          </button>
        </div>
      ) : null}
      {state.status === 'done' ? <p className={styles.status} role="status">{t.captions.done}</p> : null}
      {state.status === 'empty' ? <p className={styles.status} role="status">{t.captions.noSpeech}</p> : null}
      {state.status === 'error' ? <p className={styles.error} role="alert">{t.captions.error}</p> : null}

      <h3 className={styles.listTitle}>{t.captions.list}</h3>
      {captions.length === 0 ? <p className={styles.hint}>{t.library.noCaptions}</p> : null}
      {captions.length > 0 ? (
        <ul className={styles.list}>
          {visibleCaptions.map((clip) => (
            <li key={clip.id} className={styles.row}>
              <button
                type="button"
                className={styles.time}
                title={t.captions.list}
                onClick={() => focusCaption(clip)}
              >
                {formatDuration(clip.startMs)}
              </button>
              <input
                type="text"
                className={styles.input}
                aria-label={t.library.captionText}
                value={clip.text?.content ?? ''}
                onChange={(event) => replaceCaptionText(clip.id, event.target.value)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {captions.length > shown ? (
        <button type="button" className={styles.more} onClick={() => setShown((count) => count + PAGE_SIZE)}>
          {t.library.showMore}
        </button>
      ) : null}
    </div>
  );
}
