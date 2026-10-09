# PROGRESSO — Editor de vídeo no navegador

Orquestrador: Opus 5.5. Agentes: Haiku (tarefas), Sonnet (revisor).

| Etapa | Nome | Estado |
|---|---|---|
| 1 | Esqueleto e tipos | ✅ passou |
| 2 | Importar mídia | ✅ passou |
| 3 | Linha do tempo | ✅ passou |
| 4 | Prévia e reprodução | ✅ passou |
| 5 | Exportar | ✅ passou |
| 6 | Texto | ✅ passou |
| 7 | Transições, filtros, efeitos, velocidade | ✅ passou |
| 8 | Áudio | em andamento |
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
- Etapa 5 (em revisão). Critério cumprido pelo botão Exportar: 1 min 1080p30 MP4 → H.264 High + AAC-LC 48k estéreo, 60,000 s ambos, faststart, decodifica sem erro; 59 bipes com 0 ms de diferença vs original. WebM (VP9+Opus), GIF, WAV e MP3 validados com ffprobe. Exportação ~1,3× mais rápida que o tempo real.
- Decisões: (1) leitor de WebM próprio (EBML) — sem biblioteca permitida; serve prévia e exportação no worker; (2) Chromium Linux não codifica AAC → worker gera vídeo e ffmpeg.wasm junta AAC com `-c:v copy`; (3) núcleo do ffmpeg copiado para public/ffmpeg (scripts/copy-ffmpeg.mjs, predev/prebuild), nada de CDN; (4) @types/node só em tsconfig.node.json (vite.config) — não vaza para src; (5) plugin de dev `/__dev/save` grava exportações em tests/output para conferir com ffprobe.
- ⚠️ Bug grave corrigido pelo orquestrador: shader invertia a textura na vertical → prévia e exportação saíam de cabeça pra baixo. Lição: testar com fonte ASSIMÉTRICA (testsrc2 tem relógio no canto superior esquerdo) e comparar com o original via ffmpeg.
- VP9 perfil 1 (4:4:4) sem CodecPrivate: perfil lido do cabeçalho do 1º quadro-chave.
- Etapa 5 passou (revisor: PASSA). Menores corrigidos: corrida no cancelamento, reserva ffmpeg também para codec sem suporte, altura par no modo compatível, foco no diálogo, aviso de arquivo >1,5 GB.
- Etapa 6 preparada: 12 fontes livres copiadas do sistema para public/fonts (fonts.json + LICENCAS.md, 8 MB); vídeo de teste com fala sintética (tests/fixtures/media/fala-1min.mp4, voz flite em inglês).
- Etapa 6: decisão de biblioteca — o plano cita `@xenova/transformers`, mas ela está abandonada (2024) e trazia 5 alertas de segurança (1 crítico). Usado o sucessor oficial dos mesmos autores, `@huggingface/transformers@4.3.0` (0 alertas). Runtime ONNX servido de public/ort (scripts/copy-vendor.mjs). Modelo Whisper baixado do Hugging Face só na 1ª vez que pedem legendas e guardado no cache do navegador.
- Contrato etapa 6 (orquestrador): `Layer.fit` ('contain' | 'none'), `Layer.text`, `TextRasterizer` em types/render.ts; `ExportRequest.assetBaseUrl` (worker acha public/fonts).
- Etapa 6 passou (revisor rodada 2: PASSA; 840 testes). Critério feito pela interface: aba Legendas → 21 legendas em 6 s (Whisper tiny, modelo em cache), corrigida "previous"→"preview is" na lista (1 passo no histórico), estilo "Caixa preta" no inspetor, exportado MP4 com as legendas gravadas (conferido no quadro exportado).
- Corrigidos na etapa: topo das letras cortado (métricas ascendente/descendente), fonte reserva presa no cache (fontEpoch), opacidade dupla, legenda fora do quadro em 9:16 (TextData.maxWidth + quebra por palavra; fonte = 6% do menor lado), trilha de legendas marcada por `role: 'captions'`.
- Menores abertos: caixa de seleção pode usar medida da fonte reserva até a próxima mudança; editor inline não quebra linha igual ao desenho; maxWidth não se ajusta ao trocar o formato do projeto depois.
- Lição: depois de editar arquivos com o servidor de dev ligado, dados criados nessa sessão podem vir do código velho → reiniciar o servidor ANTES de criar dados de teste.
- Etapa 7 — contrato (orquestrador): convenção de shaders em src/engine/render/registry.ts (passes, overscan, uniforms u_texture/u_time/u_pass/u_matte; transições u_from/u_to/u_progress); Layer.matte e Layer.transition (camada que sai carrega a que entra); Asset.role ('matte'|'reversed'|'proxy') + sourceAssetId; chaves de keyframe 'fx:<id>:<param>'.
- Etapa 7 — teste de render: WebGL não existe no jsdom → página de testes de imagem (dev) rodada pelo orquestrador no navegador embutido, com referências PNG em tests/render-refs.
- Etapa 7 (parcial, commit intermediário): motor multipasso + 15 efeitos + 25 filtros + 15 transições + velocidade (curva, WSOLA p/ manter tom) + pontos-chave. Testes de imagem: 60/60 estáveis em 2 rodadas (página /render-tests.html; `?update=1` regrava referências).
- Bugs achados pelos testes de imagem: 'active' é palavra reservada em GLSL ES 3.00; transições 'blur'/'glitch' colidiam com efeitos de mesmo tipo (renomeadas blurCross/glitchCross; agora colisão lança erro + teste); runner lia largura de ImageBitmap fechado (0); fontes não carregadas deixavam a 1ª rodada instável.
- Lição: referência criada ≠ referência certa — olhar TODAS as imagens (folhas de contato) antes de confiar.
- ⚠️ Arquivos do OPFS sumiram 2ª vez (pastas ficam, conteúdo some; IndexedDB intacto). Investigação: as partições do navegador embutido do app Claude (~/.config/Claude/Partitions/launch-preview-*) NÃO têm "File System"/IndexedDB em disco → armazenamento só em memória; com muita mídia, o conteúdo é descartado. Não reproduzível por reinício do servidor nem pela página de testes. Conclusão: limitação do ambiente de teste. Mesmo assim (etapa 10): pedir `navigator.storage.persist()` e mostrar "mídia não encontrada — importe de novo/relink" em vez de quadro preto.
- Etapa 7 passou (revisor rodada 2: PASSA; 1124 testes). Critério: 105 testes de imagem (15 efeitos, 25 filtros, 15 transições, ajustes isolados, HSL por faixa, máscaras com/sem inversão, chroma, velocidades 0,1x–100x e 6 curvas, easings, keyframes de transform e de efeito, congelar, inverter, remover fundo com máscara, combinações) — todos conferidos a olho e estáveis.
- Verificado pela interface: P&B + VHS + transição Íris aplicados pelas abas e desenhados certo.
- Prévia preta com o painel escondido = navegador pausa requestAnimationFrame em aba oculta (normal); pra conferir com painel escondido, chamar renderFrame direto.
- Corrigidos: manter o tom (WSOLA) num worker com cache por trecho; inverter volta ao trecho original após recarregar (Asset.sourceTrimInMs/sourceSpanMs).
- Pendências p/ etapa 10: restaurar original de clipe invertido que foi dividido/aparado (espelhar trim); reaproveitar cópia invertida existente; AudioBuffer esticado por contexto em WeakMap; reagendar quando o trecho esticado fica pronto; cancelar pedidos de esticamento obsoletos ao arrastar o aparo; limpar assets gerados órfãos; navigator.storage.persist() + aviso de mídia ausente.
