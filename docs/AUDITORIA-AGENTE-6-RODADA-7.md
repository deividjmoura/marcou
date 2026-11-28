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

## 9. Wave 2 — auditoria, migrations e limpeza (2026-11-28T00:02:38Z)

Escopo: W2-A6-T1 a T4 (`dispatch.wave_2` do `state.json`). Reconfirmados `main` (`03eb70c`), PRs e CI no GitHub antes de agir.

### 9.1 W2-A6-T1 — auditoria independente de #137, #138, #140, #141, #142

| PR | Merge SHA | CI no head | CI no merge | Conteúdo na main | Observação |
|---|---|---|---|---|---|
| #137 | `90b05aa` | quality + Netlify verdes | quality verde | 1/1 arquivo idêntico | — |
| #138 | `44ed540` | quality + Netlify verdes | quality verde | 8/8 arquivos da PR iguais ao head | substituiu #32 |
| #140 | `cd30f00` | quality + Netlify verdes | quality verde | arquivos iguais; 1 diferença explicada por edição posterior da #142 | substituiu #133 |
| #141 | `cd6065a` | quality + Netlify verdes | quality verde | 14 arquivos; 2 diferenças explicadas por edições posteriores da #142 | fecha #29 com evidência |
| #142 | `4badea4` | quality + Netlify verdes | quality verde | 14/14 arquivos iguais ao head | **fechou #21 automaticamente** (ver 9.3) |

Além disso, a PR #127 (`82af750`) e a PR #143 (`03eb70c`), mergeadas depois, foram conferidas: árvore do merge = árvore do head (#127), CI verde nos dois SHAs de merge e nos heads.

**Validação local independente da `main` atual (`03eb70c`)**, clone limpo, todos exit 0: `check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db`, `build`.

**Validação local independente da PR #127 no head `f8977ca`** (antes do merge), todos exit 0.

### 9.2 Ordem das migrations da #142 (ponto pedido pelo coordenador)

Fato: a #142 adicionou `20261125120000_booking_multiple_services.sql` e `20261125130000_table_privileges_matrix.sql`, versões **menores** que `20261128000100` (última já na `main`). Isso viola o item "versão maior que a última da main" do checklist. O Agente 4 apontou o problema antes do merge; a tentativa de renumerar (`20261127120000`/`130000`, na #139) foi fechada.

Análise de risco (lendo o SQL, sem aplicar em banco):
- `20261125120000` redefine `create_booking` e `get_provider_schedule`. Nenhuma migration posterior redefine essas funções, e a checagem de idempotência/autorização de `create_booking` (`v_actor`, `forbidden`) foi mantida. Não encontrei dependência de objetos criados por migrations posteriores.
- `20261125130000` faz `REVOKE ALL` seguido de `GRANT` nas tabelas `notifications` e `booking_services`. O resultado final é o mesmo que a `20261125140000` (já na main) deixa. O bloco de `calendar_connections` é condicional (`to_regclass`), então funciona antes ou depois da migration do Calendar.
- Conclusão: o **esquema final deve ser igual** quando as migrations são aplicadas em ordem a partir do zero (é o que o CI faz, em ordem de nome). Em banco que já tenha aplicado `20261128000100`, a ordem fora de sequência **não foi testada** e a ferramenta de migrations pode recusar a aplicação sem opção explícita.
- **Não há migration corretiva a propor agora**: não encontrei quebra concreta, e migration mergeada não deve ser editada.
- Recomendação ao responsável: se o ambiente de produção **já** tiver aplicado migrations acima de `20261125130000`, aplicar `20261125120000` e `20261125130000` manualmente, nessa ordem, antes das demais, e documentar isso em `docs/TESTE-REAL-PRODUCAO.md` (W2-A3-T2). Recomendo também um teste futuro que aplique as migrations fora de ordem e compare o esquema com a ordem normal.

### 9.3 Achado: #21 fechada sem aceite comprovado

