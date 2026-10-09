// Fábrica de projetos e trilhas novos, com valores padrão do editor.

import type { Project, Track, TrackKind } from '@/types';
import { t } from '@/i18n/pt-BR';

/** Gera um identificador único (UUID v4). */
export function createId(): string {
  return crypto.randomUUID();
}

/** Cria uma trilha vazia, desbloqueada, visível e com som. */
export function createTrack(kind: TrackKind, name: string): Track {
  return {
    id: createId(),
    kind,
    name,
    clips: [],
    muted: false,
    locked: false,
    hidden: false,
  };
}

/** Cria um projeto novo em 1920x1080, 30 fps, 16:9, com uma trilha de vídeo e uma de áudio. */
export function createProject(name: string): Project {
  const now = Date.now();
  return {
    id: createId(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks: [
      createTrack('video', `${t.timeline.trackKinds.video} 1`),
      createTrack('audio', `${t.timeline.trackKinds.audio} 1`),
    ],
    assets: [],
    folders: [],
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}
