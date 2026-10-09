import { describe, expect, it } from 'vitest';
import { createId, createProject, createTrack } from '@/engine/project/createProject';

describe('createProject', () => {
  it('cria um projeto com os valores padrão do editor', () => {
    const project = createProject('Teste');
    expect(project.name).toBe('Teste');
    expect(project.width).toBe(1920);
    expect(project.height).toBe(1080);
    expect(project.fps).toBe(30);
    expect(project.aspectRatio).toBe('16:9');
    expect(project.durationMs).toBe(0);
    expect(project.assets).toEqual([]);
    expect(project.folders).toEqual([]);
    expect(project.markers).toEqual([]);
  });

  it('cria uma trilha de vídeo e uma de áudio, vazias', () => {
    const { tracks } = createProject('Teste');
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ kind: 'video', name: 'Vídeo 1', clips: [] });
    expect(tracks[1]).toMatchObject({ kind: 'audio', name: 'Áudio 1', clips: [] });
    for (const track of tracks) {
      expect(track.muted).toBe(false);
      expect(track.locked).toBe(false);
      expect(track.hidden).toBe(false);
    }
  });

  it('define createdAt e updatedAt com o mesmo instante atual', () => {
    const before = Date.now();
    const project = createProject('Teste');
    const after = Date.now();
    expect(project.createdAt).toBeGreaterThanOrEqual(before);
    expect(project.createdAt).toBeLessThanOrEqual(after);
    expect(project.updatedAt).toBe(project.createdAt);
  });

  it('gera ids distintos a cada projeto', () => {
    expect(createProject('A').id).not.toBe(createProject('B').id);
  });
});

describe('createTrack', () => {
  it('cria trilha vazia com o tipo e nome pedidos', () => {
    const track = createTrack('text', 'Texto 1');
    expect(track).toMatchObject({
      kind: 'text',
      name: 'Texto 1',
      clips: [],
      muted: false,
      locked: false,
      hidden: false,
    });
    expect(track.id).not.toBe(createTrack('text', 'Texto 1').id);
  });
});

describe('createId', () => {
  it('retorna um UUID v4', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
