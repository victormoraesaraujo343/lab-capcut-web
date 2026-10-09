// Testes dos comandos de formas: criação na trilha de adesivo certa, padrões por tipo, edição com merge e undo.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { addShape, updateShape } from '@/stores/shapeCommands';
import { undo } from '@/engine/timeline/history';
import { createProject } from '@/engine/project/createProject';
import { t } from '@/i18n/pt-BR';
import type { Project, ShapeData, Track } from '@/types';

/** Abre um projeto de teste e devolve-o. */
function openProject(): Project {
  const project = createProject('Formas');
  useProjectStore.setState({ project });
  return project;
}

/** Trilhas do projeto aberto. */
function tracksNow(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Forma de um clipe pelo id, em qualquer trilha. */
function shapeOf(clipId: string): ShapeData | undefined {
  return tracksNow().flatMap((track) => track.clips).find((clip) => clip.id === clipId)?.shape;
}

describe('shapeCommands', () => {
  beforeEach(() => {
    cancelPendingSave();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    usePlaybackStore.setState(usePlaybackStore.getInitialState());
    useProjectStore.setState({ project: null });
  });

  it('addShape sem projeto aberto não faz nada e devolve vazio', () => {
    expect(addShape('rectangle')).toBe('');
    expect(tracksNow()).toEqual([]);
  });

  it('addShape cria trilha de adesivo no topo, no cursor, com o padrão do retângulo, e seleciona', () => {
    openProject();
    usePlaybackStore.setState({ currentTimeMs: 1200 });
    const id = addShape('rectangle');
    expect(tracksNow()[0]?.kind).toBe('sticker');
    expect(tracksNow()[0]?.name).toBe(`${t.shapes.title} 1`);
    const clip = tracksNow()[0]?.clips[0];
    expect(clip?.id).toBe(id);
    expect(clip?.startMs).toBe(1200);
    expect(clip?.shape).toEqual({
      shape: 'rectangle',
      width: 600,
      height: 340,
      cornerRadius: 24,
      fill: '#22d3ee',
      stroke: '#ffffff',
      strokeWidth: 0,
    });
    expect(useTimelineStore.getState().selectedClipIds).toEqual([id]);
  });

  it('padrões de círculo, seta e linha seguem a especificação', () => {
    openProject();
    const circle = shapeOf(addShape('circle', 0));
    const arrow = shapeOf(addShape('arrow', 5000));
    const line = shapeOf(addShape('line', 9000));
    expect(circle).toMatchObject({ shape: 'circle', width: 400, height: 400, fill: '#f43f5e' });
    expect(arrow).toMatchObject({ shape: 'arrow', width: 600, strokeWidth: 18, fill: '#facc15' });
    expect(line).toMatchObject({ shape: 'line', width: 600, stroke: '#ffffff', strokeWidth: 12 });
  });

  it('formas que se sobrepõem vão para trilhas diferentes; formas em horário livre reusam a trilha', () => {
    openProject();
    addShape('rectangle', 0);
    addShape('circle', 1000);
    expect(tracksNow().filter((track) => track.kind === 'sticker')).toHaveLength(2);
    addShape('line', 10_000);
    const stickers = tracksNow().filter((track) => track.kind === 'sticker');
    expect(stickers).toHaveLength(2);
    expect(stickers[0]?.clips).toHaveLength(2);
  });

  it('updateShape muda só os campos dados e mantém o resto', () => {
    openProject();
    const id = addShape('rectangle', 0);
    updateShape(id, { width: 320, fill: '#000000' });
    expect(shapeOf(id)).toMatchObject({ width: 320, fill: '#000000', height: 340, cornerRadius: 24 });
  });

  it('updateShape em clipe sem forma não muda nada', () => {
    openProject();
    const before = useTimelineStore.getState().history.past.length;
    updateShape('nao-existe', { width: 10 });
    expect(useTimelineStore.getState().history.past.length).toBe(before);
  });

  it('edições seguidas da mesma forma viram um passo só no histórico', () => {
    openProject();
    const id = addShape('rectangle', 0);
    const afterAdd = tracksNow();
    updateShape(id, { width: 400 });
    updateShape(id, { width: 450 });
    expect(shapeOf(id)?.width).toBe(450);
    const result = undo(useTimelineStore.getState().history, tracksNow());
    if (result === null) throw new Error('undo esperado');
    expect(result.tracks).toEqual(afterAdd);
  });
});
