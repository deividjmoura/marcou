# Diagnóstico: privilégios de tabela em `public` (anon/authenticated)

> **Status: só diagnóstico.** Esta sessão só tinha permissão de escrita na
> branch da PR #124, então a migration e o script de teste **não** foram
> versionados. Também não foram abertos issue nem PR, para não misturar escopos.
> O SQL abaixo é um **rascunho validado localmente**. Nada foi aplicado no
> Supabase remoto.
>
> Data: 25/11/2026. Base: `main` `67bb571` (10 migrations) e, para conferir a
> composição, a #123 (`e96e137`, +`20261125120000`).

## Resumo

- As tabelas criadas **antes** da convenção `revoke all … grant …` ainda têm o
  `GRANT ALL` padrão do Supabase para `anon` e `authenticated`: `SELECT`,
  `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` e `TRIGGER`. A tabela
  abaixo lista quais são.
- **O RLS já bloqueia toda escrita indevida via API** (PostgREST): sem política,
  `INSERT` falha e `UPDATE`/`DELETE` afetam 0 linhas.
- **`TRUNCATE` ignora RLS.** Num teste em Postgres embutido com os defaults do
  Supabase emulados, `authenticated` e `anon` esvaziaram `bookings`,
  `booking_events`, `notifications`, `profiles`, `services`,
  `availability_rules` e `availability_exceptions`.
- O PostgREST não expõe `TRUNCATE`. Para explorar a falha, é preciso executar
  SQL arbitrário com esses papéis. Ainda assim, é privilégio que nenhum papel
  de cliente deveria ter (defesa em profundidade).
- **Proposta:**
  - revogar `TRUNCATE`/`REFERENCES`/`TRIGGER` de `public`/`anon`/`authenticated`;
  - revogar `INSERT`/`UPDATE`/`DELETE` onde **nenhuma política de escrita** os
    usa;
  - manter todas as escritas legítimas;
  - não mexer em `ALTER DEFAULT PRIVILEGES`.

## Como foi medido

Postgres embutido (`embedded-postgres`, o mesmo dos scripts de `test:db`), com
o que o Supabase traz e os scripts atuais **não** emulam:

```sql
create role anon nologin; create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
-- + auth.users e auth.uid() lendo request.jwt.claim.sub, como nos scripts atuais
```

Depois:

- aplicação das migrations em ordem;
- leitura de `has_table_privilege` para cada tabela/visão de `public`;
- comparação com `pg_policies`;
- execução dos fluxos da aplicação como `authenticated`/`anon`, do mesmo jeito
  que o PostgREST: transação, `set local role` e claim `sub`.

> Sem emular esses defaults, a matriz não significa nada: um Postgres puro não
> concede nada a `anon`/`authenticated`, e o problema some.

## Matriz atual (`main`, defaults emulados)

Legenda: S=SELECT, I=INSERT, U=UPDATE, D=DELETE, T=TRUNCATE, R=REFERENCES,
G=TRIGGER. Todas as tabelas têm RLS ativo. `service_category_catalog` é visão.

| Tabela | anon | authenticated | Políticas (cmd → papéis) |
| --- | --- | --- | --- |
| `bookings` | **SIUDTRG** | **SIUDTRG** | SELECT → authenticated |
| `booking_events` | **SIUDTRG** | **SIUDTRG** | SELECT → authenticated |
| `notifications` | **SIUDTRG** | **SIUDTRG** | SELECT, UPDATE → authenticated |
| `profiles` | **SIUDTRG** | **SIUDTRG** | SELECT, INSERT, UPDATE → authenticated |
| `providers` | **SIUDTRG** | **SIUDTRG** | SELECT → public; INSERT, UPDATE → authenticated |
| `services` | **SIUDTRG** | **SIUDTRG** | SELECT → public; INSERT, UPDATE, DELETE → authenticated |
| `availability_rules` | **SIUDTRG** | **SIUDTRG** | SELECT → public; ALL → authenticated |
| `availability_exceptions` | **SIUDTRG** | **SIUDTRG** | SELECT → public; ALL → authenticated |
| `account_preferences` | - | S | SELECT → authenticated |
| `app_runtime_config`, `feature_flags`, `feature_flag_overrides` | - | - | (nenhuma) |
| `legal_documents` | S | S | SELECT → public |
| `legal_acceptances` | - | S | SELECT → authenticated |
| `provider_service_areas` | - | SIUD | SELECT, INSERT, UPDATE, DELETE → authenticated |
| `service_categories`, `service_category_versions`, `service_category_aliases` | S | S | SELECT → public |
| `service_category_suggestions` | - | SI | SELECT, INSERT → authenticated |
| `service_category_catalog` (visão) | S | S | — |

