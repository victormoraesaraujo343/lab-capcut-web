# PROGRESSO — Editor de vídeo no navegador

Orquestrador: Opus 5.5. Agentes: Haiku (tarefas), Sonnet (revisor).

| Etapa | Nome | Estado |
|---|---|---|
| 1 | Esqueleto e tipos | ✅ passou |
| 2 | Importar mídia | ✅ passou |
| 3 | Linha do tempo | ✅ passou |
| 4 | Prévia e reprodução | ✅ passou |
| 5 | Exportar | em andamento |
| 6 | Texto | pendente |
| 7 | Transições, filtros, efeitos, velocidade | pendente |
| 8 | Áudio | pendente |
| 9 | Stickers, formas, sobreposições | pendente |
| 10 | Polimento e Pro liberado | pendente |

## Decisões e ocorrências
- 2026-10-09: início. Pasta de trabalho: `capcut-web/` dentro do repo `Experimentos`.
- 2026-10-09: orquestrador passou para Opus 5.5; agentes pequenos = Haiku 5.5 (pedido do dono).
- Etapa 1: tipos em `src/types/` prontos (6 testes). Em paralelo: stores, strings+tema, casca de 4 painéis.
- Decisão: `KeyframeMap = Record<string, Keyframe<number>[]>` (chave = propriedade, ex. `filter:<id>:<param>`).
- Etapa 1 revisada: typecheck/test(19)/build/lint ok. Única falha (import sem uso) corrigida. Conferido no navegador: 4 painéis + tema claro/escuro.
- Tema claro: acento #0e7490 (não #0891b2) pra passar contraste AA.
- Pendência pequena: texto dentro da caixa preta da prévia fica apagado no tema claro (some quando virar canvas na etapa 4).
- `src/types/project.ts` tem ~313 linhas: dividir (clip.ts) quando crescer.
- Etapa 2 passou. Teste real no navegador: 3 vídeos (mp4/mov/webm) + mp3 + png importados, página recarregada, tudo voltou com miniaturas e forma de onda. Revisor: PASSA. 163 testes.
- Arquivos de teste em `tests/fixtures/media/` (gerados com ffmpeg). Pra injetar no navegador: fetch de `/tests/fixtures/media/<nome>` + DataTransfer no input de arquivo.
- Decisão: `fake-indexeddb` como devDependency só de teste.
- Decisão: miniaturas = <video> faz seek na thread principal, worker codifica JPEG e grava no OPFS; onda = decodeAudioData na principal (não existe em worker), picos no worker.
- Decisão: mídia por projeto em `projects/<id>/media|thumbs`; duplicar copia a pasta e reescreve caminhos.
- Correções pós-revisão: importa direto na pasta, timeouts nas miniaturas, avisos de erro (toaster), soltar arquivo fora do painel não sai do app.
- Lição: depois de vários agentes editarem ao mesmo tempo, o servidor de dev pode ficar com módulo velho → reiniciar o preview.
- Etapa 3 passou (revisor rodada 2: PASSA; 377 testes). Navegador: 5 mídias soltas com ímã, arrastar com mouse, lâmina, reordenar com inserção, Ctrl+Z voltando cada passo.
- Decisão: inserir empurrando = segurar **Alt** (Ctrl fica pra seleção múltipla). Shift+Delete = excluir fechando espaço.
- Decisão: histórico = patches por trilha (referências imutáveis, sem cópia profunda). Remover mídia zera o histórico (evita desfazer ressuscitar clipe órfão).
- Contrato de medidas da timeline em `src/features/timeline/layout.ts` (escrito pelo orquestrador).
- ⚠️ Ocorrência: arquivos do OPFS do 1º projeto de teste sumiram (pastas ficaram). Não reproduzi com o app; suspeita de agente usando o navegador. Regra nova nas tarefas: agentes NÃO usam navegador. Vigiar.
- Menor pendente: miniaturas na timeline são 1 por slot de ~16:9 px, não por intervalo de 2s (ok por ora).
- Etapa 4 (em revisão): contrato `src/types/render.ts` (Layer, FrameProvider, Compositor) e `src/stores/previewOverrideStore.ts` escritos pelo orquestrador. Bibliotecas instaladas: mp4box@2.4.1, twgl.js@7.0.0.
- Lições WebCodecs (corrigidas pelo orquestrador, NÃO desfazer):
  1. Segurar VideoFrames que saem do VideoDecoder esgota o pool do hardware e o `flush()` nunca resolve → copiar (createImageBitmap → new VideoFrame) e fechar o original na hora (`detachFrame`).
  2. Depois de `flush()` o decodificador exige quadro-chave → não dar flush por pedido; alimentar amostras extras até o alvo sair (lookahead).
  3. Esperar `decodeQueueSize` baixar pode travar (o decodificador só solta quadro com mais entrada) → `waitForDequeue` com tempo limite.
  4. Pedido superado nunca responde null (camada pisca) → responde o quadro mais próximo. Na reprodução, responder do cache sem esperar a fila e decodificar 300 ms à frente por trás.
  5. Matriz da camada usa o tamanho do PROJETO (frameWidth/Height), não o da saída reduzida.
- Medição: navegador embutido escondido limita requestAnimationFrame a ~0,3/s → medir com laço próprio (await renderFrame) em vez de rAF. Resultado: 30/30 (mp4), 25/25 (mov), webm completo, atraso ≤23 ms, render 0,8 ms.
- WebM não tem demuxer (fora da lista de bibliotecas) → vai pelo <video> de fallback; busca quadro a quadro custa ~43 ms (ok pra exportar, ruim pra scrub). Possível melhoria futura: demuxer WebM próprio.
- Etapa 4 passou (revisor rodada 2: PASSA; 523 testes). Critério medido no navegador real com play pelo botão e janela visível: 3 trilhas de vídeo sobrepostas + música → 34,5 atualizações/s, maior pausa 23 ms, relógio de áudio 2005 ms em 2000 ms.
- Layout: `computeEditorLayout` encolhe/esconde painéis laterais pra prévia ter ≥360 px.
- Menores abertos (raros): corridas de closeAsset durante abertura de asset; <video> de fallback mudo continua tocando se o cursor sair de todos os clipes até a pausa.
