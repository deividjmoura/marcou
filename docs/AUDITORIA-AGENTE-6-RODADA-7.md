# Auditoria independente e relatório — Agente 6 (Rodada 7)

> Status: **baseline e inventário de branches** (tarefas A6-T1 e parte de A6-T3 do runbook `docs/FECHAMENTO-AGENTES.md`).
> Limpeza final (A6-T2/T4) e consolidação no `state.json` ficam para depois que a Onda 3 terminar.
> Snapshot verificado em 2026-11-27 (UTC), `main` = `5b4e8943de079703120cdac681347fde724252fc`.

## 1. Baseline da `main` (SHA exato `5b4e894`)

Validação local executada do zero (`npm install --no-audit --no-fund --legacy-peer-deps`, depois a sequência do runbook), sem alterar código:

| Comando | Resultado |
|---|---|
| `npm run check:changelog` | OK |
| `npm run lint` | OK |
| `npm run typecheck` | OK |
| `npm run audit` | OK — 0 falha(s), 0 aviso(s) |
| `npm run test` | OK — 29 arquivos, 230 testes passando |
| `npm run test:db` | OK — legado 80/0, social 47/0, identidade 32/0, discovery 40/0, privilégios 25/0 (booking-concurrency incluído na cadeia) |
| `npm run build` | OK |

Observação: os trechos `FAIL`/`Failing row` no log de `test:db` são saídas esperadas de cenários negativos do próprio harness (violação de constraint provocada de propósito), não falhas.

Nota de divergência: o `state.json` diz 13 PRs abertas; o GitHub hoje mostra **12**. Vale o estado do GitHub (regra do próprio `state.json`).

## 2. Estado do GitHub (verificado agora)

**PRs abertas (12):**

| PR | Draft | Mergeable | Branch | Observação |
|---|---|---|---|---|
| #136 | sim | MERGEABLE | `fix/125-privileges-check-ci` | depende da decisão de migration da #131 |
| #133 | não | CONFLICTING | `arena/f074e752-marcou` | OWNER_DECISION (revisão do responsável) |
| #131 | não | CONFLICTING | `fix/booking-multiple-services-pr123` | P0; destrava #136, #124, #68 |
| #130 | sim | CONFLICTING | `fix/auth-recovery-preview-origin` | depende de #127 |
| #127 | não | MERGEABLE | `arena/18c3a3fa-marcou` | próxima na fila |
| #124 | não | CONFLICTING | `arena/30a92c52-marcou` | após #131 |
| #68 | sim | CONFLICTING | `feat/booking-flow-confirmation-success` | após #124/#131 |
| #67 | sim | MERGEABLE | `design/identidade-visual` | após atualização |
| #46 | não | CONFLICTING | `arena/116298da-marcou` | provável superada; fechar com evidência |
| #41 | sim | CONFLICTING | `fix/security-definer-execute-grants` | provável superada por #117/#135 |
| #32 | não | CONFLICTING | `feat/30-platform-hardening` | triagem: reaproveitar ou fechar |
| #2 | sim | MERGEABLE | `feat/calendario-mobile` | provável superada |

**PRs já mescladas e confirmadas pelo GitHub** (todas com branch já removida): #128, #129, #134, #135, #38, #39, #117, #122, #118, #119, #120, #114–#116, entre outras.

**PRs fechadas sem merge:** #123, #126 (substituída por #135), #71, #69, #48, #1.

Issues abertas (excluindo PRs): **63**.

## 3. Inventário de branches remotas

Remotas hoje: **28** refs (incluindo `main`). A branch local `arena/3938e7c2-marcou` (sessão atual) não existe no remoto.

**Verificação de integração:** nenhuma das 27 branches não-`main` é ancestral da `main`. Como a `main` usa squash merge, ancestralidade não serve de prova. A comparação de árvore também não prova integração: cada branch difere da `main` em dezenas a centenas de arquivos por causa de bases antigas e reversões. Portanto, **nenhuma branch remota atende ao critério "GitHub confirma merged e todos os commits exclusivos estão no merge"**.

Classificação:

