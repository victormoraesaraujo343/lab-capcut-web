// Testes do diálogo de exportação: abertura, formato, disparo, progresso, erro traduzido e download.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportDialog } from '../src/features/export/ExportDialog';
import { startExport, type ExportUpdate } from '../src/features/export/exportClient';
import { downloadBlob } from '../src/features/export/downloadBlob';
import { createProject } from '../src/engine/project/createProject';
import { t } from '../src/i18n/pt-BR';
import { formatDuration } from '../src/utils/time';

vi.mock('../src/features/export/exportClient', () => ({
  startExport: vi.fn(),
  CANCELLED_MESSAGE: 'cancelled',
  LARGE_FILE_BYTES: 1_500_000_000,
}));
vi.mock('../src/features/export/downloadBlob', () => ({ downloadBlob: vi.fn() }));
vi.mock('../src/features/media/useObjectUrl', () => ({ useObjectUrl: () => undefined }));

const startExportMock = vi.mocked(startExport);
const downloadMock = vi.mocked(downloadBlob);
const STORAGE_KEY = 'capcut-web:export-settings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

/** Renderiza o diálogo com um projeto novo. */
function renderDialog(onClose = vi.fn()) {
  const project = createProject('Meu vídeo');
  render(<ExportDialog project={project} onClose={onClose} />);
  return { project, onClose };
}

describe('ExportDialog', () => {
  it('abre como diálogo modal com o título de exportação', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: t.export.title });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('ao escolher WAV esconde a resolução', () => {
    renderDialog();
    expect(screen.getByRole('radiogroup', { name: t.export.resolution })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: t.export.formats.wav }));
    expect(screen.queryByRole('radiogroup', { name: t.export.resolution })).not.toBeInTheDocument();
  });

  it('o botão Exportar chama startExport com as escolhas e salva as escolhas', () => {
    startExportMock.mockImplementation(() => ({ cancel: vi.fn(), result: new Promise(() => undefined) }));
    const { project } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    expect(startExportMock).toHaveBeenCalledWith(project, expect.objectContaining({ format: 'mp4' }), expect.any(Function));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('mostra o progresso, a fase e o tempo restante', () => {
    let onUpdate: ((update: ExportUpdate) => void) | undefined;
    startExportMock.mockImplementation((_project, _settings, callback) => {
      onUpdate = callback;
      return { cancel: vi.fn(), result: new Promise(() => undefined) };
    });
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    act(() => onUpdate?.({ phase: 'video', fraction: 0.5, etaMs: 65000 }));
    expect(screen.getByText(t.export.phases.video)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: t.export.progress })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(`${t.export.remaining} ${formatDuration(65000)}`)).toBeInTheDocument();
  });

  it('erro conhecido aparece com o texto traduzido', async () => {
    startExportMock.mockImplementation(() => ({
      cancel: vi.fn(),
      result: Promise.reject(new Error('empty')),
    }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.export.emptyProject);
    expect(screen.getByRole('button', { name: t.export.start })).toBeInTheDocument();
  });

  it('ao concluir baixa o arquivo e mostra a confirmação', async () => {
    const blob = new Blob(['x'], { type: 'video/mp4' });
    startExportMock.mockImplementation(() => ({
      cancel: vi.fn(),
      result: Promise.resolve({ blob, fileName: 'Meu vídeo.mp4' }),
    }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    expect(await screen.findByText(t.export.done)).toBeInTheDocument();
    await waitFor(() => expect(downloadMock).toHaveBeenCalledWith(blob, 'Meu vídeo.mp4'));
  });

  it('o botão Cancelar chama cancel e mostra o aviso de cancelado', async () => {
    const cancel = vi.fn();
    let rejectResult: (error: Error) => void = () => undefined;
    startExportMock.mockImplementation(() => ({
      cancel,
      result: new Promise((_resolve, reject) => {
        rejectResult = reject;
      }),
    }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    fireEvent.click(screen.getByRole('button', { name: t.export.cancel }));
    expect(cancel).toHaveBeenCalled();
    await act(async () => rejectResult(new Error('cancelled')));
    expect(screen.getByText(t.export.cancelled)).toBeInTheDocument();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('Esc fecha o diálogo quando não está exportando', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
  it('ao iniciar, o foco vai para o botão Cancelar', () => {
    startExportMock.mockImplementation(() => ({ cancel: vi.fn(), result: new Promise(() => undefined) }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    expect(screen.getByRole('button', { name: t.export.cancel })).toHaveFocus();
  });

  it('ao concluir, o foco vai para o botão Baixar arquivo', async () => {
    startExportMock.mockImplementation(() => ({
      cancel: vi.fn(),
      result: Promise.resolve({ blob: new Blob(['x']), fileName: 'a.mp4' }),
    }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    await screen.findByText(t.export.done);
    expect(screen.getByRole('button', { name: t.export.download })).toHaveFocus();
  });

  it('em erro, o foco vai para o botão de tentar de novo', async () => {
    startExportMock.mockImplementation(() => ({ cancel: vi.fn(), result: Promise.reject(new Error('generic')) }));
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: t.export.start }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: t.export.start })).toHaveFocus();
  });

  it('teclas que não são Tab nem Esc não chegam aos atalhos globais', () => {
    const listener = vi.fn();
    window.addEventListener('keydown', listener);
    try {
      renderDialog();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Delete' });
      fireEvent.keyDown(screen.getByRole('dialog'), { key: ' ' });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });

  it('mostra o aviso de arquivo grande quando a estimativa passa de 1,5 GB', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: 'mp4', bitrate: 'custom', customBitrateMbps: 200 }));
    const project = { ...createProject('Grande'), durationMs: 600_000 };
    render(<ExportDialog project={project} onClose={vi.fn()} />);
    expect(screen.getByText(t.export.largeFileWarning)).toBeInTheDocument();
  });
});
