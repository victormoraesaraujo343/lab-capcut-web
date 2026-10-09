# PROMPT — Editor de vídeo no navegador (clone do CapCut, tudo liberado)

> Cole este prompt inteiro no Claude Code, na pasta vazia `capcut-web/`.
> Ele foi escrito pra ser executado por um **orquestrador** (Sonnet) que delega pra **vários agentes pequenos** (Haiku) trabalhando em paralelo.

---

## 0. Missão

Construir um editor de vídeo que roda **100% no navegador**, sem servidor, sem conta, sem paywall, sem marca d'água, sem limite de exportação. Referência de produto: **CapCut desktop**. Tudo que lá é "Pro" aqui é gratuito e desbloqueado.

Resultado esperado ao final: abro `npm run dev`, arrasto vídeos pra dentro, edito na linha do tempo, aplico texto/transições/filtros/efeitos/velocidade/música, e exporto um `.mp4` 1080p que abre em qualquer player. Tudo offline, tudo salvo no próprio navegador.

Idioma da interface: **português do Brasil**. Tema: escuro por padrão, com opção clara.

---

## 1. Como o enxame trabalha (regras de orquestração)

Você é o **orquestrador**. Você NÃO escreve código de produto. Você:

1. Lê este documento inteiro antes de qualquer ação.
2. Executa as **etapas da seção 4 na ordem**, uma por vez. Não pula etapa. Não começa a próxima antes do "Pronto quando" da atual passar.
3. Pra cada etapa, quebra o trabalho em **tarefas de 1 arquivo (ou 1 módulo pequeno)** e dispara um agente `haiku` por tarefa, em paralelo quando as tarefas não dependem uma da outra.
4. Cada tarefa dada a um agente pequeno segue **o modelo de tarefa da seção 2**. Sem exceção.
5. Depois que os agentes de uma etapa terminam, dispara **um agente revisor** (`sonnet`) que roda build + testes + checklist do "Pronto quando". Se falhar, o revisor descreve o defeito com precisão e você dispara um agente de correção com essa descrição. Repete até passar. Máximo 3 rodadas; se não passar, você mesmo investiga e reparte a tarefa em pedaços menores.
6. Mantém um arquivo `PROGRESSO.md` na raiz: etapa atual, o que passou, o que falhou, decisões tomadas. Atualiza ao final de cada etapa. É a sua memória se o contexto estourar.
7. Ao final de cada etapa faz um commit: `etapa N: <nome>`.

Regras que você repassa a **todos** os agentes:
- **Proibido** placeholder, `TODO`, "implementar depois", função vazia, `any` no TypeScript, `console.log` esquecido.
- **Proibido** instalar biblioteca que não está na seção 3. Precisa de algo fora da lista → para e pergunta ao orquestrador.
- Cada arquivo tem **uma responsabilidade**. Passou de ~300 linhas → dividir.
- Toda função pública tem um comentário de 1 linha dizendo o que faz.
- Nomes de código em inglês; textos de interface em pt-BR num único arquivo de strings (`src/i18n/pt-BR.ts`).
- Nunca reescrever um arquivo que outro agente está mexendo. Cada tarefa lista os arquivos que ela **pode** tocar; fora disso, não toca.

---

## 2. Modelo de tarefa pra agente pequeno

Toda tarefa delegada a um agente `haiku` tem **exatamente** este formato. Modelos pequenos se perdem sem isso.

```
TAREFA: <nome curto>
ARQUIVOS QUE VOCÊ PODE CRIAR/EDITAR: <lista exata>
ARQUIVOS QUE VOCÊ DEVE LER ANTES (não editar): <lista exata>
O QUE FAZER: <3 a 10 linhas, passo a passo, sem ambiguidade>
INTERFACE QUE VOCÊ DEVE RESPEITAR: <assinaturas TypeScript copiadas de src/types/ — cole aqui>
PRONTO QUANDO:
  - `npm run typecheck` passa
  - `npm run test -- <arquivo.test.ts>` passa
  - <critério específico observável>
NÃO FAÇA: <2 a 5 armadilhas conhecidas desta tarefa>
```

Ao receber o resultado, o orquestrador confere se o agente ficou dentro dos arquivos permitidos. Se saiu, descarta e refaz.

