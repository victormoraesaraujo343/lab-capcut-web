// Filtro puro da biblioteca de mídia: pasta, busca por nome e ordem de criação.

import type { Asset } from '@/types/project';

/** Remove acentos e converte para minúsculas, para comparar textos sem diferenciar grafia. */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtra os assets pela pasta (null = todas) e pelo nome, sem diferenciar maiúsculas nem acentos; assets gerados (com role) ficam de fora; ordena do mais novo ao mais antigo. */
export function filterAssets(assets: Asset[], query: string, folderId: string | null): Asset[] {
  const needle = normalizeText(query.trim());
  const matches = assets.filter((asset) => {
    if (asset.role !== undefined) {
      return false;
    }
    if (folderId !== null && asset.folderId !== folderId) {
      return false;
    }
    return needle === '' || normalizeText(asset.name).includes(needle);
  });
  return matches.sort((a, b) => b.createdAt - a.createdAt);
}
