# Handoff — matriz de privilégios de tabelas (`SECURITY`)

**Branch de trabalho:** `arena/4017109f-marcou` (a mesma da PR #123, sem merge).
**PR desta entrega:** rascunho empilhado sobre essa branch, sem `Refs` (decisão
do responsável), sem aplicação em Supabase remoto, sem deploy e sem segredos.
**Issue relacionada, apenas como contexto:** #29 (Calendar) e #41
(`SECURITY DEFINER`); nenhuma delas é fechada por esta entrega.

> Não existia um rascunho prévio em `docs/handoffs/privilegios-tabelas.md` em
> nenhuma branch remota nem no histórico do repositório. A matriz abaixo foi
> **reconstruída das migrations efetivas** e validada no PostgreSQL embutido
> pelo script `scripts/privileges-check.mjs`. `CONTRIBUTING.md` também não
> existe nesta branch (pertence à PR #122, ainda aberta), então o processo de
> registro de novas tabelas fica documentado aqui.

## Decisões

1. **Fonte canônica:** a matriz está em `scripts/privileges-check.mjs` e é
   reproduzida neste handoff e em comentários da migration. O script é a
   autoridade executável: ele falha se aparecer uma tabela ou view em `public`
   sem entrada na matriz.
2. **Migration aditiva:** `supabase/migrations/20261125130000_table_privileges_matrix.sql`
   é posterior à maior migration existente (`20261125120000`) e não cria,
   remove ou reescreve dados. Ela só remove o `UPDATE` direto de
   `authenticated` em `notifications` e reafirma os grants de
   `booking_services`.
3. **Notificações:** a aplicação usa apenas `mark_notification_read(uuid)` e
   `mark_all_notifications_read()` (ambas `SECURITY DEFINER`). Com o `UPDATE`
   direto revogado, as RPCs continuam operando como definer. A política RLS
   `notifications_update_own` foi preservada — o pedido era remover grants,
   não alterar políticas.
4. **bookings e booking_events:** intactos (`SELECT` para `anon` e
   `authenticated`, o restante via funções de servidor). A comparação
   before/after no harness prova que não houve mudança.
5. **Ordem em relação ao Calendar (#29):** a migration da matriz
   (`20261125130000`) roda **antes** de
   `20261125153000_google_calendar_sync.sql`, que cria `calendar_connections`,
   `calendar_sync_outbox` e `booking_calendar_events` com RLS, `revoke all ...
   from public, anon, authenticated` e `grant all ... to service_role` no mesmo
   arquivo. O bloco `DO` condicional da matriz roda quando a tabela ainda não
   existe e por isso não tem efeito; quem garante os privilégios é a migration
   do Calendar. Desde a integração da #29, as três tabelas estão em `OBJECTS`
   e são verificadas na fase `after` (ver seção "Google Calendar (#29)").
6. **Sem referência de issue na PR:** o responsável escolheu não usar `Refs`
   nesta PR draft (a issue `[SECURITY]` pretendida não foi identificada de
   forma inequívoca: #41 está OPEN e #14 CLOSED, nenhuma fala de matriz de
   privilégios).

## Matriz tabela/operação/papel

`ALL` equivale a `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
`REFERENCES` e `TRIGGER`. Qualquer operação não listada é negada.

| Objeto em `public` | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `profiles` | — | SELECT, INSERT, UPDATE, DELETE | ALL |
| `providers` | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL |
| `services` | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL |
| `availability_rules` | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL |
| `availability_exceptions` | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL |
| `bookings` | SELECT | SELECT | ALL |
| `booking_events` | SELECT | SELECT | ALL |
| `booking_services` | — | SELECT | ALL |
| `notifications` | — | SELECT (antes: SELECT + UPDATE) | ALL |
| `legal_documents` | SELECT | SELECT | ALL |
| `legal_acceptances` | — | SELECT | ALL |
| `app_runtime_config` | — | — | ALL |
| `feature_flags` | — | — | ALL |
| `feature_flag_overrides` | — | — | ALL |
| `account_preferences` | — | SELECT | ALL |
| `service_categories` | SELECT | SELECT | ALL |
| `service_category_versions` | SELECT | SELECT | ALL |
| `service_category_aliases` | SELECT | SELECT | ALL |
| `service_category_catalog` (view) | SELECT | SELECT | SELECT |
| `service_category_suggestions` | — | SELECT, INSERT | ALL |
| `provider_service_areas` | — | SELECT, INSERT, UPDATE, DELETE | ALL |
| `calendar_connections` (#29, tokens cifrados) | — | — | ALL |
| `calendar_sync_outbox` (#29) | — | — | ALL |
| `booking_calendar_events` (#29) | — | — | ALL |

## Como cada PR futura registra suas tabelas

1. Ao criar uma tabela ou view em `public`, adicione no **mesmo commit** uma
   entrada à matriz em `scripts/privileges-check.mjs` com o menor conjunto de
   privilégios por papel (`anon`, `authenticated`, `service_role`).
2. A migration que cria a tabela deve fazer `revoke all ... from public, anon,
   authenticated` antes de conceder o que a matriz prevê. Isso neutraliza os
   default privileges do Supabase, que concedem escrita a papéis de API.
3. Replique a linha neste handoff e, se a tabela tiver tokens, PII ou segredos,
   registre explicitamente por que `anon`/`authenticated` não a leem.
4. Rode `npm run test:db`. O `scripts/privileges-check.mjs` verifica cada
   objeto da matriz para `anon` e `authenticated` nas fases **antes** (21
   objetos) e **depois** (24 objetos) das migrations e falha se houver objeto
   sem matriz ou privilégio diferente do contratado. Se a sua migration for
   posterior à matriz e criar tabelas, exclua-a também da fase `before` (como
   o Calendar) e declare as tabelas como adições esperadas na comparação.
5. Se a mudança for intencional (nova write de cliente, por exemplo), atualize
   a matriz, o handoff e o teste na mesma PR — nunca relaxe o check só para
   fazer o CI passar.

## Validação executada

### Com o Calendar (#29) empilhado — 25/11/2026

- `node scripts/privileges-check.mjs`: fase `before` 43/0 fluxos (21 objetos ×
  2 papéis + escrita direta em `notifications`), fase `after` 49/0 (24 objetos
  × 2 + 1), 25/0 checagens estruturais em cada fase e 3/0 na comparação.
- `npm run test:db`: booking `116/0`, social `50/0`, identidade `32/0`,
  descoberta `40/0`, matriz conforme o contrato e calendar `84/0`.
- `npm test` 214/214; `lint` (3 avisos antigos de `<img>`), `typecheck`,
  `audit` (0 falhas, 0 avisos), `build` e `check:changelog` sem erro.

### Entrega original da #123

- `node scripts/privileges-check.mjs`: 43 fluxos antes da migration (43/0) e
  43 fluxos depois (43/0), com diferença única e esperada no UPDATE direto de
  `notifications`; `bookings` e `booking_events` inalterados.
- `npm run test:db`: booking `116/0`, social `50/0`, identidade `28/0`,
  descoberta `40/0` e matriz de privilégios `43/0` em cada fase.
- `npm test`: 137/137; `lint`, `typecheck`, `audit`, `build` e
  `check:changelog` concluídos sem erro (lint mantém 3 avisos antigos de
  `<img>`).
- Nenhuma migration foi aplicada ao Supabase remoto; nenhuma credencial foi
  lida, criada ou colada em arquivo algum.

### Decisão operacional sobre a PR

As regras da sessão permitem usar apenas esta branch como head. Como ela já é o
head da #123, o responsável autorizou abrir a PR draft de SECURITY contra
`main` a partir deste mesmo head, aceitando que os commits de SECURITY também
apareçam no diff da #123. Não houve force-push nem reescrita de histórico.

## Google Calendar (#29)

Integrado na branch `arena/9e68c2bb-marcou`, empilhada sobre esta PR.

- **Tabelas:** as três são exclusivas do servidor. `calendar_connections`
  guarda refresh/access tokens cifrados (AES-256-GCM) e o hash do state OAuth;
  `calendar_sync_outbox` e `booking_calendar_events` têm IDs de reservas e de
  eventos do Google. Por isso `anon`/`authenticated` não têm nenhum privilégio
  nem policy; o navegador só recebe o estado da conexão por rotas de servidor
  que nunca devolvem token.
- **Funções** (todas `SECURITY DEFINER`, `search_path = public`, sem EXECUTE
  para `PUBLIC`, `anon` ou `authenticated`):

  | Função | EXECUTE |
  |---|---|
  | `enqueue_calendar_sync_from_booking_event()` (trigger) | ninguém (nem `service_role`) |
  | `claim_calendar_sync_jobs(integer)` | `service_role` |
  | `consume_calendar_oauth_state(text, uuid)` | `service_role` |
  | `finalize_calendar_disconnect(uuid)` | `service_role` |

- **`scripts/privileges-check.mjs`:**
  - as 3 tabelas estão na `MATRIX` e em `OBJECTS` (o filtro que excluía
    `calendar_connections` foi removido);
  - a fase `before` exclui a migration da matriz **e** a do Calendar, e exige
    que as tabelas do Calendar ainda não existam;
  - na fase `after`, os defaults do Supabase (tabelas, sequences e funções)
    são emulados antes da migration do Calendar, e as tabelas precisam existir
    sem nenhum privilégio para `anon`/`authenticated` e com ALL para
    `service_role`;
  - a comparação aceita as tabelas do Calendar como única adição além de
    `notifications`, e só se vierem vazias.
- **Teste negativo:** removendo os `revoke all on table` da migration do
  Calendar, o check passa a falhar com 7 erros (6 fluxos + comparação). Antes
  dessa mudança ele continuava verde.
- **Cobertura complementar:** `scripts/calendar-check.mjs` verifica RLS,
  ausência de policies e sequences, EXECUTE das 4 funções e acesso direto real
  como `anon`/`authenticated` (`permission denied`).

## Riscos e limitações

- **Defaults do Supabase desde a primeira migration:** este check só emula os
  default privileges a partir de `20261125120000` (e reforça antes do
  Calendar). As 20 tabelas anteriores são verificadas num Postgres limpo, onde
  `anon`/`authenticated` nunca recebem o `GRANT ALL` do Supabase. Emular desde
  a primeira migration hoje gera falhas nas tabelas legadas (ver auditoria na
  #123); a correção depende do hardening proposto na #125 e não faz parte da
  #29.
- `CONTRIBUTING.md` e `check:changelog` foram trazidos da PR #122 (aberta) apenas
  na parte necessária à exigência de changelog; conflito textual com essa PR é
  esperado quando ela for integrada.
- `update public.notifications` direto do navegador passa a falhar com
  `permission denied`; qualquer código novo deve chamar as RPCs existentes.
- Não houve teste em navegador real nem validação em projeto Supabase remoto.
