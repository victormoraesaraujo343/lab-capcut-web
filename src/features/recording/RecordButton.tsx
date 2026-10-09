// Botão do microfone na barra da timeline: começa a gravar a narração ou para a gravação em curso.
import { Mic } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { startRecording, stopRecording } from '@/stores/recordingCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useRecordingStore } from '@/stores/recordingStore';
import { formatDuration } from '@/utils/time';
import styles from './RecordButton.module.css';

/** Botão de gravar narração: fica vermelho e mostra o tempo enquanto grava. */
export function RecordButton() {
  const status = useRecordingStore((state) => state.status);
  const elapsedMs = useRecordingStore((state) => state.elapsedMs);
  const hasProject = useProjectStore((state) => state.project !== null);
  const recording = status === 'recording';
  const busy = status === 'requesting' || status === 'countdown' || status === 'saving';

  /** Começa a gravar, ou para se já estiver gravando. */
  const handleClick = (): void => {
    if (recording) void stopRecording();
    else void startRecording();
  };

  return (
    <div className={styles.wrap}>
      <IconButton
        icon={Mic}
        label={recording ? t.recording.stop : t.recording.start}
        className={recording ? styles.recording : undefined}
        disabled={!hasProject || busy}
        onClick={handleClick}
      />
      {recording ? <span className={styles.time}>{formatDuration(elapsedMs)}</span> : null}
    </div>
  );
}
