// Texto longo da página de ajuda, em pt-BR: seções com parágrafos e listas curtas.

/** Bloco de texto da ajuda: um parágrafo ou uma lista de itens. */
export type HelpBlock = { kind: 'text'; text: string } | { kind: 'list'; items: readonly string[] };

/** Seção da ajuda, com título e blocos de texto. */
export interface HelpSection {
  id: string;
  title: string;
  blocks: readonly HelpBlock[];
}

/** Cria um parágrafo. */
function text(value: string): HelpBlock {
  return { kind: 'text', text: value };
}

/** Cria uma lista de itens. */
function list(...items: string[]): HelpBlock {
  return { kind: 'list', items };
}

/** Seções da ajuda, na ordem do sumário. */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: 'inicio',
    title: 'Primeiros passos',
    blocks: [
      text('Na tela inicial, clique em Novo projeto. O editor abre com três áreas: mídia à esquerda, prévia no alto e linha do tempo embaixo.'),
      list(
        'Importe seus vídeos, áudios e imagens.',
        'Arraste a mídia da lista para a linha do tempo.',
        'Clique em um item da linha do tempo para ajustar as propriedades à direita.',
        'Quando terminar, clique em Exportar, no alto da tela.',
      ),
    ],
  },
  {
    id: 'importar',
    title: 'Importar mídia',
    blocks: [
      text('Clique em Importar ou arraste os arquivos para a área de mídia. Use pastas para organizar.'),
      list(
        'Vídeo: MP4, MOV ou WebM.',
        'Áudio: MP3, WAV, AAC ou M4A.',
        'Imagem: JPG, PNG, GIF ou WebP.',
      ),
    ],
  },
  {
    id: 'linha-do-tempo',
    title: 'Linha do tempo',
    blocks: [
      text('A linha do tempo mostra o que aparece em cada momento. A linha vertical é o cursor: tudo que você corta ou divide acontece nele.'),
      list(
        'S ou Ctrl+B divide o clipe no cursor.',
        'Q corta o início até o cursor. W corta o fim até o cursor.',
        'Delete apaga o clipe selecionado. Shift+Delete apaga e fecha o espaço.',
        'N liga e desliga o ímã, que encaixa os clipes nas bordas.',
        'Cada trilha pode ser silenciada, travada ou ocultada no seu cabeçalho.',
        'Ctrl+Z desfaz e Ctrl+Shift+Z refaz.',
      ),
    ],
  },
  {
    id: 'texto-legendas',
    title: 'Texto e legendas automáticas',
    blocks: [
      text('Na aba Texto, escolha um estilo pronto e depois edite o texto na prévia ou no painel de propriedades.'),
      text('Na aba Legendas, clique em Gerar legendas automáticas. Você escolhe entre um modelo rápido e um modelo melhor, porém maior. Depois, clique em uma legenda para corrigir o texto.'),
    ],
  },
  {
    id: 'efeitos',
    title: 'Efeitos, filtros e transições',
    blocks: [
      list(
        'Efeitos: aplique um efeito a um clipe pela aba Efeitos. A intensidade fica no painel de propriedades.',
        'Filtros: mudam as cores do clipe. Você pode ajustar o resultado com os controles do painel.',
        'Transições: arraste uma transição para a emenda entre dois clipes.',
      ),
    ],
  },
  {
    id: 'velocidade',
    title: 'Velocidade e pontos-chave',
    blocks: [
      text('Em Velocidade, deixe o clipe mais lento ou mais rápido. Em velocidades muito baixas ou muito altas, o som do clipe pode ficar sem som, porque o navegador não toca nesses extremos.'),
      text('Pontos-chave fazem um valor mudar ao longo do tempo. Marque o valor em um momento, depois marque outro valor em outro momento. O programa cria a transição entre os dois.'),
    ],
  },
  {
    id: 'audio',
    title: 'Áudio',
    blocks: [
      list(
        'Música: escolha uma faixa na aba Áudio e arraste para a linha do tempo.',
        'Narração: grave sua voz pelo botão de gravação. O áudio entra na linha do tempo.',
        'Voz: aplique um efeito de voz ao clipe de áudio, na aba de propriedades.',
        'Batidas: em Detectar batidas, o programa procura o ritmo da música e mostra os pontos das batidas.',
        'Texto para fala: crie uma narração a partir de um texto.',
      ),
    ],
  },
  {
    id: 'sobreposicoes',
    title: 'Figurinhas, formas e sobreposições',
    blocks: [
      list(
        'Figurinhas: escolha na aba Figurinhas e arraste para a prévia.',
        'Formas: formas prontas, com cor e tamanho ajustáveis.',
        'Sobreposições: poeira, chuva, neve, grão de filme, vazamento de luz e brilhos de luz. Elas ficam por cima do vídeo.',
      ),
    ],
  },
  {
    id: 'exportar',
    title: 'Exportar',
    blocks: [
      list(
        'MP4: o formato mais usado. Use para redes sociais e para assistir em qualquer aparelho.',
        'WebM: outro formato de vídeo. Use se o MP4 não funcionar no seu navegador.',
        'GIF: animação sem som, com no máximo 15 segundos.',
        'WAV e MP3: só o áudio do projeto.',
      ),
      text('Dicas: para vídeo, 1080p e 30 fps já ficam bons e o arquivo é menor. Resoluções de 4K pedem um computador mais forte. Arquivos muito grandes mostram um aviso antes de começar.'),
    ],
  },
  {
    id: 'projetos',
    title: 'Projetos',
    blocks: [
      list(
        'Salvamento automático: o projeto é salvo sozinho pouco depois de cada alteração. Não é preciso apertar nenhum botão.',
        'Voltar a um projeto: abra a tela inicial e clique nele. Ele aparece como você deixou.',
        'Duplicar, renomear e excluir: use o menu de cada projeto na tela inicial. Excluir apaga também a mídia do projeto e não pode ser desfeito.',
        'Trocar de computador: na tela inicial, abra o menu do projeto e escolha "Exportar projeto (.zip)". No outro computador, use "Importar projeto" e escolha esse arquivo. A mídia vai junto.',
      ),
    ],
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    blocks: [
      text('Tudo roda no seu computador. Seus vídeos e áudios não são enviados para nenhum servidor.'),
      text('Única exceção: as legendas automáticas e a remoção de fundo baixam um modelo de inteligência artificial. Isso acontece só na primeira vez e precisa de internet.'),
    ],
  },
  {
    id: 'problemas',
    title: 'Problemas comuns',
    blocks: [
      list(
        'Navegador: use o Chrome ou o Edge atualizados. Outros navegadores podem não ter tudo o que o editor precisa.',
        'MP4 sem som: em alguns Linux, o áudio do MP4 pode sair sem som. Nesse caso, exporte em WebM.',
        'Pouco espaço: o navegador tem um limite para guardar mídia. Se aparecer aviso de espaço, exclua projetos antigos.',
        'Legendas que não aparecem: confira a internet na primeira vez, porque o modelo precisa ser baixado.',
      ),
    ],
  },
];
