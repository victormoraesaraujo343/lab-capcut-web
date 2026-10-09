// Cabeçalho de uma trilha: ícone do tipo, nome e botões de som, travar e ocultar.
import { Eye, EyeOff, Film, Lock, Music, Sparkles, Sticker, Type, Unlock, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { toggleTrackFlag } from '@/stores/timelineCommands';
import type { Track, TrackKind } from '@/types';
import { TRACK_HEADER_WIDTH, TRACK_ROW_HEIGHT } from './layout';
import styles from './TrackHeader.module.css';

/** Ícone de cada tipo de trilha. */
const KIND_ICON: Record<TrackKind, LucideIcon> = {
  video: Film,
  audio: Music,
  text: Type,
  sticker: Sticker,
  effect: Sparkles,
};

/** Tipos de trilha que têm áudio e, por isso, botão de som. */
const HAS_SOUND = new Set<TrackKind>(['video', 'audio']);

/** Tipos de trilha visuais, que podem ser ocultados na prévia. */
const IS_VISUAL = new Set<TrackKind>(['video', 'text', 'sticker', 'effect']);

/** Cabeçalho lateral de uma trilha, com a altura da linha dela e os controles de flags. */
export function TrackHeader({ track }: { track: Track }) {
  const KindIcon = KIND_ICON[track.kind];
  return (
    <div
      className={styles.header}
      style={{ width: TRACK_HEADER_WIDTH, height: TRACK_ROW_HEIGHT[track.kind] }}
    >
      <span className={styles.kind} title={t.timeline.trackKinds[track.kind]}>
        <KindIcon size={14} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className={styles.name} title={track.name}>
        {track.name}
      </span>
      <div className={styles.controls}>
        {HAS_SOUND.has(track.kind) && (
          <IconButton
            icon={track.muted ? VolumeX : Volume2}
            label={track.muted ? t.timeline.unmute : t.timeline.mute}
            aria-pressed={track.muted}
            className={track.muted ? styles.active : undefined}
            onClick={() => toggleTrackFlag(track.id, 'muted')}
          />
        )}
        <IconButton
          icon={track.locked ? Lock : Unlock}
          label={track.locked ? t.timeline.unlock : t.timeline.lock}
          aria-pressed={track.locked}
          className={track.locked ? styles.active : undefined}
          onClick={() => toggleTrackFlag(track.id, 'locked')}
        />
        {IS_VISUAL.has(track.kind) && (
          <IconButton
            icon={track.hidden ? EyeOff : Eye}
            label={track.hidden ? t.timeline.show : t.timeline.hide}
            aria-pressed={track.hidden}
            className={track.hidden ? styles.active : undefined}
            onClick={() => toggleTrackFlag(track.id, 'hidden')}
          />
        )}
      </div>
    </div>
  );
}
