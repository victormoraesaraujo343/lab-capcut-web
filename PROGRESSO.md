# PROGRESSO — Editor de vídeo no navegador

Orquestrador: Opus 5.5. Agentes: Haiku (tarefas), Sonnet (revisor).

| Etapa | Nome | Estado |
|---|---|---|
| 1 | Esqueleto e tipos | ✅ passou |
| 2 | Importar mídia | ✅ passou |
| 3 | Linha do tempo | em andamento |
| 4 | Prévia e reprodução | pendente |
| 5 | Exportar | pendente |
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
