import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TemplatePicker } from '@/features/home/TemplatePicker';
import { createProjectFromTemplate } from '@/stores/projectActions';

vi.mock('@/stores/projectActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/projectActions')>()),
  createProjectFromTemplate: vi.fn(async () => 'novo-id'),
}));

describe('TemplatePicker', () => {
  beforeEach(() => {
    vi.mocked(createProjectFromTemplate).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('lista 11 opções: projeto em branco e os 10 modelos', () => {
    render(<TemplatePicker open onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(11);
  });

  it('não renderiza quando fechado', () => {
    render(<TemplatePicker open={false} onClose={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cria o projeto do modelo ao clicar e fecha', () => {
    const onClose = vi.fn();
    render(<TemplatePicker open onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    const vlogCard = within(dialog).getByRole('button', { name: /Vlog/ });
    fireEvent.click(vlogCard);
    expect(createProjectFromTemplate).toHaveBeenCalledWith('vlog');
    expect(onClose).toHaveBeenCalled();
  });

  it('fecha com Esc', () => {
    const onClose = vi.fn();
    render(<TemplatePicker open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
