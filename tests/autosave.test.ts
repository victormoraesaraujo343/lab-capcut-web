import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/engine/project/createProject';
import { createHistory } from '@/engine/timeline/history';
import {
  deleteRecoverySnapshot,
  getProject,
  getRecoverySnapshot,
  putRecoverySnapshot,
  saveProject,
} from '@/engine/storage/db';
import { AUTOSAVE_INTERVAL_MS, startAutosave, stopAutosave, useRecoveryStore } from '@/stores/autosave';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Project } from '@/types';

vi.mock('@/engine/storage/db', () => ({
  getProject: vi.fn(),
  saveProject: vi.fn(async () => undefined),
  putRecoverySnapshot: vi.fn(async () => undefined),
  getRecoverySnapshot: vi.fn(),
  deleteRecoverySnapshot: vi.fn(async () => undefined),
}));

vi.mock('@/engine/storage/opfs', () => ({
  fileExists: vi.fn(async () => true),
  writeFile: vi.fn(async () => undefined),
  revokeObjectUrl: vi.fn(),
  deleteEntry: vi.fn(async () => undefined),
}));

const BASE_TIME = 1_000_000;

/** Chave da marca de sessão aberta do projeto, no localStorage. */
function markerOf(projectId: string): string {
  return `capcut-web:open:${projectId}`;
}

/** Projeto de teste com a data de alteração dada. */
function projectAt(updatedAt: number): Project {
  return { ...createProject('Teste'), updatedAt };
}

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(BASE_TIME);
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useRecoveryStore.setState({ offer: null });
  });

  afterEach(async () => {
    await stopAutosave();
    vi.useRealTimers();
  });

  it('grava o instantâneo a cada ciclo só quando o projeto mudou', async () => {
    const project = projectAt(BASE_TIME);
    vi.mocked(getProject).mockResolvedValue(project);
    useProjectStore.setState({ project });
    startAutosave(project.id);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(putRecoverySnapshot).not.toHaveBeenCalled();

    const changed = { ...project, name: 'Alterado', updatedAt: BASE_TIME + 5 };
    useProjectStore.setState({ project: changed });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(putRecoverySnapshot).toHaveBeenCalledTimes(1);
    expect(putRecoverySnapshot).toHaveBeenCalledWith(expect.objectContaining({ projectId: project.id, project: changed }));

    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(putRecoverySnapshot).toHaveBeenCalledTimes(1);
  });

  it('marca a sessão ao abrir e a remove no pagehide, depois de salvar', async () => {
    const project = projectAt(BASE_TIME);
    vi.mocked(getProject).mockResolvedValue(project);
    useProjectStore.setState({ project });
    startAutosave(project.id);
    expect(localStorage.getItem(markerOf(project.id))).not.toBeNull();

    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(markerOf(project.id))).toBeNull();
  });

  it('oferece a recuperação quando a marca existe e o instantâneo é mais novo', async () => {
    const saved = projectAt(BASE_TIME);
    const recovered = { ...saved, name: 'Recuperado', updatedAt: BASE_TIME + 60_000 };
    localStorage.setItem(markerOf(saved.id), '1');
    vi.mocked(getProject).mockResolvedValue(saved);
    vi.mocked(getRecoverySnapshot).mockResolvedValue({ projectId: saved.id, savedAt: BASE_TIME, project: recovered });
    useProjectStore.setState({ project: saved });

    startAutosave(saved.id);
    await vi.advanceTimersByTimeAsync(0);

    expect(useRecoveryStore.getState().offer?.project.name).toBe('Recuperado');
  });

  it('não oferece recuperação sem a marca de sessão aberta', async () => {
    const saved = projectAt(BASE_TIME);
    const recovered = { ...saved, name: 'Recuperado', updatedAt: BASE_TIME + 60_000 };
    vi.mocked(getProject).mockResolvedValue(saved);
    vi.mocked(getRecoverySnapshot).mockResolvedValue({ projectId: saved.id, savedAt: BASE_TIME, project: recovered });
    useProjectStore.setState({ project: saved });

    startAutosave(saved.id);
    await vi.advanceTimersByTimeAsync(0);

    expect(useRecoveryStore.getState().offer).toBeNull();
  });

  it('recuperar substitui o projeto, zera o histórico e apaga o instantâneo', async () => {
    const saved = projectAt(BASE_TIME);
    const recovered = { ...saved, name: 'Recuperado', updatedAt: BASE_TIME + 60_000 };
    localStorage.setItem(markerOf(saved.id), '1');
    vi.mocked(getProject).mockResolvedValue(saved);
    vi.mocked(getRecoverySnapshot).mockResolvedValue({ projectId: saved.id, savedAt: BASE_TIME, project: recovered });
    useProjectStore.setState({ project: saved });
    startAutosave(saved.id);
    await vi.advanceTimersByTimeAsync(0);

    await useRecoveryStore.getState().recover();

    expect(useProjectStore.getState().project?.name).toBe('Recuperado');
    expect(saveProject).toHaveBeenCalledWith(recovered);
    expect(deleteRecoverySnapshot).toHaveBeenCalledWith(saved.id);
    expect(useTimelineStore.getState().history).toEqual(createHistory());
    expect(useRecoveryStore.getState().offer).toBeNull();
  });

  it('descartar apaga o instantâneo e some com a oferta', async () => {
    const saved = projectAt(BASE_TIME);
    const recovered = { ...saved, updatedAt: BASE_TIME + 60_000 };
    localStorage.setItem(markerOf(saved.id), '1');
    vi.mocked(getProject).mockResolvedValue(saved);
    vi.mocked(getRecoverySnapshot).mockResolvedValue({ projectId: saved.id, savedAt: BASE_TIME, project: recovered });
    useProjectStore.setState({ project: saved });
    startAutosave(saved.id);
    await vi.advanceTimersByTimeAsync(0);

    await useRecoveryStore.getState().discard();

    expect(deleteRecoverySnapshot).toHaveBeenCalledWith(saved.id);
    expect(useRecoveryStore.getState().offer).toBeNull();
  });

  it('ao encerrar normalmente, remove a marca e o instantâneo', async () => {
    const project = projectAt(BASE_TIME);
    vi.mocked(getProject).mockResolvedValue(project);
    useProjectStore.setState({ project });
    startAutosave(project.id);

    await stopAutosave();

    expect(localStorage.getItem(markerOf(project.id))).toBeNull();
    expect(deleteRecoverySnapshot).toHaveBeenCalledWith(project.id);
  });

  it('com oferta pendente, ao encerrar mantém a marca para oferecer de novo', async () => {
    const saved = projectAt(BASE_TIME);
    const recovered = { ...saved, updatedAt: BASE_TIME + 60_000 };
    localStorage.setItem(markerOf(saved.id), '1');
    vi.mocked(getProject).mockResolvedValue(saved);
    vi.mocked(getRecoverySnapshot).mockResolvedValue({ projectId: saved.id, savedAt: BASE_TIME, project: recovered });
    useProjectStore.setState({ project: saved });
    startAutosave(saved.id);
    await vi.advanceTimersByTimeAsync(0);

    await stopAutosave();

    expect(localStorage.getItem(markerOf(saved.id))).not.toBeNull();
    expect(deleteRecoverySnapshot).not.toHaveBeenCalled();
  });
});
