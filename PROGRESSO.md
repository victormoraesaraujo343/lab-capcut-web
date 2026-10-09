# PROGRESSO — Editor de vídeo no navegador

Orquestrador: Sonnet. Agentes: Haiku (tarefas), Sonnet (revisor).

| Etapa | Nome | Estado |
|---|---|---|
| 1 | Esqueleto e tipos | ✅ passou |
| 2 | Importar mídia | em andamento |
| 3 | Linha do tempo | pendente |
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
