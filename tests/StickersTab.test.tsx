// Testes da aba Stickers: 100 figurinhas com Todos primeiro, busca por nome, filtro por categoria e clique que adiciona no cursor.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StickersTab } from '@/features/library/StickersTab';
import { STICKERS } from '@/engine/stickers/stickerCatalog';
import { t } from '@/i18n/pt-BR';
import { addSticker } from '@/stores/stickerCommands';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:mock')),
}));

vi.mock('@/stores/stickerCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/stickerCommands')>();
  return { ...actual, addSticker: vi.fn(() => Promise.resolve(null)) };
});

/** Grade de figurinhas (o grupo com o nome da aba). */
function grid(): HTMLElement {
  return screen.getByRole('group', { name: t.library.tabs.stickers });
}

describe('StickersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra as 100 figurinhas do catálogo e a categoria Todos primeiro', () => {
    render(<StickersTab />);
    expect(STICKERS).toHaveLength(100);
    expect(within(grid()).getAllByRole('button')).toHaveLength(100);
    const chips = screen.getByRole('group', { name: t.stickers.categoriesLabel });
    expect(within(chips).getAllByRole('button')[0]).toHaveTextContent(t.stickers.all);
  });

  it('busca filtra pelo nome da figurinha', () => {
    render(<StickersTab />);
    fireEvent.change(screen.getByRole('searchbox', { name: t.library.searchItems }), { target: { value: 'coração' } });
    expect(within(grid()).getAllByRole('button')).toHaveLength(3);
  });

  it('categoria filtra a grade e Todos volta a mostrar tudo', () => {
    render(<StickersTab />);
    const chips = screen.getByRole('group', { name: t.stickers.categoriesLabel });
    fireEvent.click(within(chips).getByRole('button', { name: t.stickers.categories.food }));
    const foodCount = STICKERS.filter((def) => def.category === 'food').length;
    expect(within(grid()).getAllByRole('button')).toHaveLength(foodCount);

    fireEvent.click(within(chips).getByRole('button', { name: t.stickers.all }));
    expect(within(grid()).getAllByRole('button')).toHaveLength(100);
  });

  it('clicar numa figurinha chama addSticker com o id dela', () => {
    render(<StickersTab />);
    fireEvent.click(screen.getByAltText(t.stickers.names.smile));
    expect(addSticker).toHaveBeenCalledWith('smile');
  });
});
