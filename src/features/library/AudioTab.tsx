// Aba Áudio da biblioteca: gravar narração, texto para fala (com adicionar na linha do tempo) e a lista de áudios do projeto, arrastáveis.
import { useMemo, useState, type DragEvent } from 'react';
import { Plus } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { ASSET_DRAG_MIME } from '@/features/media/MediaCard';
import { filterAssets } from '@/features/media/filterAssets';
import { SpeechControls, useSpeechVoices } from '@/features/inspector/SpeechSection';
import { setDraggedAsset } from '@/features/timeline/dragState';
import { RecordButton } from '@/features/recording/RecordButton';
import { IMAGE_DEFAULT_DURATION_MS } from '@/engine/timeline/constants';
import { t } from '@/i18n/pt-BR';
import { addSpeech } from '@/stores/ttsCommands';
import { addAssetToTimeline } from '@/stores/timelineCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import type { Asset } from '@/types';
import { formatDuration } from '@/utils/time';
import styles from './AudioTab.module.css';

/** Número de barras da mini forma de onda de cada áudio. */
const WAVE_BARS = 32;
/** Altura, em unidades do viewBox, da mini forma de onda. */
const WAVE_HEIGHT = 20;

/** Reduz os picos a `count` valores, usando o máximo de cada faixa. */
function sampleBars(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * peaks.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / count));
    let max = 0;
    for (let i = start; i < end && i < peaks.length; i += 1) max = Math.max(max, peaks[i] ?? 0);
    return Math.min(1, max);
  });
}

/** Propriedades de Wave. */
interface WaveProps {
  /** Picos normalizados entre 0 e 1. */
  peaks: number[];
}

/** Mini forma de onda em SVG para a lista de áudios. */
function Wave({ peaks }: WaveProps) {
  const bars = sampleBars(peaks, WAVE_BARS);
  return (
    <svg className={styles.wave} viewBox={`0 0 ${WAVE_BARS} ${WAVE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((peak, index) => {
        const height = Math.max(1, peak * WAVE_HEIGHT);
        return <rect key={index} x={index + 0.2} y={(WAVE_HEIGHT - height) / 2} width={0.6} height={height} rx={0.3} />;
      })}
    </svg>
  );
}

/** Propriedades de AudioItem. */
interface AudioItemProps {
  /** Asset de áudio exibido e arrastável. */
  asset: Asset;
}

/** Um áudio do projeto: nome, forma de onda e duração; arrastável para a linha do tempo, com botão + que adiciona no cursor. */
function AudioItem({ asset }: AudioItemProps) {
  /** Marca o áudio como arrastado do painel, no mesmo formato do painel de mídia. */
  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(ASSET_DRAG_MIME, asset.id);
    event.dataTransfer.effectAllowed = 'copy';
    setDraggedAsset({ id: asset.id, durationMs: asset.durationMs ?? IMAGE_DEFAULT_DURATION_MS, kind: 'audio' });
  }

  return (
    <li className={styles.item}>
      <div
        className={styles.surface}
        draggable
        tabIndex={0}
        title={asset.name}
        onDragStart={handleDragStart}
        onDragEnd={() => setDraggedAsset(null)}
      >
        <span className={styles.name}>{asset.name}</span>
        <Wave peaks={asset.waveform ?? []} />
        <span className={styles.duration}>{formatDuration(asset.durationMs ?? 0)}</span>
      </div>
      <IconButton
        icon={Plus}
        label={t.library.audioAddAtCursor}
        onClick={() => addAssetToTimeline(asset.id, null, usePlaybackStore.getState().currentTimeMs, 'overwrite')}
      />
    </li>
  );
}

/** Aba Áudio: gravar narração, criar fala sintética e listar os áudios do projeto (sem os gerados pelo editor). */
export function AudioTab() {
  const assets = useProjectStore((s) => s.project?.assets);
  const audioAssets = useMemo(
    () => filterAssets(assets ?? [], '', null).filter((asset) => asset.kind === 'audio'),
    [assets],
  );
  const { voices, loaded } = useSpeechVoices();
  const [text, setText] = useState('');
  const [voiceURI, setVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t.library.audioRecordTitle}</h3>
        <div className={styles.recordRow}>
          <RecordButton />
        </div>
        <p className={styles.hint}>{t.recording.headphonesTip}</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t.library.audioSpeechTitle}</h3>
        <textarea
          className={styles.textarea}
          aria-label={t.tts.placeholder}
          placeholder={t.tts.placeholder}
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <SpeechControls
          text={text}
          voices={voices}
          loaded={loaded}
          voiceURI={voiceURI}
          rate={rate}
          pitch={pitch}
          onVoice={setVoiceURI}
          onRate={setRate}
          onPitch={setPitch}
        />
        <button
          type="button"
          className={styles.addButton}
          disabled={text.trim() === ''}
          onClick={() => {
            addSpeech(text, { voiceURI, rate, pitch });
          }}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.tts.addToTimeline}</span>
        </button>
        <p className={styles.hint}>{t.tts.exportNotice}</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t.library.audioProjectTitle}</h3>
        {audioAssets.length === 0 ? (
          <p className={styles.hint}>{t.library.audioEmpty}</p>
        ) : (
          <>
            <ul className={styles.list}>
              {audioAssets.map((asset) => (
                <AudioItem key={asset.id} asset={asset} />
              ))}
            </ul>
            <p className={styles.hint}>{t.library.audioDragHint}</p>
          </>
        )}
      </section>
    </div>
  );
}
