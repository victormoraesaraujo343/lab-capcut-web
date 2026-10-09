// Monta um projeto novo a partir de um modelo: dimensões, fps, trilhas com ids novos e duração calculada.

import { computeProjectDuration, type Project } from '@/types';
import { createId } from '@/engine/project/createProject';
import type { TemplateDef } from './templates';

/** Cria um projeto novo com o nome dado, a partir do modelo; cada chamada gera ids novos. */
export function projectFromTemplate(def: TemplateDef, name: string): Project {
  const now = Date.now();
  const { tracks, markers } = def.build();
  return {
    id: createId(),
    name,
    width: def.width,
    height: def.height,
    fps: def.fps,
    aspectRatio: def.aspectRatio,
    durationMs: computeProjectDuration(tracks),
    tracks,
    assets: [],
    folders: [],
    markers,
    createdAt: now,
    updatedAt: now,
  };
}