A issue #21 foi fechada em `23:31:12Z` pelo commit de merge da #142 (`Closes #21` na mensagem do squash), **sem comentário de evidência**. Critérios de aceite não comprovados:
- "Banco rejeita sobreposição, inclusive em requisições simultâneas": nenhum harness de `test:db` cobre `booking_services` (só o `privileges-check` cita a tabela). `booking-concurrency` não cobre multi-serviço.
- "Atualizar `AGENT_TASK_MARCOU.md` e documentação": nenhum arquivo desses foi alterado pela #142.
- "Preço e duração correspondem ao conjunto": testes de domínio existem (`aggregate.test.ts`), mas não há teste de integração no banco.

Não reabri a issue (é escopo do Agente 1 e exige decisão). Recomendação: reabrir #21 ou comentar as lacunas e manter como "parcial", ou o responsável aceitar o fechamento com justificativa. Registrado como achado de processo.

### 9.4 W2-A6-T2 — limpeza de branches (classificação com prova)

**Não executei nenhuma remoção de branch remoto nesta rodada.** A sessão só me autoriza a enviar para `arena/3938e7c2-marcou`, e apagar branches de outros agentes via `git push --delete` ou API seria escrita fora da minha branch. Os itens abaixo estão prontos para apagar assim que o responsável autorizar (ou se a regra da sessão mudar).

Já não existem no remoto (apagadas pelos próprios agentes ao integrar): `agent5/133-docs-main-reconciled`, `arena/fdad472c-marcou`, `docs/runbook-r7-autonomia`, `fix/139-multi-services-final`, `fix/calendar-callback-fail-closed-worker-fencing`.

**Prontas para apagar (prova):**

