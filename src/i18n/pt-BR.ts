// Textos da interface em português do Brasil. Acesse sempre via `t.grupo.chave`.
export const t = {
  app: {
    title: 'Editor de Vídeo',
    toggleTheme: 'Alternar tema',
    themeDark: 'Tema escuro',
    themeLight: 'Tema claro',
    export: 'Exportar',
  },
  panels: {
    media: 'Mídia',
    preview: 'Prévia',
    inspector: 'Propriedades',
    timeline: 'Linha do tempo',
  },
  media: {
    import: 'Importar',
    empty: 'Arraste vídeos, áudios e imagens para cá',
    search: 'Buscar mídia',
  },
  preview: {
    empty: 'Adicione mídia à linha do tempo para ver a prévia',
  },
  inspector: {
    empty: 'Selecione um clipe para editar suas propriedades',
  },
  timeline: {
    empty: 'Arraste mídia para cá para começar',
  },
  resize: {
    media: 'Redimensionar painel de mídia',
    inspector: 'Redimensionar painel de propriedades',
    timeline: 'Redimensionar linha do tempo',
  },
} as const;

export type Strings = typeof t;
