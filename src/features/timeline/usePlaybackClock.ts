// Relógio de reprodução: avança a posição com requestAnimationFrame enquanto a reprodução está ligada.
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';

/** Avança currentTimeMs pelo tempo real decorrido enquanto isPlaying; no fim, volta ao início (loop) ou pausa. */
export function usePlaybackClock(): void {
  const isPlaying = usePlaybackStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const started = usePlaybackStore.getState();
    const project = useProjectStore.getState().project;
    const frameMs = project !== null && project.fps > 0 ? 1000 / project.fps : 0;
    // Dar play com o cursor no fim recomeça do zero, em vez de tocar nada e pausar.
    if (project !== null && project.durationMs > 0 && started.currentTimeMs >= project.durationMs - frameMs) {
      started.seek(0);
    }
    let last = performance.now();
    let frame = 0;

    const tick = (now: number): void => {
      const elapsed = now - last;
      last = now;
      const playback = usePlaybackStore.getState();
      const durationMs = useProjectStore.getState().project?.durationMs ?? 0;
      if (!(durationMs > 0)) {
        playback.pause();
        return;
      }
      let next = playback.currentTimeMs + elapsed;
      if (next >= durationMs) {
        if (playback.loop) {
          next = 0;
        } else {
          playback.seek(durationMs);
          playback.pause();
          return;
        }
      }
      playback.seek(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);
}
