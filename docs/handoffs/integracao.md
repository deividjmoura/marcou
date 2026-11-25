# Handoff — integração e dívida técnica

Registro do agente de integração. Não substitui o `AGENT_TASK_MARCOU.md`, que
não foi editado nesta rodada.

## 2026-11-25 — triagem de PRs, B3, B4 e PR #32

### Estado verificado (não presumido)

- `main` = `67bb571` (CI verde em 24/11).
- O `AGENT_TASK_MARCOU.md` da `main` tem 160 linhas e foi atualizado em 23/11.
  As seções "ESTADO ATUAL CONSOLIDADO", o bloco JSON e "AUDITORIA GERAL +
  GOOGLE OAUTH — 16/11/2026" não existem mais na `main`: saíram na PR #49
  (`0f694a1`). A auditoria foi lida pelo histórico (`ec9dc3d`).
- Já mescladas: #45 (auditoria + OAuth, `033b090`), #36 (design system,
  `c6e5f1e`), #42, #4/#37. A #1 foi fechada sem merge.
- B3 e B4 da auditoria de 16/11 continuavam presentes na `main`.

### Entregas

| Item | Onde | Estado |
| --- | --- | --- |
| B3: `toCents` quebrava com `1.234,56` | PR desta branch (`arena/30a92c52-marcou`) | corrigido, com testes |
| B4: dono via ações do cliente em `/reserva/[id]` | mesma PR | corrigido, com testes |
| PR #32 sem a deleção do doc de continuidade e sem `docs/MOTION.md` | patch de 2 commits comentado na PR #32 | validado localmente; aguarda aplicação pelo responsável |

**B3 (`src/lib/money.ts`).** `parseBrlToCents` aceita ponto como milhar e
vírgula como decimal (`1.234,56`, `1234,56`, `50,5`), inteiros e o formato
`1234.56`, que o próprio formulário de edição gera com `toFixed(2)`. O cálculo
usa só inteiros, sem arredondamento de float. Entradas inválidas, negativas,
vazias ou ambíguas retornam erro claro em pt-BR. **Mudança de comportamento:**
campo vazio antes virava `0` silenciosamente; agora é rejeitado. Os inputs já
são `required`, então isso só afeta requisições forjadas.

**B4 (`src/app/reserva/[id]/reservation-role.ts`).** Os rótulos e ações por
papel ficam num módulo puro. O cliente mantém exatamente o comportamento
anterior. O dono vê as mesmas ações do painel: "Marcar comprovante recebido",
"Confirmar pagamento" e "Cancelar reserva do cliente". As duas actions antigas
viraram `reservationTransitionAction`, com lista fechada de eventos. A
autorização continua integralmente em `transition_booking`: a interface não
concede nem retira permissão.

### Não feito (fora do escopo ou impedido)

- **M4** (telefone obrigatório na reserva pública): decisão do responsável.
- **Avisos de status da página da reserva** ("Apresente-se no horário
  marcado", "O prestador precisa validar o sinal") continuam com o texto do
  cliente para o dono. A PR #68 reescreve esse bloco (`RESERVATION_FEEDBACK`);
  o ajuste por papel deve ser feito lá para não gerar conflito.
- **PR #32:** esta sessão só pode publicar na própria branch. Por isso não
  houve push em `feat/30-platform-hardening` nem branch nova. A versão
  corrigida foi comentada na PR #32 como patch aplicável com `git am`.
- Nenhum merge, deploy, migration remota, variável ou segredo foi alterado.

### Validação local desta branch (resultados reais)

`npm run lint` (0 erros; 3 avisos `<img>` já existentes na `main`),
`npm run typecheck`, `npm test` (19 arquivos, 199 testes; antes eram 117),
`npm run test:db` (69/0, social 47/0, identidade 28/0, descoberta 40/0),
`npm run audit` (0 falhas) e `npm run build`: todos aprovados em 25/11/2026.
