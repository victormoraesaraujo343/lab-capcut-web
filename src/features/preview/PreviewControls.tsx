// Barra de controles da prévia: timecode, transporte (início, quadros, play, fim) e loop, qualidade e tela cheia.
import { useEffect, useState, type ChangeEvent, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore, useProjectStore } from '@/stores';
import type { PreviewQuality } from '@/types';
import { formatTimecode } from '@/utils/time';
import styles from './PreviewControls.module.css';

/** Taxa de quadros usada quando não há projeto aberto. */
const DEFAULT_FPS = 30;

/** Opções de qualidade da prévia, com o valor da escala e o rótulo. */
const QUALITY_OPTIONS: ReadonlyArray<{ value: PreviewQuality; label: string }> = [
  { value: 0.25, label: t.preview.qualityQuarter },
  { value: 0.5, label: t.preview.qualityHalf },
  { value: 1, label: t.preview.qualityFull },
];

/** Timecode atual e total; único trecho que assina a posição da reprodução. */
function Timecode() {
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const fps = useProjectStore((state) => state.project?.fps ?? DEFAULT_FPS);
  const durationMs = useProjectStore((state) => state.project?.durationMs ?? 0);
  return (
    <span className={styles.timecode}>
      {formatTimecode(currentTimeMs, fps)} / {formatTimecode(durationMs, fps)}
    </span>
  );
}

/** Pede a entrada em tela cheia do elemento dado; recusas do navegador são ignoradas. */
function requestFullscreen(target: HTMLElement): void {
  target.requestFullscreen().catch(() => undefined);
}

/** Barra de 40px abaixo do palco com o transporte da reprodução. */
export function PreviewControls({ fullscreenTarget }: { fullscreenTarget: RefObject<HTMLElement | null> }) {
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const loop = usePlaybackStore((state) => state.loop);
  const quality = usePlaybackStore((state) => state.quality);
  const [fullscreen, setFullscreen] = useState(false);

  // Acompanha a tela cheia, inclusive quando sai pelo Esc do navegador.
  useEffect(() => {
    const onChange = (): void => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** Entra ou sai da tela cheia do palco. */
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    const target = fullscreenTarget.current;
    if (target !== null) requestFullscreen(target);
  };

  /** Anda um quadro na direção dada, usando a taxa do projeto aberto. */
  const stepBy = (direction: -1 | 1): void => {
    const project = useProjectStore.getState().project;
    usePlaybackStore.getState().stepFrame(direction, project?.fps ?? DEFAULT_FPS, project?.durationMs);
  };

  /** Troca a qualidade pela opção escolhida no seletor. */
  const handleQuality = (event: ChangeEvent<HTMLSelectElement>): void => {
    const option = QUALITY_OPTIONS.find((item) => String(item.value) === event.target.value);
    if (option !== undefined) usePlaybackStore.getState().setQuality(option.value);
  };

  return (
    <div className={styles.bar}>
      <div className={styles.side}>
        <Timecode />
      </div>

      <div className={styles.center}>
        <IconButton
          icon={SkipBack}
          label={t.preview.goToStart}
          onClick={() => usePlaybackStore.getState().seek(0)}
        />
        <IconButton icon={ChevronLeft} label={t.preview.frameBack} onClick={() => stepBy(-1)} />
        <button
          type="button"
          className={styles.play}
          aria-label={isPlaying ? t.preview.pause : t.preview.play}
          title={isPlaying ? t.preview.pause : t.preview.play}
          onClick={() => usePlaybackStore.getState().togglePlay()}
        >
          {isPlaying ? <Pause size={18} strokeWidth={1.75} aria-hidden="true" /> : <Play size={18} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />}
        </button>
        <IconButton icon={ChevronRight} label={t.preview.frameForward} onClick={() => stepBy(1)} />
        <IconButton
          icon={SkipForward}
          label={t.preview.goToEnd}
          onClick={() => {
            const durationMs = useProjectStore.getState().project?.durationMs ?? 0;
            usePlaybackStore.getState().seek(durationMs, durationMs);
          }}
        />
      </div>

      <div className={styles.sideEnd}>
        <IconButton
          icon={Repeat}
          label={loop ? t.preview.loopOn : t.preview.loopOff}
          aria-pressed={loop}
          className={loop ? styles.active : undefined}
          onClick={() => usePlaybackStore.getState().toggleLoop()}
        />
        <select
          className={styles.select}
          aria-label={t.preview.quality}
          title={t.preview.quality}
          value={String(quality)}
          onChange={handleQuality}
        >
          {QUALITY_OPTIONS.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <IconButton
          icon={fullscreen ? Minimize : Maximize}
          label={fullscreen ? t.preview.exitFullscreen : t.preview.fullscreen}
          onClick={toggleFullscreen}
        />
      </div>
    </div>
  );
}
