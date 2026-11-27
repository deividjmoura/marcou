# Verificação de integridade — lock `FOR UPDATE` em `transition_booking`

Verificação **somente leitura** do repositório remoto (nenhum merge, deploy,
migration remota ou alteração de produção). Todo o trabalho experimental foi
feito em clones descartáveis em `/tmp`; o repositório só recebeu este relatório
e a atualização da minha entrada de coordenação.

## 1. SHAs

| Objeto | SHA | Observação |
|---|---|---|
| `main` | `69d02173653384e082476e7879ee9f33672dec72` | “Merge pull request #40” |
| branch desta sessão `arena/9c0da280-marcou` | `8228ffc45ba417f1a1d63498e1bb9d1b2d5bd491` | só artefatos em `patches/` |
| branch da correção original `arena/6f3a9b1f-marcou` | `6db76085bc866498a587b6346fc443480107a11a` | `6db7608`, 1 commit sobre `9b92451`, **sem PR** |
| PR #129 (head) | `a7ef67ae8547638ea9fabe7e8caf7d42b8e5a4d0` | branch `fix/booking-transition-concurrency`, MERGED em 2026-11-27T15:52:05Z |
| merge commit da PR #129 | `fb85d4d83…` | run #46028677004 success |

## 2. Estado da migration

- `supabase/migrations/20261127000000_booking_transition_concurrency_lock.sql`
  **está na `main`** (175 linhas), adicionada pelo commit
  `d59a81db0d387095e249b1870b50c19c55d50499` — “fix(booking): bloqueia linha
  com FOR UPDATE via migration incremental” — integrado pela PR #129.
- É a **última** migration na ordem do diretório (nada a redefine depois).
- Conteúdo: `CREATE OR REPLACE FUNCTION public.transition_booking(...)` com
  `FOR UPDATE` nas **duas** leituras da reserva, `SECURITY DEFINER`,
  `search_path` fixo, `REVOKE ... FROM public, anon` e `GRANT ... TO authenticated`.
- Diff da função ativa contra a definição anterior
  (`20261116035000_fix_booking_idempotency_authorization.sql`): **apenas** os
  dois `for update`, comentários e uma quebra de linha em `) returns`.
  Autorização, ownership, expiração, pagamento, idempotência e auditoria
  preservados — nenhuma regra de negócio alterada.

## 3. Histórico de migrations

- **Não houve edição de migration já aplicada.** `git log` do arquivo mostra um
  único commit (`d59a81d`, `--diff-filter=A`) e nenhum posterior.
- O commit `d59a81d` toca exatamente 3 arquivos: a migration nova,
  `scripts/booking-concurrency.mjs` (novo) e `scripts/db-check.mjs` (+1 linha
  incluindo a migration na lista aplicada).
- `20261116035000_fix_booking_idempotency_authorization.sql` na `main` continua
  **sem** `FOR UPDATE` (0 ocorrências) — a história aplicada foi preservada.
- A abordagem da branch antiga (`6db7608`) era o oposto: alterava 2 trechos da
  migration **já aplicada** (`M supabase/migrations/20261116035000_…`). Foi
  substituída pela versão incremental; a branch não tem PR e **não deve** ser
  mergeada (reintroduziria a reescrita de migration aplicada).
- Cadeia completa reaplicada do zero em PostgreSQL 18.6 limpo: **11/11
  migrations aplicadas sem erro**; reaplicar a migration incremental também não
  falha (`CREATE OR REPLACE` + grants idempotentes) e mantém os 2 locks.

## 4. Testes executados

| Suíte | Onde | Resultado |
|---|---|---|
| `node scripts/booking-concurrency.mjs` | `main` `69d0217` | **25 passou, 0 falhou** |
| `node scripts/booking-concurrency.mjs` | branch `6db7608` | **21 passou, 0 falhou** (número do relato original) |
| `npm run test:db` | `main` `69d0217` | db 69/0, social 47/0, identidade 32/0, discovery 40/0 |
| `npm test` | `main` `69d0217` | 150 testes |
| verificação independente (`lock` real) | `main` `69d0217` | **16/16** |

O relato “21/21” corresponde ao script da **branch**; o código atual da `main`
tem 4 verificações a mais (25). Não é regressão — é cobertura maior.

### Verificação independente (clones descartáveis, 16/16)

1. Cadeia completa de migrations aplicada (11/11) e migration incremental presente.
2. Função ativa: `SECURITY DEFINER`, `search_path` fixo, **exatamente 2**
   `FOR UPDATE`, lock adquirido **antes** da validação de autorização.
3. Privilégios reais: `anon` sem `EXECUTE`, `authenticated` com `EXECUTE`
   (`service_role` sem `EXECUTE` — comportamento herdado do hardening, inalterado).
4. Duas sessões independentes + transições incompatíveis (`proof_received` × 2):
   a segunda **fica bloqueada** enquanto a primeira mantém a transação aberta,
   depois é rejeitada com `invalid_transition`; estado final `pending_review`;
   `booking_events` = 2 (criação + transição vencedora) → **rollback íntegro,
   sem efeito parcial da sessão perdedora**.
5. **Controle negativo**: reinstalada a definição antiga (sem `FOR UPDATE`), a
   mesma disputa produz **efeito duplicado** (3 eventos de auditoria, segunda
   sessão “vence” sobre estado obsoleto). Isola o lock como causa da correção.
6. Reaplicação da migration incremental: sem erro, locks preservados.

## 5. CI no SHA exato

| SHA | CI |
|---|---|
| `main` `69d0217` | run **#46028796153 success** (`quality`), check-run “quality success” concluído em 15:54:02Z — cobre changelog, lint, typecheck, `npm test`, `test:db`, build |
| PR #129 head `a7ef67a` | run **#46028589565 success** (`event=pull_request`) + Netlify deploy preview `pass` |
| merge da PR #129 `fb85d4d` | run #46028677004 success |
| branch `6db7608` | **0 check-runs, 0 statuses** (nunca teve CI) |

## 6. Veredito

**A correção está integrada e validada na `main`.** O lock `FOR UPDATE` existe,
é incremental, preserva a história de migrations, mantém contratos e
privilégios, tem CI verde no SHA exato e foi reproduzido independentemente em
PostgreSQL real (bloqueio efetivo + ausência de efeito parcial + controle
negativo sem o lock). **Não é necessária nova correção.**

## 7. Pendências objetivas

1. **`scripts/booking-concurrency.mjs` não roda no CI**: `package.json`
   (`test:db`) e `.github/workflows/ci.yml` não o incluem; hoje ele só passa se
   alguém executar manualmente. Incluir em `test:db` (ou step próprio) é a
   pendência de maior valor.
2. **Aposentar `arena/6f3a9b1f-marcou` (`6db7608`)**: sem PR, baseada em
   `9b92451`, contém edição de migration já aplicada. Não mergear; apagar ou
   registrar como substituída.
3. **`service_role` sem `EXECUTE`** em `transition_booking` (herdado do
   hardening `20261123133000`): ok enquanto só `authenticated` chama a RPC;
   revisar se algum job de servidor precisar dela.
4. **`set search_path = public`** na função (mantido igual à definição
   anterior): divergente da convenção `pg_catalog, public`; mudança exigiria
   migration nova — baixa prioridade, não bloqueia.
5. **Coordenação**: minha entrada `agent_4_pr_39` foi sobrescrita por commits de
   outro agente (`11f29eb`, `72cd3a1`, `dc25ea4`) — o estado entregue antes
   (`merge_resolution_ready_push_blocked`, 2 updates) desapareceu; reentrego
   agora contra o blob atual (`d80f7db`).