---

## 3. Stack e arquitetura (decidido — não discutir, não trocar)

**Base**
- Vite + React 18 + TypeScript (strict).
- Estado global: **Zustand** (uma store por domínio: `project`, `timeline`, `playback`, `ui`).
- Estilo: CSS Modules + variáveis CSS pra tema. Sem Tailwind, sem UI kit.
- Testes: **Vitest** + Testing Library. Testes de lógica pura são obrigatórios; de UI, só o essencial.
- Persistência local: **IndexedDB via `idb`** pra projetos, **OPFS** (Origin Private File System) pra mídia importada. Nada sai do navegador.

**Motor de vídeo (o coração)**
- Decodificação e codificação: **WebCodecs** (`VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`).
- Demux/mux: **`mp4box.js`** pra ler MP4, **`mp4-muxer`** pra gravar MP4 (H.264 + AAC), **`webm-muxer`** pra WebM (VP9 + Opus).
- Fallback quando WebCodecs não existe (Firefox antigo): **`@ffmpeg/ffmpeg`** (wasm) só pra exportar. Preview continua com `<video>` nativo.
- Composição de frame: **WebGL2** via **`twgl.js`** (sem Three.js — é pesado demais pra isso). Cada frame da prévia e da exportação passa pela mesma função `renderFrame(composition, timeMs) → canvas`. **Uma só pipeline** pra prévia e pra exportar, pra o que você vê ser o que sai.
- Áudio: **Web Audio API** pra mixagem/preview; na exportação, mix offline com `OfflineAudioContext` e encode com `AudioEncoder`.
- Trabalho pesado roda em **Web Workers** (decode, render de export, geração de miniaturas e forma de onda). A thread principal só pinta UI.

**Texto e gráficos**
- Texto renderizado em canvas 2D → textura WebGL. Fontes: Google Fonts carregadas sob demanda, com 12 fontes pré-selecionadas offline (`public/fonts/`).
- Stickers/formas: SVG → textura.

**Estrutura de pastas (fixa)**
```
src/
  types/           # TODOS os tipos compartilhados. Criado na etapa 1. Agentes leem, não editam sem ordem.
  engine/          # decode, render, export, audio — sem React
    decode/
    render/        # shaders, compositor, efeitos
    export/
    audio/
    workers/
  stores/          # zustand
  features/        # uma pasta por área da tela (timeline, preview, media, inspector, export)
  components/      # componentes de UI genéricos (botão, slider, menu)
  i18n/
  utils/
tests/
public/fonts/
```

**Modelo de dados central** (vai em `src/types/project.ts`, escrito na etapa 1 — todo o resto depende dele):
- `Project { id, name, width, height, fps, durationMs, tracks: Track[], assets: Asset[] }`
- `Track { id, kind: 'video'|'audio'|'text'|'sticker'|'effect', clips: Clip[], muted, locked }`
- `Clip { id, assetId?, trackId, startMs, durationMs, trimInMs, trimOutMs, transform, speed, volume, keyframes, filters: Filter[], effects: Effect[], transitionIn?, transitionOut? }`
- `Asset { id, kind, name, opfsPath, durationMs?, width?, height?, thumbnails[] , waveform? }`
- `Keyframe<T> { timeMs, value: T, easing }`
- Todo efeito/filtro/transição é `{ type: string, params: Record<string, number|string|boolean> }` — registrados num **registro** (`engine/render/registry.ts`) pra que adicionar um novo seja criar 1 arquivo.

---

## 4. Etapas (executar na ordem; cada uma termina com commit)

### Etapa 1 — Esqueleto e tipos
- Vite+React+TS, ESLint, Vitest, scripts `dev/build/typecheck/test`.
- `src/types/*` completo (o modelo acima, com comentários).
- Stores vazias com tipos.
- Layout da tela: **painel de mídia** (esquerda), **prévia** (centro), **inspetor** (direita), **linha do tempo** (embaixo). Painéis redimensionáveis. Só casca, sem função.
- Tema escuro/claro com variáveis CSS. Strings em pt-BR.
- **Pronto quando:** build e typecheck passam; a casca aparece com os 4 painéis e alterna tema.