**A. Preservar — PR aberta (12):** `arena/116298da-marcou` (#46), `arena/18c3a3fa-marcou` (#127), `arena/30a92c52-marcou` (#124), `arena/f074e752-marcou` (#133), `design/identidade-visual` (#67), `feat/booking-flow-confirmation-success` (#68), `feat/calendario-mobile` (#2), `feat/30-platform-hardening` (#32), `fix/security-definer-execute-grants` (#41), `fix/auth-recovery-preview-origin` (#130), `fix/booking-multiple-services-pr123` (#131), `fix/125-privileges-check-ci` (#136).

**B. Preservar — PR fechada sem merge (5):** `arena/4017109f-marcou` (#123), `arena/9e68c2bb-marcou` (#126), `feat/customer-account-area` (#48), `feat/pagina-publica-agendamento` (#1), `fix/auth-recovery-redirect-production` (#71). Só o responsável decide se o trabalho é descartado. `arena/9e68c2bb-marcou` é candidata a remoção, porque a #135 a substituiu, mas isso precisa de confirmação.

**C. Preservar — sem PR, trabalho possivelmente exclusivo (9):** `arena/29-calendar-integration`, `arena/3b7c9d2f-marcou`, `arena/6f3a9b1f-marcou`, `arena/9c0da280-marcou`, `cc212db`, `feat/21-booking-multiple-services` (Issue #21, migration ausente da `main`), `feat/29-google-calendar-sync` (conteúdo coberto pela #135, a confirmar), `fix/29-oauth-state-atomic`, `fix/booking-transition-concurrency-incremental`. Candidatas a remoção após triagem por autor/agente. `cc212db` (`38aab51`) tem o mesmo nome da PR #127 (que usa `arena/18c3a3fa-marcou` = `cc212db`); verificar se é duplicata antes de qualquer ação.

**D. Preservar por regra:** `coordination/agents` (`ee46aad`), branch de coordenação.

**E. Remoções feitas nesta rodada:** nenhuma. Não há branch comprovadamente integrada para apagar. Além disso, esta sessão só autoriza push para a própria branch, então a remoção de branches de outros agentes precisa de autorização explícita do responsável.

## 4. Verificação de segurança e integridade

- Árvore de trabalho limpa após todas as operações; nenhum arquivo rastreado foi alterado.
- Os seis arquivos staged locais do Calendar não foram lidos, alterados, movidos nem apagados.
- `node_modules` é ignorado pelo Git. Logs da validação ficaram em `/tmp`, fora do repositório.
- Nenhum segredo, token ou dado pessoal foi lido, copiado ou registrado neste relatório.
- Nenhum deploy, migration remota, alteração de Netlify/Supabase/Google/OAuth/SMTP ou branch protection.
- Nenhuma tag ou GitHub Release criada.

## 5. Pendências para o responsável

1. Autorizar ou recusar a remoção das branches das categorias B e C (ou indicar quais preservar).
2. Decisão sobre #133 (consolidação da arquitetura social; revisão exigida antes de qualquer merge).
3. Validação real da recuperação de senha e conferência do Supabase Auth (#130/#70), além da rotação das credenciais OAuth/SMTP que constam como expostas anteriormente.
4. Conexão real do Google Calendar, variáveis de produção e ativação de schedulers (`BOOKING_EXPIRATION_ENABLED`, lembretes, worker do Calendar).
5. Provisionamento de Supabase/cron/ambientes/deploy (#30, #20).
6. Priorizar ou manter como backlog o roadmap Marcou Social (#72–#112).

## 6. Pergunta sobre release (obrigatória por `AGENTS.md`)

**Recomendação: não publicar release agora.** Motivo: a `main` tem 12 PRs abertas, a #131 (P0) está em conflito e bloqueia três PRs, e a #136 está com `test:db` falhando na sua branch. A `main` atual passa em todas as validações, mas a entrega ainda não está completa.

Pergunta ao responsável: *Esta entrega (junto com as mudanças acumuladas desde a última release) já justifica publicar uma nova GitHub Release? Quer que eu prepare/publique uma versão agora?*

Resumo para a decisão: o conteúdo acumulado está no `CHANGELOG.md` em `[Unreleased]`; versão sugerida se houver release: `0.2.0` (SemVer, funcionalidades novas sem quebra); recomendo pré-release **beta** caso a decisão seja publicar antes da Onda 3; os testes da `main` estão verdes conforme a seção 1, com as limitações de não haver validação do fluxo OAuth real, de Google API nem de envio de e-mail.

Resposta: **não autorizado**. Nada foi publicado.