As 8 primeiras linhas são o problema. As demais já seguem a convenção das
migrations `202611230001` em diante (`revoke all … from public, anon,
authenticated` e depois `grant` do mínimo).

Com a #123: `booking_services` também fica `SIUDTRG` para os dois papéis. **Esse
caso é da #123** (já apontado na revisão dela) e fica fora desta proposta.

Funções `SECURITY DEFINER`: todas têm `search_path` fixo e nenhuma é executável
por `PUBLIC` (endurecido pela #117). Nada a fazer aqui.

## O que cada papel precisa escrever de verdade

Levantado em `src/` (`.from(...).insert/update/upsert/delete` e `.rpc(...)`):

| Escrita da aplicação | Caminho | Precisa de privilégio de tabela? |
| --- | --- | --- |
| Perfil próprio no login/cadastro/callback/confirm | `profiles` upsert (`(auth)/actions.ts`, `auth/callback`, `auth/confirm`) | **INSERT + UPDATE** em `profiles` |
| Criar/editar estabelecimento | `providers` insert/update (`server/services.ts`) | **INSERT + UPDATE** em `providers` |
| Serviços | `services` insert/update/delete | **I/U/D** em `services` |
| Disponibilidade e exceções | `availability_rules` I/U/D, `availability_exceptions` I/D | **I/U/D** nas duas |
| Áreas atendidas / sugestão de categoria | `provider_service_areas` I/D, `service_category_suggestions` I | já concedidos explicitamente |
| Criar reserva | RPC `create_booking` (SECURITY DEFINER) | **não** |
| Transições da reserva | RPC `transition_booking` (SECURITY DEFINER) | **não** |
| Eventos e notificações | trigger `notify_on_booking_event` (SECURITY DEFINER) | **não** |
| Marcar notificação lida | RPCs `mark_notification_read` / `mark_all_notifications_read` (SECURITY DEFINER) | **não** |
| Modo preferido, aceite legal | RPCs `set_preferred_mode`, `record_legal_acceptances` | **não** |

Todas as funções de trigger são `SECURITY DEFINER` (`notify_on_booking_event`,
`validate_service_discovery_configuration`,
`protect_last_customer_service_area`). Revogar escrita direta não afeta os
triggers.

**Observação sobre `notifications`:** existe a política
`notifications_update_own` e o grant explícito `select, update`, mas a
aplicação marca notificações como lidas só por RPC. A política deixa o
destinatário alterar **qualquer coluna** da própria notificação (título,
corpo...). A proposta **mantém** o `UPDATE` (há política, e removê-lo muda
comportamento). Restringir é decisão do responsável, com duas opções:

- `revoke update` + `grant update (is_read, read_at)`;
- remover a política e deixar só as RPCs.

## Rascunho da migration (validado, não versionado)

Nome sugerido: `supabase/migrations/20261125130000_harden_public_table_privileges.sql`
(posterior a `20261125120000` da #123; ajustar se outra PR ocupar o prefixo).

```sql
-- Endurece privilégios de tabela herdados do GRANT ALL padrão do Supabase.
-- Aditiva e reexecutável (REVOKE de privilégio ausente é no-op).
-- booking_services (#123) fica fora de propósito.

-- 1) TRUNCATE ignora RLS; REFERENCES e TRIGGER não têm uso pela API.
revoke truncate, references, trigger on table
  public.profiles,
  public.providers,
  public.services,
  public.availability_rules,
  public.availability_exceptions,
  public.bookings,
  public.booking_events,
  public.notifications
from public, anon, authenticated;

-- 2) anon: nenhuma política de escrita vale para anon/public.
revoke insert, update, delete on table
  public.profiles,
  public.providers,
  public.services,
  public.availability_rules,
  public.availability_exceptions,
  public.bookings,
  public.booking_events,
  public.notifications
from public, anon;

-- 3) authenticated: escrita só onde há política de escrita.
--    bookings/booking_events: só via create_booking/transition_booking e o
--    trigger notify_on_booking_event (todos SECURITY DEFINER).
revoke insert, update, delete on table public.bookings, public.booking_events
  from authenticated;
--    notifications: inserção só pelo trigger; não há política de DELETE.
--    UPDATE fica (política notifications_update_own existe).
revoke insert, delete on table public.notifications from authenticated;
--    profiles/providers: há políticas de INSERT/UPDATE, não de DELETE.
revoke delete on table public.profiles, public.providers from authenticated;
```

`SELECT` não é alterado. `anon` continua com `SELECT` em `bookings`,
`booking_events`, `notifications` e `profiles`, mas nenhuma política de leitura
vale para `anon`, então não lê nada. Revogar esse `SELECT` é um próximo passo
possível, separado.

### Matriz depois do rascunho (medida)

| Tabela | anon | authenticated |
| --- | --- | --- |
| `bookings`, `booking_events` | S | S |
| `notifications` | S | SU |
| `profiles`, `providers` | S | SIU |
| `services`, `availability_rules`, `availability_exceptions` | S | SIUD |
| demais | inalteradas | inalteradas |

Nenhuma tabela de `public` fica com T, R ou G para `anon`/`authenticated`,
exceto `booking_services` quando a #123 entrar sem o próprio `revoke`.

### Resultados reais do rascunho

1. **Fluxos com defaults emulados.** Script temporário, 43 verificações.
   - **Sem** o rascunho: 22 ok, 21 falhas. 14 `TRUNCATE` passaram e os dados de
     `bookings`/`booking_events` foram apagados. As demais "falhas" eram
     escritas recusadas por RLS, não por privilégio, ou `UPDATE`/`DELETE` que
     afetaram 0 linhas. Ou seja: hoje o único buraco real é o `TRUNCATE`.
   - **Com** o rascunho: **43 ok, 0 falhas**. As escritas legítimas abaixo
     continuam funcionando:
     - `profiles` upsert próprio (dono e cliente);
     - `providers` insert/update;
     - `services` insert/update/delete;
     - `availability_rules` insert/update;
     - `availability_exceptions` insert/delete;
     - `create_booking` (cliente);
     - `transition_booking` `proof_received` e `payment_approved` (dono);
     - geração de notificação pelo trigger;
     - `mark_notification_read`, `mark_all_notifications_read` e `UPDATE`
       direto da própria notificação;
     - leitura da própria reserva e leitura anônima de serviços.

     Todos os `TRUNCATE` e as escritas diretas em `bookings`, `booking_events`
     e `notifications` passam a falhar com `permission denied`. Os dados ficam
     intactos (1 reserva, 3 eventos).
2. **Suítes atuais com o rascunho** (worktree temporária, removida depois):
   - `db-check`: 69/0 (aplica só as 6 primeiras migrations, então não vê o
     rascunho);
   - `social-foundation-check`: 47/0;
   - `identity-check`: 28/0;
   - `discovery-check`: 40/0.

   As três últimas aplicaram o rascunho.
3. **Composição com a #123.** Migrations da #123 (`e96e137`) + rascunho
   aplicam sem erro. `bookings`/`booking_events`/`notifications` ficam como na
   tabela acima, e `booking_services` fica intocada (`SIUDTRG`).

## Teste proposto: `scripts/privileges-check.mjs`

Script novo, ligado ao fim de `test:db`
(`… && node scripts/privileges-check.mjs`), **sem editar
`scripts/db-check.mjs`** (que a #123 altera). Porta própria (ex.: 55436) e
diretório efêmero próprio, como os outros scripts.

1. Emula os defaults do Supabase (bloco "Como foi medido") **antes** de
   aplicar as migrations, para que a regressão seja visível.
2. Aplica todas as migrations em ordem, como `social-foundation-check.mjs`.
3. **Matriz esperada por allowlist:** um objeto `{ tabela: { anon: "S",
   authenticated: "SIU" } }` cobrindo todas as tabelas e visões de `public`.
   - Falha se uma tabela tiver privilégio além do esperado.
   - Falha se surgir tabela nova **sem entrada** na allowlist.

   É isso que compensa não mexer em `ALTER DEFAULT PRIVILEGES`: toda tabela
   nova que herdar o `GRANT ALL` quebra o CI até alguém decidir os grants.
4. Regra global: nenhuma tabela de `public` com T, R ou G para
   `anon`/`authenticated`.
5. Coerência com políticas: para cada I/U/D concedido a `authenticated`, existe
   política do mesmo cmd (ou `ALL`) para `authenticated`/`public`. Para `anon`,
   nenhum I/U/D.
6. Fluxos comportamentais, os mesmos 43 do rascunho:
   - datas calculadas a partir de `now()`, nunca fixas;
   - `TRUNCATE` sempre dentro de `begin … rollback`.
7. `booking_services`: enquanto a #123 não estiver na `main`, a tabela não
   existe e o script não a conhece. Quando a #123 entrar, quem integrar
   adiciona a entrada (esperado: anon `-`, authenticated `S`). Até lá, a regra
   "tabela sem entrada falha" sinaliza o caso.

## Por que não alterar `ALTER DEFAULT PRIVILEGES`

Seria o conserto "na raiz" (novas tabelas nasceriam sem grants), mas:

- **Escopo por papel criador:** os defaults valem por papel criador
  (`postgres`, `supabase_admin`...). Mudar só um deixa outros caminhos
  (painel/Studio, extensões, `supabase db push` com outro usuário)
  concedendo `ALL` do mesmo jeito. Isso dá falsa sensação de segurança.
- **Efeito invisível e global:** afeta toda tabela, função e sequência futura,
  inclusive de features que ainda não existem. O efeito não aparece no diff da
  migration que cria a tabela, e o primeiro sintoma vira um "permission
  denied" em produção, numa feature nova.
- **Funções e sequências:** revogar o default de funções muda a convenção que a
  #117 acabou de estabelecer (grant explícito por função). Revogar o de
  sequências pode quebrar `insert` em tabelas com `serial`/`identity` (hoje
  `public` usa `gen_random_uuid()`, mas nada impede isso no futuro).
- **Reversão:** desfazer exige saber exatamente o estado anterior por papel
  criador, que difere entre projetos Supabase e versões da plataforma.

Por isso a proposta é: **revogar explicitamente por tabela** (como as migrations
desde `202611230001` já fazem) e **pegar regressões no CI** com a allowlist do
`privileges-check`. Se o responsável quiser mudar os defaults mesmo assim, deve
ser numa PR própria, com o estado atual de
`pg_default_acl` do projeto remoto lido antes (consulta abaixo) e o rollback
escrito.

## Validação em dev antes de produção (não executada aqui)

Sem credenciais nesta sessão, nada abaixo foi rodado. Procedimento sugerido
para quem tiver acesso a um projeto Supabase **de desenvolvimento**:

1. Ler o estado atual (somente leitura):
   ```sql
   select c.relname,
          has_table_privilege('anon', c.oid, 'TRUNCATE')          as anon_t,
          has_table_privilege('authenticated', c.oid, 'TRUNCATE') as auth_t,
          has_table_privilege('authenticated', c.oid, 'INSERT')   as auth_i
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v')
    order by 1;
   select defaclrole::regrole, defaclobjtype, defaclacl
     from pg_default_acl
    where defaclnamespace = 'public'::regnamespace;
   ```
2. Aplicar a migration **só no projeto de dev** (`supabase db push` apontando
   para dev, ou `supabase db reset` local).
3. Repetir a consulta 1 e conferir com a "Matriz depois do rascunho".
4. Testar no navegador, com contas reais de dono e cliente:
   - login e cadastro (perfil);
   - criar/editar estabelecimento, serviço, horário e exceção;
   - reservar;
   - "Marcar comprovante recebido" e "Confirmar pagamento";
   - abrir e marcar notificação como lida;
   - página pública `/p/[slug]` deslogado.
5. Só então a migration segue o fluxo normal para produção, por decisão do
   responsável. **Não aplicar no remoto a partir desta análise.**

Rollback, se algum fluxo quebrar: `grant` do privilégio específico de volta à
tabela afetada. **Nunca** `grant all`.

## Próximos passos (para o responsável)

1. Abrir issue `[SECURITY] Privilégios padrão do Supabase (TRUNCATE etc.) em
   tabelas de public`, com o conteúdo deste documento. Não aberta aqui por
   regra da sessão.
2. Abrir PR própria, a partir da `main`, com a migration acima e o
   `scripts/privileges-check.mjs`, mais a entrada em `CHANGELOG.md`
   (`### Segurança`) exigida pelo check da #122.
3. Ordem: depois da #122 (CHANGELOG/CI). Ela é independente da #124. Se entrar
   depois da #123, incluir `booking_services` na allowlist com o valor que a
   #123 adotar.
4. Decidir separadamente sobre o `UPDATE` em `notifications` e o `SELECT`
   inútil de `anon`.
