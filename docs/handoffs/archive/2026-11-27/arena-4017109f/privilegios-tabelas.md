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
5. **Ordem em relação ao Calendar (#29):** a migration desta task roda **antes**
   da migration que criar `public.calendar_connections`. A tabela de tokens já
   consta da matriz com `anon`/`authenticated` sem acesso e `service_role` com
   acesso total. Um bloco `DO` condicional na migration aplica esses grants se
   a tabela já existir em algum ambiente. A migration do Calendar deve criar a
   tabela com RLS e repita os `REVOKE`/`GRANT` no mesmo arquivo; o check passa a
   validar a tabela automaticamente assim que ela existir.
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
| `calendar_connections` (futuro, #29) | — | — | ALL |

## Como cada PR futura registra suas tabelas

1. Ao criar uma tabela ou view em `public`, adicione no **mesmo commit** uma
   entrada à matriz em `scripts/privileges-check.mjs` com o menor conjunto de
   privilégios por papel (`anon`, `authenticated`, `service_role`).
2. A migration que cria a tabela deve fazer `revoke all ... from public, anon,
   authenticated` antes de conceder o que a matriz prevê. Isso neutraliza os
   default privileges do Supabase, que concedem escrita a papéis de API.
3. Replique a linha neste handoff e, se a tabela tiver tokens, PII ou segredos,
   registre explicitamente por que `anon`/`authenticated` não a leem.
4. Rode `npm run test:db`. O `scripts/privileges-check.mjs` roda 43 fluxos nas
   fases **antes** e **depois** das migrations e falha se houver objeto
   sem matriz ou privilégio diferente do contratado.
5. Se a mudança for intencional (nova write de cliente, por exemplo), atualize
   a matriz, o handoff e o teste na mesma PR — nunca relaxe o check só para
   fazer o CI passar.

## Validação executada

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

## Riscos e limitações

- A tabela `calendar_connections` ainda não existe; a linha da matriz é uma
  promessa de contrato para #29, não uma tabela verificável hoje.
- `CONTRIBUTING.md` e `check:changelog` foram trazidos da PR #122 (aberta) apenas
  na parte necessária à exigência de changelog; conflito textual com essa PR é
  esperado quando ela for integrada.
- `update public.notifications` direto do navegador passa a falhar com
  `permission denied`; qualquer código novo deve chamar as RPCs existentes.
- Não houve teste em navegador real nem validação em projeto Supabase remoto.
