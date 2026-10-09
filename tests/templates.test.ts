import { describe, expect, it } from 'vitest';
import { projectFromTemplate } from '@/engine/templates/buildTemplate';
import { TEMPLATES, findTemplate } from '@/engine/templates/templates';
import { clipEndMs, type Project } from '@/types';

/** Proporção esperada (largura / altura) de cada proporção do projeto. */
const RATIO: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

/** Todos os ids de trilhas e clipes de um projeto. */
function collectIds(project: Project): string[] {
  return project.tracks.flatMap((track) => [track.id, ...track.clips.map((clip) => clip.id)]);
}

describe('modelos de projeto', () => {
  it('tem exatamente 10 modelos com ids únicos', () => {
    expect(TEMPLATES).toHaveLength(10);
    expect(new Set(TEMPLATES.map((def) => def.id)).size).toBe(10);
  });

  it('encontra um modelo pelo id e devolve undefined para id desconhecido', () => {
    expect(findTemplate('vlog')?.id).toBe('vlog');
    expect(findTemplate('nao-existe')).toBeUndefined();
  });

  it('todos os outros modelos têm duração', () => {
    for (const def of TEMPLATES.filter((item) => item.id !== 'tiktok-legendas')) {
      expect(projectFromTemplate(def, 'D').durationMs).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATES.map((def) => [def.id, def] as const))('%s monta um projeto coerente', (_id, def) => {
    const project = projectFromTemplate(def, 'Teste');
    expect(project.width / project.height).toBeCloseTo(RATIO[def.aspectRatio] ?? 0, 2);
    expect(project.aspectRatio).toBe(def.aspectRatio);
    expect(project.fps).toBe(def.fps);
    expect(project.tracks.some((track) => track.kind === 'video')).toBe(true);
    expect(project.tracks.some((track) => track.kind === 'audio')).toBe(true);
    expect(project.durationMs).toBeGreaterThanOrEqual(0);
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        expect(clip.trackId).toBe(track.id);
        expect(clip.startMs).toBeGreaterThanOrEqual(0);
        expect(clipEndMs(clip)).toBeLessThanOrEqual(project.durationMs);
      }
    }
  });

  it('gera ids novos a cada chamada', () => {
    for (const def of TEMPLATES) {
      const first = collectIds(projectFromTemplate(def, 'A'));
      const second = collectIds(projectFromTemplate(def, 'B'));
      expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
    }
  });

  it('tiktok-legendas tem trilha de legendas vazia', () => {
    const def = findTemplate('tiktok-legendas');
    if (def === undefined) throw new Error('modelo ausente');
    const project = projectFromTemplate(def, 'C');
    const captions = project.tracks.find((track) => track.role === 'captions');
    expect(captions?.clips).toEqual([]);
    expect(project.tracks.some((track) => track.kind === 'video')).toBe(true);
  });
});