### Etapa 2 — Importar mídia
- Arrastar/soltar e botão "Importar": vídeo (mp4, mov, webm), áudio (mp3, wav, aac, m4a), imagem (jpg, png, gif, webp).
- Salvar no OPFS; extrair metadados (duração, resolução, fps); gerar miniaturas (vídeo: 1 a cada 2s) e forma de onda (áudio) **num worker**.
- Painel de mídia mostra cards com miniatura e duração. Busca por nome. Pastas simples.
- Projetos persistem no IndexedDB; tela inicial lista projetos (novo / abrir / duplicar / excluir / renomear).
- **Pronto quando:** importo 3 vídeos + 1 mp3 + 1 png, fecho a aba, abro de novo e está tudo lá.

### Etapa 3 — Linha do tempo
- Trilhas múltiplas, zoom (ctrl+scroll), rolagem, régua de tempo, cursor de reprodução, imã (snap) em bordas de clipes e no cursor.
- Arrastar mídia do painel pra timeline; mover, cortar (tecla `S` / lâmina), aparar pelas bordas, dividir, excluir, duplicar, copiar/colar, selecionar múltiplo, agrupar.
- Clipes mostram miniaturas (vídeo) ou forma de onda (áudio).
- Ripple delete (fecha o buraco) e inserção com empurrar.
- Desfazer/refazer ilimitado (histórico na store, baseado em patches).
- Atalhos do CapCut: espaço (play/pause), `S`/`ctrl+B` (dividir), `Delete`, `ctrl+Z/Y`, `ctrl+D` (duplicar), `Q/W` (aparar início/fim até o cursor), `[`/`]` (ir pra borda), `+`/`-` (zoom).
- **Pronto quando:** monto uma sequência de 5 clipes com cortes e ordem alterada e o desfazer volta cada passo.

### Etapa 4 — Prévia e reprodução
- Compositor WebGL: `renderFrame(project, timeMs)` desenha todas as trilhas visíveis respeitando ordem, transform (posição, escala, rotação, opacidade), recorte (crop) e proporção do projeto (9:16, 16:9, 1:1, 4:5, 4:3, livre).
- Decode com WebCodecs num worker, com cache de frames ao redor do cursor pra scrub fluido. Fallback `<video>` escondido quando WebCodecs falha.
- Áudio sincronizado com Web Audio (volume por clipe, mudo por trilha).
- Controles: play/pause, frame a frame, ir pro início/fim, loop, tela cheia, qualidade da prévia (1/4, 1/2, 1/1).
- Manipular o clipe **direto na prévia**: arrastar, redimensionar pelos cantos, girar.
- **Pronto quando:** 3 trilhas de vídeo sobrepostas tocam sincronizadas com áudio a 30fps numa máquina comum.

### Etapa 5 — Exportar
- Pipeline: pra cada frame → `renderFrame` → `VideoEncoder` → muxer. Áudio: mix offline → `AudioEncoder`. Roda num worker com barra de progresso, estimativa de tempo e cancelar.
- Presets: 720p/1080p/1440p/4K, 24/30/60fps, bitrate (baixo/médio/alto/personalizado), MP4 (H.264) ou WebM (VP9). GIF até 15s. Exportar só áudio (mp3/wav).
- Fallback ffmpeg.wasm se WebCodecs não existir.
- **Sem marca d'água. Sem limite.** Nunca.
- **Pronto quando:** exporto 1 min em 1080p30 e o arquivo abre no VLC e no WhatsApp com áudio sincronizado.

### Etapa 6 — Texto
- Adicionar texto; editar na prévia (duplo clique); fonte, tamanho, cor, contorno, sombra, fundo, espaçamento, alinhamento, opacidade.
- Predefinições de estilo (20 estilos prontos, estilo CapCut).
- Animações de entrada/saída/loop (fade, digitação, pop, deslizar, zoom, bounce, girar — 15 no total), com duração ajustável.
- **Legendas automáticas**: transcrição com **`@xenova/transformers` (Whisper tiny/base, roda no navegador)**, gera clipes de legenda por frase, editáveis. Isso aqui exceção à regra de biblioteca: está permitido.
- **Pronto quando:** gero legendas de um vídeo de 1 min, corrijo uma palavra, aplico estilo e exporto com elas gravadas.

