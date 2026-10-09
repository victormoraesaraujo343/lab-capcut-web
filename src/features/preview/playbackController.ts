// Controlador da reprodução: o relógio de áudio dirige o cursor, os quadros e as edições do projeto.
import { useProjectStore, usePlaybackStore } from '@/stores';
import type { Asset, Project } from '@/types';
import { getPreviewEngine } from './previewEngine';

/** Espera, em ms, antes de reagendar o áudio depois de uma edição de trilhas (agrupa rajadas). */
const RESCHEDULE_DEBOUNCE_MS = 100;

/** Ids dos assets que sumiram da lista (ou de um projeto que foi fechado) entre dois estados. */
export function removedAssetIds(previous: Asset[], next: Asset[]): string[] {
  const kept = new Set(next.map((asset) => asset.id));
  return previous.filter((asset) => !kept.has(asset.id)).map((asset) => asset.id);
}

/** Liga a reprodução às stores: play/pausa, seek do usuário, loop, fim, edições e assets removidos. Devolve a função de parar. */
export function startPlaybackController(): () => void {
  const { provider, audio } = getPreviewEngine();
  let frameId = 0;
  let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
  // Cada início/parada de reprodução vira uma sessão; falhas de áudio de sessões antigas são ignoradas.
  let session = 0;
  // true só enquanto o próprio controlador grava a posição; seeks de fora são pedidos do usuário.
  let settingPosition = false;

  /** Projeto aberto agora, ou null. */
  const currentProject = (): Project | null => useProjectStore.getState().project;

  /** Grava a posição a partir do relógio ou do próprio controlador, sem tratar como pedido do usuário. */
  function setPosition(ms: number): void {
    settingPosition = true;
    try {
      usePlaybackStore.getState().seek(ms);
    } finally {
      settingPosition = false;
    }
  }

  /**
   * Toca o áudio a partir do instante. Se o áudio falhar, a prévia segue pelo relógio de reserva do motor;
   * só pausa se nem esse relógio estiver andando (senão o cursor congelaria com isPlaying ligado).
   */
  function playFrom(project: Project, ms: number): void {
    const mySession = session;
    audio.play(project, ms).catch(() => {
      if (mySession !== session || !usePlaybackStore.getState().isPlaying) return;
      if (!audio.isClockRunning()) usePlaybackStore.getState().pause();
    });
  }

  /** Cancela o quadro de relógio agendado, se houver. */
  function cancelFrame(): void {
    if (frameId !== 0) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  /** Inicia a reprodução: volta ao início se já estiver no fim, toca o áudio e começa o relógio. */
  function beginPlayback(): void {
    const project = currentProject();
    if (project === null || !(project.durationMs > 0)) {
      usePlaybackStore.getState().pause();
      return;
    }
    session++;
    const frameMs = project.fps > 0 ? 1000 / project.fps : 0;
    if (usePlaybackStore.getState().currentTimeMs >= project.durationMs - frameMs) {
      setPosition(0);
    }
    playFrom(project, usePlaybackStore.getState().currentTimeMs);
    provider.setPlaying(true, 1);
    cancelFrame();
    frameId = requestAnimationFrame(tick);
  }

  /** Para a reprodução: cancela o relógio, desliga o áudio e avisa o provedor de quadros. */
  function endPlayback(): void {
    session++;
    cancelFrame();
    audio.stop();
    provider.setPlaying(false);
  }

  /** Um quadro do relógio: lê o instante do áudio, trata o fim (loop ou pausa) e grava a posição. */
  function tick(): void {
    frameId = 0;
    const project = currentProject();
    const playback = usePlaybackStore.getState();
    if (project === null || !(project.durationMs > 0)) {
      playback.pause();
      return;
    }
    const now = audio.currentTimelineMs();
    if (now >= project.durationMs) {
      if (!playback.loop) {
        setPosition(project.durationMs);
        playback.pause();
        return;
      }
      setPosition(0);
      playFrom(project, 0);
    } else {
      setPosition(now);
    }
    frameId = requestAnimationFrame(tick);
  }

  const unsubscribePlayback = usePlaybackStore.subscribe((state, prev) => {
    if (state.isPlaying !== prev.isPlaying) {
      if (state.isPlaying) {
        beginPlayback();
      } else {
        endPlayback();
      }
      return;
    }
    // Clique na régua durante a reprodução: o áudio recomeça do novo ponto.
    if (state.isPlaying && !settingPosition && state.currentTimeMs !== prev.currentTimeMs) {
      const project = currentProject();
      if (project !== null) playFrom(project, state.currentTimeMs);
    }
  });

  const unsubscribeProject = useProjectStore.subscribe((state, prev) => {
    // Asset que saiu do projeto (ou do projeto fechado): libera decodificador, quadros e elemento.
    if (state.project?.assets !== prev.project?.assets) {
      for (const assetId of removedAssetIds(prev.project?.assets ?? [], state.project?.assets ?? [])) {
        provider.closeAsset(assetId);
      }
    }
    if (state.project?.tracks === prev.project?.tracks) return;
    if (!usePlaybackStore.getState().isPlaying) return;
    if (rescheduleTimer !== null) clearTimeout(rescheduleTimer);
    rescheduleTimer = setTimeout(() => {
      rescheduleTimer = null;
      const project = currentProject();
      if (project !== null && usePlaybackStore.getState().isPlaying) audio.reschedule(project);
    }, RESCHEDULE_DEBOUNCE_MS);
  });

  // Ao montar, não começa a tocar sozinha (o áudio exige um gesto do usuário).
  if (usePlaybackStore.getState().isPlaying) usePlaybackStore.getState().pause();

  return function stopPlaybackController(): void {
    unsubscribePlayback();
    unsubscribeProject();
    if (rescheduleTimer !== null) {
      clearTimeout(rescheduleTimer);
      rescheduleTimer = null;
    }
    const wasPlaying = usePlaybackStore.getState().isPlaying;
    endPlayback();
    if (wasPlaying) usePlaybackStore.getState().pause();
  };
}