| Branch | Tip | Prova |
|---|---|---|
| `arena/18c3a3fa-marcou` | `f8977ca` | PR #127 MERGED (`82af750`); tip = headRefOid; árvore do merge igual ao head |
| `arena/f074e752-marcou` | `d469ce8` | PR #133 CLOSED como superada pela #140 (agente 5); todos os arquivos da PR existem na main |
| `arena/30a92c52-marcou` | `f320fe8` | PR #124 CLOSED como substituída pela #143 (agente 1, `03eb70c`) |
| `arena/3b7c9d2f-marcou` | `664cb5b` | disposição **APAGAR** registrada pelo Agente 3 (duplica o mecanismo canônico #128/#38) |
| `feat/29-google-calendar-sync`, `fix/29-oauth-state-atomic`, `arena/29-calendar-integration` | `b83e0cd`, `2f577e2`, `26baee9` | disposição **APAGAR** registrada pelo Agente 4 (Calendar integrado via #135/#141) |

**Preservar (com motivo):**
- `main`, `coordination/agents`, `arena/3938e7c2-marcou` (esta sessão).
- Branches de PR aberta: `arena/3938e7c2-marcou` não tem PR; as abertas são #136, #130, #144, #145, #146, #147 e seus heads.
- `fix/131-multi-services-r7` (`90b05aa`/`58b16fd`): **contém migrations `20261127120000` e `20261127130000` que a main não tem**; relevante para o item 9.2.
- `arena/9e68c2bb-marcou` (#126 fechada): contém `docs/handoffs/21-booking.md` e `docs/handoffs/privilegios-tabelas.md` que a main não tem. Aguarda o Agente 4 (W2-A4-T3).
- `arena/4017109f-marcou` (#123 fechada): aguarda o Agente 4 (W2-A4-T3).
- `arena/9c0da280-marcou`: disposição PRESERVAR registrada pelo Agente 4 (artefatos PR39/patches).
- `cc212db` (`38aab51`): não é ancestral da #127; sem prova de integração.
- `feat/21-booking-multiple-services`: contém arquivos que a main não tem; a issue #21 foi fechada, mas o fechamento é contestado (9.3).
- `feat/30-platform-hardening` (#32): preservar pedido pelo Agente 3 (texto de `docs/MOTION.md` para a Issue #27).
- `arena/6f3a9b1f-marcou`, `fix/booking-transition-concurrency-incremental`: todos os arquivos já existem na main, mas sem disposição registrada pelo dono; sem PR. Candidatas a apagar após confirmação do dono.
- Fechadas sem disposição explícita (preservar até decisão): `arena/116298da-marcou` (#46), `fix/security-definer-execute-grants` (#41), `feat/calendario-mobile` (#2), `feat/customer-account-area` (#48), `feat/pagina-publica-agendamento` (#1), `fix/auth-recovery-redirect-production` (#71).
- `cc212db`, `fix/booking-transition-concurrency-incremental`: ver acima.

### 9.5 W2-A6-T3 — fila de merges

- #127 (Agente 2): **mergeada** em `82af750` às 23:56:16Z. Verificada por mim (9.1). Não assumi a PR: o Agente 2 já tinha feito a atualização e a validação.
- #124 (Agente 1): **fechada e substituída** pela #143, mergeada em `03eb70c`. Verificada (9.1).
- Fila atual (revalidar antes de agir): #136, #130 (drafts/conflito), #144, #145, #146, #147 (abertas, de outros agentes). Não merguei nenhuma delas.

### 9.6 W2-A6-T4 — relatório e release

Relatório consolidado: as seções 1–9 deste documento. Pergunta de release (`AGENTS.md`), sem tag nem Release:

> Esta entrega (junto com as mudanças acumuladas desde a última release) já justifica publicar uma nova GitHub Release? Quer que eu prepare/publique uma versão agora?

Recomendação: **ainda não**. Motivos: #136, #130, #144 a #147 abertas; #21 fechada sem aceite comprovado; ordem das migrations da #142 sem teste fora de sequência; testes reais de produção pendentes (seção 7 do runbook). Sem autorização, nada foi publicado.

### 9.7 Incidentes de ambiente

- Durante a sessão, o workspace foi recriado a partir de um snapshot: o branch local voltou a `5b4e894` e o `node_modules` foi removido. O remoto `arena/3938e7c2-marcou` estava intacto em `af4e27a`. Restaurei o local com fast-forward para `af4e27a` (arquivo idêntico verificado), sem perda. Dependências reinstaladas.
- Não usei nenhuma branch além da minha.

### 9.8 Entrada para o `state.json` (não consigo empurrar para `coordination/agents`)

```json
{
  "agent_6_r7_coordinator": {
    "status": "wave_2_audit_done_cleanup_pending_authorization",
    "head_sha": "main=03eb70c; branch arena/3938e7c2-marcou=af4e27a",
    "tests": "main 03eb70c: check:changelog, lint, typecheck, audit, test, test:db, build = exit 0 (clone limpo). PR #127 f8977ca: idem = exit 0.",
    "merges_verified": ["#137 90b05aa", "#138 44ed540", "#140 cd30f00", "#141 cd6065a", "#142 4badea4", "#127 82af750", "#143 03eb70c"],
    "closed_verified": ["#21 (fechada por Closes no merge da #142; aceite NÃO comprovado: ver 9.3)", "#29 (comentário com evidências)", "#124 (substituída por #143)", "#133 (substituída por #140)"],
    "branches_deleted_by_me": [],
    "branches_ready_to_delete_pending_authorization": ["arena/18c3a3fa-marcou", "arena/f074e752-marcou", "arena/30a92c52-marcou", "arena/3b7c9d2f-marcou", "feat/29-google-calendar-sync", "fix/29-oauth-state-atomic", "arena/29-calendar-integration"],
    "blockers": ["escrita no state.json bloqueada pela sessão (apenas branch próprio)", "deleção de branches de outros agentes exige autorização explícita (regra da sessão)", "#21 fechada sem aceite: decisão do responsável ou do Agente 1"],
    "owner_decisions": ["ordem das migrations 20261125120000/130000 em produção (se já aplicada versão maior)", "reabrir ou aceitar fechamento da #21", "release: não recomendada agora"],
    "next_action": "Aguardar merges de #136, #130, #144-#147 com verificação independente; depois, com autorização, apagar as 7 branches prontas."
  }
}
```