### Etapa 7 — Transições, filtros, efeitos, velocidade
- Transições entre clipes adjacentes (arrasta da aba, duração ajustável): dissolver, escurecer, deslizar (4 direções), zoom, desfoque, wipe, glitch, girar — 15 no total. Implementadas como shaders no registro.
- Filtros de cor: 25 presets + ajustes manuais (brilho, contraste, saturação, temperatura, matiz, nitidez, vinheta, granulação, HSL por faixa). Com keyframes.
- Efeitos visuais: desfoque, pixelizar, espelhar, tremor, glitch, VHS, zoom pulsante, chroma key (fundo verde), máscaras (retângulo, círculo, linear, com pena e inversão) — 15 no total.
- Velocidade: constante (0.1x a 100x) e **curva** (editor de curva com presets: montagem, herói, bala, saltar, flash in/out). Áudio acompanha com pitch opcional.
- Keyframes em qualquer propriedade numérica (posição, escala, rotação, opacidade, volume, parâmetros de filtro), com easing e painel de curva.
- Congelar frame, inverter clipe, estabilizar (básico, por deslocamento), remover fundo (segmentação com `@xenova/transformers` — permitido).
- **Pronto quando:** cada item da lista tem um teste de render que compara um frame contra uma imagem de referência gerada.

### Etapa 8 — Áudio
- Biblioteca de áudio do projeto: importados + gravação pelo microfone direto na timeline.
- Fade in/out por alça no clipe, volume por keyframe, mudo, separar áudio do vídeo, redução de ruído (básica), **texto pra fala** com `speechSynthesis` do navegador (voz pt-BR), detecção de batidas (marca na timeline pra cortar no ritmo).
- Efeitos de voz: pitch, eco, reverb, robô, telefone (Web Audio nodes).
- **Pronto quando:** gravo um narração, coloco música com fade e exporto com os dois mixados.

### Etapa 9 — Stickers, formas, sobreposições
- Stickers SVG embutidos (100 básicos, licença livre), formas (retângulo, círculo, seta, linha) com preenchimento/contorno, sobreposições (luz vazada, poeira, chuva, neve — como shaders ou vídeo transparente).
- Upload de sticker próprio (png/svg/gif).
- **Pronto quando:** arrasto um sticker, animo com keyframe e exporto.

### Etapa 10 — Polimento e funcionalidades Pro liberadas
- Modelos de projeto (10 templates prontos: vlog, reels, tutorial, etc.).
- Exportar/importar projeto como `.zip` (json + mídia) pra levar pra outra máquina.
- Auto-save a cada 10s + recuperação após travamento.
- Pré-visualização de proxies (gera versão 540p pra timeline fluida, exporta no original).
- Atalhos configuráveis, painel de atalhos.
- Página de ajuda em pt-BR dentro do app.
- Performance: auditar com um projeto de 50 clipes em 5 trilhas; prévia precisa manter 30fps.
- Acessibilidade: tudo navegável por teclado, foco visível, contraste AA.
- **Pronto quando:** `npm run build` gera um site estático que funciona aberto do disco (file://) ou de qualquer host estático, e passa a auditoria de performance.

---

## 5. O que "nível CapCut" significa aqui (padrão de qualidade)

- Interface escura, densa mas respirada, ícones consistentes (use **`lucide-react`** — permitido), nada de "cara de protótipo".
- Nada acontece sem feedback: arrastar mostra fantasma, cortar mostra a lâmina, exportar mostra progresso real.
- Erros falam em português e dizem o que fazer ("Este formato não é suportado. Converta pra MP4 ou WebM.").
- Zero travamentos na thread principal acima de 50ms. Medir com `performance.mark`.
- Funciona no Chrome e Edge atuais (primeira classe) e no Firefox/Safari (com fallbacks).

---

## 6. Primeira ação do orquestrador

1. Criar `PROGRESSO.md` com as 10 etapas e marcar a 1 como "em andamento".
2. Disparar a etapa 1.
3. Não parar até a etapa 10 passar, a não ser pra perguntar algo que **só o dono do projeto** pode decidir (escolha de produto). Decisão técnica é sua.
