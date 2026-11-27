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

## 7. Atualização de auditoria — 2026-11-27T23:18:02Z

Entrega conforme `docs/FECHAMENTO-AGENTES.md` (seções 0 e 9) e a entrada `agent_6_r7_coordinator`. Nenhum PR foi mergeado por este agente: a entrada não atribui PR a ele, e a seção 9 limita o Agente 6 a auditar, manter a ordem de merges e limpar branches ao final.

### 7.1 Estado da `main` e merges novos

- `main` avançou de `5b4e894` para **`90b05aa`**: #138 (`44ed540`, plataforma/CI/schedulers, substitui a #32) e #137 (`90b05aa`, docs/autorização r7).
- **Validação independente em `90b05aa`** (clone limpo, sem alterações de código): `check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db` e `build` — todos exit 0.
- CI no GitHub: `quality` verde em `44ed540` e `90b05aa`.
- #138 não altera migrations, nem `.env.example` com valores; `ci.yml` mantém todos os gates e remove só o `audit` duplicado.
- **PR #32 fechada sem merge** (23:11Z) como substituída pela #138, com comentário de fechamento. Nenhuma divergência encontrada.

### 7.2 Estado das PRs abertas (GitHub, agora)

Abertas (9): #136 (draft, MERGEABLE), #133 (CONFLICTING), #131 (CONFLICTING), #130 (draft, CONFLICTING), #127 (MERGEABLE), #124 (CONFLICTING), #68 (draft, CONFLICTING), #67 (draft, MERGEABLE), #41 (draft, CONFLICTING).

Fechadas desde a auditoria anterior: #46 e #2 (agente 5), #32 (agente 3, substituída pela #138).

Merges da rodada 7 até agora: somente #137 e #138 (ambas de documentação/plataforma, sem tocar em reservas ou autenticação). Nenhum merge dos Agentes 1, 2 ou 4 ainda.

### 7.3 Alegações dos agentes r7 verificadas

| Agente | Alegação | Verificação |
|---|---|---|
| 3 | #138 mergeada em `44ed540`, #32 substituída | **Confirmado** (merge SHA e fechamento da #32 conferidos) |
| 2 | #127 atrasada (9 à frente / 16 atrás) e bloqueada por rede no ambiente dele | **Confirmado** o divergir (`cc212db`, `mergeable=MERGEABLE`, 16 commits atrás de `90b05aa`). A PR continua não integrada. |
| 5 | #46 e #2 fechadas com evidência | **Confirmado** (ambas `CLOSED`). Evidência de conteúdo não auditada aqui. |
| 1, 4 | "nenhum trabalho iniciado" (rodada 7) | Nenhum merge; #131 continua `CONFLICTING`. Branch `fix/131-multi-services-r7` existe, apontando para `90b05aa`, sem PR ainda. |

### 7.4 Candidatas à limpeza (A6-T2) — deleção **adiada** para a Onda 4

Critério: PR `MERGED` + tip remoto igual ao `headRefOid` + diff vazio nos arquivos da PR em relação à `main`.

- `arena/fdad472c-marcou` (PR #138, merge `44ed540`): **atende** (8 arquivos da PR idênticos na `main`; tip `39855f0`).
- `docs/runbook-r7-autonomia` (PR #137, merge `90b05aa`): **atende** (1 arquivo idêntico; tip `c5d03e5`).

Não apagadas agora: o runbook (seção 3, Onda 4) manda limpar só depois dos merges da rodada. Outras candidatas da lista do A6-T2 (`feat/24-provider-agenda`, `fix/booking-transition-test-wiring`, `fix/booking-expiration-scheduler`) **não existem mais no remoto**; ficam fora.

Branches com PR fechada sem merge, a decidir pelo responsável: `arena/4017109f-marcou` (#123), `arena/9e68c2bb-marcou` (#126, tip diverge do último head), `feat/30-platform-hardening` (#32, o agente 3 pede preservar o texto de `docs/MOTION.md` para a Issue #27), `feat/customer-account-area` (#48), `feat/pagina-publica-agendamento` (#1), `feat/calendario-mobile` (#2), `arena/116298da-marcou` (#46), `fix/auth-recovery-redirect-production` (#71), `fix/security-definer-execute-grants` (#41, ainda aberta).

Sem PR e com trabalho possivelmente exclusivo, preservar: `arena/29-calendar-integration`, `arena/3b7c9d2f-marcou` (o agente 3 marcou como APAGAR por duplicação; confirmar antes), `arena/6f3a9b1f-marcou`, `arena/9c0da280-marcou`, `cc212db`, `feat/21-booking-multiple-services`, `feat/29-google-calendar-sync`, `fix/29-oauth-state-atomic`, `fix/booking-transition-concurrency-incremental`, `fix/calendar-callback-fail-closed-worker-fencing`, `coordination/agents` (preservar sempre). `fix/131-multi-services-r7` está em `90b05aa` (sem commits próprios) e é nova; não apagar até o agente 1 decidir.

### 7.5 Limitação de escrita no `state.json`

A sessão só permite enviar para `arena/3938e7c2-marcou`. Não consigo empurrar para `coordination/agents`. Por isso a entrada abaixo fica aqui, para o responsável copiar ou para o coordenador aplicar quando necessário:

```json
{
  "agent_6_r7_coordinator": {
    "status": "in_progress_waiting_for_merges",
    "head_sha": "90b05aa (main); branch arena/3938e7c2-marcou em b681450",
    "tests": "main 90b05aa: check:changelog, lint, typecheck, audit, test, test:db, build = exit 0 (clone limpo)",
    "merges_verified": ["#137 (90b05aa)", "#138 (44ed540)"],
    "closed_verified": ["#32 substituída por #138", "#46", "#2"],
    "branches_deleted": [],
    "branches_candidates_verified": ["arena/fdad472c-marcou", "docs/runbook-r7-autonomia"],
    "blockers": ["escrita no state.json bloqueada pela sessão (apenas branch próprio)", "#127 atrasada e sem checkout do agente 2"],
    "next_action": "Aguardar merges de #131, #127, #124, #136, #68, #67, #130, #133 e #41 (ordem da seção 3). Depois: verificar cada merge, limpar branches verificadas (Onda 4) e publicar relatório final."
  }
}
```

## 8. Pergunta sobre release (adiada)

Sem mudança desde a seção 6: não recomendo release agora. Só será formulada no relatório final, depois da Onda 3.
