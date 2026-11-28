# Roteiro de Teste Real em Produção (pós-Rodada 7)

Guia ordenado e operacional para o **responsável humano** validar e ativar, passo
a passo, o Marcou em ambiente publicado após a Rodada 7.

> **Importante:** este documento é somente orientação operacional. Nenhum agente
> aplicou migrations no Supabase remoto, alterou variáveis/secrets na Netlify,
> Supabase, Google Cloud ou GitHub, enviou e-mails reais, conectou conta Google
> ou ativou schedulers. Toda ação em ambiente real depende de execução e
> autorização explícita do responsável.

Última revisão contra a `main`: 2026-11-27 (`d1e0c2f`, incluindo PRs `#128`, `#38`,
`#138`, `#140`, `#141`, `#142`, `#127`, `#143`, `#136`, `#146` e `#145`).

---

## Regras de segurança antes de começar

1. **Staging antes de produção:** sempre valide migrations, variáveis e schedulers
   em um projeto Supabase de staging separado antes de tocar a produção
   (`peornypgltuueubmsucm`).
2. **Um portão por vez:** não avance para a fase seguinte enquanto a fase atual
   não passar integralmente.
3. **Nunca exponha segredos nem PII:** jamais cole `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`,
   `GOOGLE_CALENDAR_WORKER_SECRET`, credenciais SMTP, cookies, `code`, `token_hash`
   ou links completos de e-mail em chat, Issues, PRs, logs ou tickets.
4. **Tudo começa desligado:** `BOOKING_EXPIRATION_ENABLED`, `GOOGLE_CALENDAR_ENABLED`,
   cron de `GET /api/cron` e cron de `POST /api/calendar/worker` devem permanecer
   desligados até as fases correspondentes.

---

## Fase 0 — Pré-requisitos, backup e higiene de credenciais

- [ ] Confirmar na Netlify que o deploy de produção (`https://marcoou.netlify.app`)
  corresponde ao commit esperado da `main` com CI `quality` verde.
- [ ] Confirmar no Supabase Dashboard que backups automáticos estão ativos em
  produção (`peornypgltuueubmsucm`) e gerar um **snapshot / dump manual
  pré-migration** antes de aplicar qualquer SQL em produção.
- [ ] **Rotação prévia obrigatória:** rotacionar quaisquer credenciais OAuth ou
  SMTP previamente expostas fora de painéis protegidos antes de reabilitar
  login Google ou e-mail transacional (ver `docs/IDENTITY.md` e
  `docs/FECHAMENTO-AGENTES.md`, seção 7).
- [ ] Confirmar que todos os schedulers estão desligados:
  - GitHub Repository variable `BOOKING_EXPIRATION_ENABLED` ausente ou `false`;
  - Netlify `GOOGLE_CALENDAR_ENABLED` ausente ou `false`;
  - Nenhum agendador externo chamando `GET /api/cron` ou `POST /api/calendar/worker`.
- [ ] Preparar **contas de teste dedicadas** (sem usar dados reais de clientes):
  1 conta de prestador de teste publicada (fuso `America/Sao_Paulo`, 2+ serviços
  ativos com duração/preço/sinal/buffer distintos) e 1–2 contas de cliente de teste.

---

## Fase 1 — Ordem de aplicação das migrations (incluindo PR #142)

### 1.1 Inventário completo das 19 migrations na `main`

| # | Arquivo em `supabase/migrations/` | Escopo principal | Observação |
| --- | --- | --- | --- |
| 1 | `202611150001_initial_schema.sql` | Schema base (perfis, prestadores, serviços, agenda, reservas) | Base |
| 2 | `202611150002_booking_operations.sql` | RPCs de reserva, transição e `expire_stale_bookings()` | Base |
| 3 | `202611150003_notifications.sql` | Tabela/trigger de notificações e `create_booking_reminders` v1 | Base |
| 4 | `202611160001_provider_description.sql` | Descrição do prestador | Aditiva |
| 5 | `20261116035000_fix_booking_idempotency_authorization.sql` | Guarda de autorização na idempotência de `create_booking` | Segurança |
| 6 | `202611230001_legal_documents_and_acceptances.sql` | Documentos legais e aceite versionado | Aditiva |
| 7 | `20261123130000_social_rollout_foundation.sql` | Feature flags sociais (desligadas por padrão) | Aditiva |
| 8 | `20261123133000_harden_security_definer_grants.sql` | Revoga `EXECUTE` de `PUBLIC` em `SECURITY DEFINER` e restringe RPCs | Segurança |
| 9 | `20261123140000_account_modes.sql` | Preferência de modo Cliente/Profissional (`account_preferences`) | Aditiva |
| 10 | `20261123143000_discovery_taxonomy_service_areas.sql` | Taxonomia de descoberta e áreas de atendimento | Aditiva |
| 11 | `20261125120000_booking_multiple_services.sql` | `booking_services` e RPCs multi-serviço (PR #142) | **Fora de ordem na data de merge — ver 1.2** |
| 12 | `20261125130000_table_privileges_matrix.sql` | Matriz mínima de grants em `notifications`/`booking_services`/`calendar_*` (PR #142) | **Fora de ordem na data de merge — ver 1.2** |
| 13 | `20261125140000_harden_public_table_privileges.sql` | Endurecimento de privilégios nas tabelas públicas | Segurança |
| 14 | `20261125153000_google_calendar_sync.sql` | Tabelas, triggers e RPCs de sincronização Google Calendar (PR #135) | Aditiva |
| 15 | `20261127000000_booking_transition_concurrency_lock.sql` | Lock de concorrência em `transition_booking` (PR #129) | Concorrência |
| 16 | `20261127000100_reminder_concurrency_lock.sql` | `FOR UPDATE SKIP LOCKED` e idempotência por fuso em `create_booking_reminders` (PR #38) | Concorrência |
| 17 | `20261128000000_calendar_worker_fencing.sql` | Lease tokens de fencing do worker Calendar (PR #141) | Hardening |
| 18 | `20261128000100_calendar_disconnect_revocation_retry.sql` | Retentativa segura de revogação na desconexão Calendar (PR #141) | Hardening |
| 19 | `20261128000200_booking_definer_search_path.sql` | Fixa `search_path = pg_catalog, public` nas 5 funções multi-serviço (PR #145) | **Depende de #11 (`20261125120000`) já aplicada** |

### 1.2 Tratamento da ordem fora de sequência da PR #142

A PR `#142` introduziu `20261125120000_booking_multiple_services.sql` e
`20261125130000_table_privileges_matrix.sql` depois que a `main` já continha as
migrations `20261125140000` até `20261128000100` (ver também o registro em
`docs/BOOKING-OPS.md`). Em seguida, a PR `#145` adicionou
`20261128000200_booking_definer_search_path.sql`, que endurece `search_path` das
5 funções criadas pela `20261125120000`. Conforme a regra do projeto,
**migrations já mergeadas nunca são editadas**.

> **Precedência obrigatória:** `20261125120000` e `20261125130000` **devem
> sempre rodar antes de `20261128000200`**. Aplicar `20261125120000` manualmente
> *depois* de `20261128000200` rebaixaria o `search_path` das 5 funções de
> `pg_catalog, public` de volta para `public`. Tanto `supabase db push` quanto
> `supabase db push --include-all` ordenam por nome/timestamp e respeitam essa
> precedência automaticamente.

Antes de aplicar, inspecione o estado real do banco alvo:

```bash
supabase migration list
```

(Ou via SQL somente-leitura no SQL Editor:)

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Escolha o procedimento correspondente ao estado retornado:

- **Cenário A — Banco novo (ex.: staging zerado) ou aplicado apenas até `20261123143000` (nenhuma versão `>= 20261125140000` aplicada):**
  Todas as migrations pendentes têm timestamp maior que o último aplicado. Execute:
  ```bash
  supabase db push --dry-run
  # Conferir lista exata de migrations pendentes e então aplicar:
  supabase db push
  ```

- **Cenário B — Banco remoto que JÁ possui alguma migration `>= 20261125140000` (até `20261128000100`), mas ainda NÃO aplicou `20261125120000` e `20261125130000`:**
  Por padrão, o `supabase db push` recusa migrations com timestamp anterior ao maior
  timestamp já registrado no remoto. Use `--include-all` após revisar o dry-run —
  ele aplicará `20261125120000` → `20261125130000` → eventuais pendentes até
  `20261128000100` → `20261128000200` nessa ordem exata:
  ```bash
  supabase db push --dry-run --include-all
  # Confirmar que 20261125120000 e 20261125130000 aparecem ANTES de 20261128000200:
  supabase db push --include-all
  ```
  > **Compatibilidade verificada em PostgreSQL real:** ambas as sequências —
  > ordem natural (`#1..#19`) e cenário de banco que já tinha `#1..#10, #13..#18`
  > recebendo `#11 → #12 → #19` — foram validadas em PostgreSQL embutido com
  > default privileges do Supabase emulados. O estado final é idêntico: sem erro
  > SQL, zero funções `SECURITY DEFINER` com `EXECUTE` para `PUBLIC`,
  > `search_path = pg_catalog, public` nas 5 funções multi-serviço,
  > `transition_booking`, `create_booking_reminders` e objetos Calendar intactos,
  > e privilégios mínimos preservados em `bookings`, `booking_services`,
  > `booking_events`, `notifications` e `calendar_*`.

### 1.3 Conferência pós-migration (somente-leitura)

Execute no SQL Editor do banco alvo após aplicar:

```sql
-- 1. Confirmar as 19 versões aplicadas
select count(*) as total_migrations
from supabase_migrations.schema_migrations;

-- 2. Confirmar que nenhuma função SECURITY DEFINER em public expõe EXECUTE a PUBLIC
select p.oid::regprocedure::text as leaked_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('public', p.oid, 'EXECUTE');
-- Esperado: 0 linhas

-- 3. Confirmar search_path endurecido nas 5 funções multi-serviço (PR #145)
select p.oid::regprocedure::text as fn, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('booking_service_totals', 'get_provider_schedule', 'create_booking')
order by 1;
-- Esperado: 5 linhas, todas com search_path=pg_catalog, public

-- 4. Confirmar que expire_stale_bookings e create_booking_reminders pertencem somente a service_role
select p.oid::regprocedure::text as fn,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('expire_stale_bookings', 'create_booking_reminders');
-- Esperado: anon_exec=false, auth_exec=false, svc_exec=true para ambas

-- 5. Confirmar presença da tabela booking_services e das 3 tabelas de Calendar com RLS ligada
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'booking_services',
    'calendar_connections',
    'calendar_sync_outbox',
    'booking_calendar_events'
  )
order by c.relname;
-- Esperado: 4 linhas, todas com relrowsecurity = true
```

---

## Fase 2 — Variáveis de ambiente por fase

Cadastre variáveis **somente na fase em que o recurso será testado**. Nunca use o
prefixo `NEXT_PUBLIC_` para chaves secretas. Ver também `.env.example` e
`docs/PLATFORM.md`.

### Fase 2A — Base da aplicação e Autenticação (obrigatória antes da Fase 3)

| Painel | Variável / Configuração | Valor esperado (Produção) | Classificação |
| --- | --- | --- | --- |
| Netlify | `NEXT_PUBLIC_SITE_URL` | `https://marcoou.netlify.app` (sem barra final) | Pública |
| Netlify | `NEXT_PUBLIC_SUPABASE_URL` | `https://peornypgltuueubmsucm.supabase.co` | Pública |
| Netlify | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon do projeto | Pública |
| Netlify | `AUTH_TIMING_LOG` | Ausente por padrão (`"1"` apenas em janela controlada de diagnóstico, sem PII) | Operacional (server-only) |
| Supabase Auth | **Site URL** | `https://marcoou.netlify.app` | Config painel |
| Supabase Auth | **Redirect URLs** (produção) | `https://marcoou.netlify.app/auth/callback**` e `https://marcoou.netlify.app/auth/confirm**` | Config painel |
| Supabase Auth | **Redirect URLs** (previews/local) | `https://deploy-preview-*--marcoou.netlify.app/auth/callback**`, `/auth/confirm**`, `http://localhost:3000/auth/callback**`, `/auth/confirm**` | Config painel |
| Supabase Auth | **Email Templates** (`Confirm signup` e `Reset Password`) | Links apontando para `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email` e `type=recovery` (ver `docs/IDENTITY.md`) | Config painel |
| Google Cloud | **Authorized redirect URIs** (OAuth Login Supabase) | **Somente** `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback` (nunca `/auth/callback` da Netlify) | Config painel |

### Fase 2B — Scheduler de Expiração de Holds (staging primeiro; ver Fase 5A)

| Painel | Nome | Escopo | Classificação |
| --- | --- | --- | --- |
| GitHub Actions | `BOOKING_EXPIRATION_ENABLED` | Repository variable (`false` até o momento da ativação) | Gate operacional |
| GitHub Actions | `SUPABASE_PROJECT_REF` | Environment `booking-expiration-staging` (variable — ref do **staging**, 20 chars) | Config |
| GitHub Actions | `SUPABASE_URL` | Environment `booking-expiration-staging` (secret — `https://<ref-staging>.supabase.co`) | Secreta |
| GitHub Actions | `SUPABASE_SERVICE_ROLE_KEY` | Environment `booking-expiration-staging` (secret — service-role do **staging**) | **Secreta** |

### Fase 2C — Scheduler de Lembretes (`GET /api/cron`; ver Fase 5B)

| Painel | Variável | Notas | Classificação |
| --- | --- | --- | --- |
| Netlify | `SUPABASE_SERVICE_ROLE_KEY` | Service-role do projeto alvo; **server-only** | **Secreta** |
| Netlify | `CRON_SECRET` | Token aleatório forte (ex.: `openssl rand -hex 32`); comparado em tempo constante | **Secreta** |
| Agendador externo | URL + header `Authorization: Bearer <CRON_SECRET>` | Chama `GET https://<SITE_URL>/api/cron` a cada 15–30 min | **Secreta** |

### Fase 2D — Google Calendar OAuth + Worker (opcional; ver Fase 5C)

| Painel | Variável / Configuração | Notas | Classificação |
| --- | --- | --- | --- |
| Netlify | `GOOGLE_CALENDAR_ENABLED` | `"false"` até concluir configuração; somente `"true"` ativa UI/rotas | Feature flag (server-only) |
| Netlify | `GOOGLE_CALENDAR_CLIENT_ID` | Client ID OAuth Web para o Calendar | Config (server-only) |
| Netlify | `GOOGLE_CALENDAR_CLIENT_SECRET` | Client Secret correspondente | **Secreta** |
| Netlify | `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | 32 bytes aleatórios em base64 (`openssl rand -base64 32`) | **Secreta** |
| Netlify | `GOOGLE_CALENDAR_WORKER_SECRET` | Token aleatório forte para `POST /api/calendar/worker` | **Secreta** |
| Netlify | `SUPABASE_SERVICE_ROLE_KEY` | Mesma chave server-only da Fase 2C | **Secreta** |
| Netlify | `NEXT_PUBLIC_SITE_URL` | Obrigatória: pós-PR `#141`, `/api/calendar/callback` responde `503` se ausente/inválida | Pública |
| Google Cloud | **Authorized redirect URIs** (Calendar) | `<NEXT_PUBLIC_SITE_URL>/api/calendar/callback` (escopo único: `https://www.googleapis.com/auth/calendar.events`) | Config painel |

---

## Fase 3 — Smoke test base, Login Google e Recuperação de Senha (pós-PR #127)

### 3.1 Smoke test das rotas

- [ ] `GET /` e `GET /p/<slug-de-teste>` respondem HTTP `200`.
- [ ] Acesso anônimo a `/inicio`, `/minha-conta`, `/painel`, `/meus-agendamentos`
  e `/notificacoes` redireciona para `/login?next=<caminho-local>`.
- [ ] Conferir no navegador/DevTools (ou `curl -I`) que `/auth/confirm` e
  `/auth/callback` retornam `Cache-Control: private, no-store`, `Pragma: no-cache`,
  `Expires: 0` e `Referrer-Policy: no-referrer`.

### 3.2 Recuperação de senha ponta a ponta (Issues #70 / #23 · PR #127)

1. Em uma janela anônima, acesse `/esqueci-senha` e solicite recuperação para a
   conta de teste. Compare a mensagem com um e-mail inexistente: **o retorno deve
   ser idêntico** (não enumerável).
2. Abra o e-mail de recuperação em **outro navegador ou dispositivo** (sem o
   cookie PKCE de quem pediu o reset):
   - **Caminho principal (template configurado com `token_hash`):** o link abre
     `/auth/confirm?next=%2Fredefinir-senha&token_hash=...&type=recovery` e
     redireciona diretamente para `/redefinir-senha`.
   - **Caminho de contingência (PR #127 — `code` ou `token_hash` órfão na raiz `/`):**
     caso o Supabase faça fallback para o Site URL com `?code=...` ou
     `?token_hash=...&type=recovery`, `src/proxy.ts` reencaminha automaticamente
     para `/auth/callback` ou `/auth/confirm` com `private, no-store`, sem loop,
     e o handler reconhece recuperação por `redirectType === "recovery"` /
     `type=recovery`, levando a `/redefinir-senha` (nunca ao onboarding de perfil).
3. Defina a nova senha em `/redefinir-senha`. Confirme que a sessão de recuperação
   é encerrada e faça novo login com a nova senha.
4. Tente abrir o mesmo link uma segunda vez (reuso/expiração): deve exibir erro
   genérico de autenticação sem vazar `error_description` na URL.
5. **Não copie** o link completo, `token_hash` ou `code` em nenhum registro.

### 3.3 Login Google (Supabase Auth PKCE)

1. Em janela privada, acesse `/login` e clique em **Continuar com Google**.
2. Confirme que não ocorre `Erro 400: redirect_uri_mismatch`, conclua o
   consentimento e valide o retorno por `/auth/callback` até `/inicio` (ou
   `/perfil` se faltar telefone) e persistência da sessão após recarregar.
3. Repita cancelando o consentimento no Google: deve voltar ao `/login` com
   mensagem genérica segura.
4. Em `/inicio`, alterne Cliente/Profissional e valide que `/minha-conta` e
   `/painel` funcionam na mesma identidade `auth.users.id`.

---

## Fase 4 — Reserva multi-serviço ponta a ponta (pós-PRs #142, #143 e #146)

Execute usando a conta de prestador de teste (com pelo menos 2 serviços ativos,
por exemplo **Serviço A: 60 min / R$ 80 / sinal R$ 20 / buffer 15 min** e
**Serviço B: 30 min / R$ 45 / sinal R$ 10 / buffer 10 min**) e a conta de cliente
de teste.

### 4.0 Cadastro de preço BRL com milhar e sinal (PR #143)

1. No `/painel`, teste criar/editar um serviço de teste com valor formatado em
   BRL (ex.: `1.200,00`, sinal `0` ou `200,00`) e confirme que o parser grava o
   valor em centavos exato sem distorcer separador de milhar.

### 4.1 Criação multi-serviço, confirmação e `.ics` (PRs #142 e #146)

1. Acesse `/p/<slug-de-teste>` logado como cliente e selecione **os 2 serviços**
   no widget de agendamento.
2. Confira antes de confirmar: duração total (`90 min`), preço total (`R$ 125,00`),
   sinal total (`R$ 30,00`) e que os horários exibidos respeitam a janela contínua
   de `90 min + 10 min` (buffer apenas do último serviço).
3. Conclua a reserva e confirme redirecionamento imediato para `/reserva/<id>`
   (sem erro genérico — verifica que o `redirect` permanece fora do `try/catch`).
4. Na página `/reserva/<id>`, valide:
   - título com snapshot agregado (`"Serviço A + Serviço B"`);
   - horário de início, término previsto (`+90 min`), duração (`90 min`), total
     (`R$ 125,00`), sinal (`R$ 30,00`), feedback visual por status e aviso de
     expiração do hold;
   - botões de ação exibidos conforme o papel (cliente não vê aprovação de
     pagamento — PR `#143`, mantendo bloqueio também na RPC do banco);
   - download do arquivo `.ics` contendo o snapshot agregado, duração somada e
     valor total no evento (PR `#146`).
5. Em outra sessão, abra `/p/<slug-de-teste>` na mesma data e confirme que **todo
   o intervalo combinado** (inclusive horários iniciando na faixa do 2º serviço e
   no buffer final) está indisponível.
6. Confirme no banco (SQL somente-leitura) que `public.booking_services` possui
   2 linhas ordenadas (`position = 1, 2`) vinculadas ao `booking_id`.

### 4.2 Transições, autorização e notificações

1. Como cliente, envie o comprovante (`pending_payment` → `pending_review`).
   Confira em `/notificacoes` que o **prestador** recebeu `booking_proof_received`.
2. Como prestador em `/painel` (ou `/reserva/<id>`), aprove o pagamento
   (`pending_review` → `confirmed`). Confira que `expires_at` foi zerado e que
   **cliente e prestador** receberam `booking_confirmed` com o snapshot agregado.
3. Crie uma segunda reserva multi-serviço e cancele-a (`cancel` → `cancelled`):
   confirme liberação imediata de todo o intervalo combinado na agenda pública e
   preservação dos registros em `bookings`, `booking_services` e `booking_events`.

### 4.3 Compatibilidade com reserva de 1 serviço

1. Crie uma reserva com **apenas 1 serviço** em `/p/<slug-de-teste>`, confirme que
   `/reserva/<id>`, `/meus-agendamentos`, `/painel` e `/notificacoes` exibem os
   dados normalmente sem regressão.

---

## Fase 5 — Ativação segura (e desligamento) de cada scheduler

Ative **um mecanismo por vez**, validando o comportamento antes de ligar o próximo.

### 5A. Scheduler de Expiração de Holds (`.github/workflows/booking-expiration.yml` · PR #128)

> **Trava de segurança importante:** o workflow versionado é **staging-only** e
> recusa explicitamente o project ref de produção `peornypgltuueubmsucm` antes de
> qualquer chamada RPC.

**Como ativar e validar em staging:**

1. Configure o GitHub Environment `booking-expiration-staging` com os dados da
   Fase 2B (confirmando que pertencem ao projeto **staging**).
2. No staging, crie 3 reservas multi-serviço de teste:
   - 1 `pending_payment` com `expires_at` já vencido;
   - 1 `pending_payment` com hold ainda vigente;
   - 1 `confirmed`.
3. Defina a Repository variable `BOOKING_EXPIRATION_ENABLED=true`.
4. Em **GitHub → Actions → Booking expiration scheduler**, clique em **Run workflow**
   (branch `main`).
5. Verifique no log do run: status `success` e `expired_count=1` (sem exposição de
   segredos ou corpo de erro).
6. Confira no banco staging e na UI:
   - reserva vencida mudou para `expired`, manteve os itens em `booking_services`,
     liberou toda a janela combinada (inclusive faixa do 2º serviço) e gerou
     notificações `booking_expired` com o snapshot agregado;
   - hold vigente e confirmada permaneceram intactos.
7. Execute **Run workflow** novamente e confirme `expired_count=0` (idempotência).
8. Acompanhe 2–3 execuções agendadas (`*/5 * * * *`) e ative notificações de falha
   do GitHub Actions.

**Para produção (somente após staging validado):**

- **Não** altere o Environment `booking-expiration-staging` para apontar para
  produção. Crie um GitHub Environment separado de produção (com regra de
  aprovação/proteção) e um workflow/job dedicado apontando para o ref de produção,
  mediante PR revisada e autorização explícita do responsável.

**Como desligar imediatamente:**

- Altere a Repository variable `BOOKING_EXPIRATION_ENABLED` para `false` (ou remova
  a variável). O workflow passa a ser ignorado tanto no cron quanto no dispatch
  manual. A expiração inline em `create_booking` continua protegendo a
  disponibilidade sob demanda.

---

### 5B. Scheduler de Lembretes (`GET /api/cron` · PR #38)

**Validação manual antes de ligar o cron externo:**

1. Configure `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` na Netlify (Fase 2C) e
   garanta deploy atualizado.
2. **Teste negativo (sem token e token inválido):**
   ```bash
   curl -i "https://marcoou.netlify.app/api/cron"
   # Esperado: HTTP 401 {"error":"unauthorized"} e Cache-Control: private, no-store, max-age=0

   curl -i -H "Authorization: Bearer token-invalido" "https://marcoou.netlify.app/api/cron"
   # Esperado: HTTP 401 {"error":"unauthorized"}
   ```
3. Tenha 1 reserva **multi-serviço `confirmed`** agendada para as próximas 24 horas
   (e 1 reserva cancelada ou expirada como controle).
4. **Teste positivo (token válido — executar em terminal seguro, sem salvar o segredo em histórico/logs):**
   ```bash
   curl -i -H "Authorization: Bearer ${CRON_SECRET}" "https://marcoou.netlify.app/api/cron"
   # Esperado: HTTP 200 {"ok":true,"ranAt":"...","jobs":{"reminders":{"status":"succeeded","created":1}}}
   ```
5. **Teste de idempotência:** repita a chamada logo em seguida e confirme
   `"created":0`.
6. Confira em `/notificacoes` do cliente e do prestador: exatamente **1** lembrete
   por destinatário com o `service_name_snapshot` agregado e horário formatado no
   fuso do prestador; nenhum lembrete para a reserva cancelada/expirada.

**Como ativar:**

- Provisione o agendador externo escolhido (GitHub Actions, cron HTTPS gerenciado
  ou Supabase `pg_cron` + `pg_net`) chamando `GET <SITE_URL>/api/cron` com
  `Authorization: Bearer <CRON_SECRET>` a cada **15–30 minutos**.
- Configure política do chamador: retry com backoff apenas em erro de rede /
  timeout / HTTP `500`; **alerta sem loop** em HTTP `401` ou `503`.

**Como desligar imediatamente:**

- Pause/desabilite o agendador externo. Para bloqueio imediato no lado do servidor,
  remova ou rotacione `CRON_SECRET` na Netlify (o endpoint falha fechado com `401`).

---

### 5C. Google Calendar OAuth e Worker (`POST /api/calendar/worker` · PR #135 + PR #141)

**Pré-checagem com a flag desligada:**

1. Antes de ativar `GOOGLE_CALENDAR_ENABLED`, confirme que `/painel` **não** exibe
   o módulo do Calendar e que `POST /api/calendar/worker` permanece inativo/bloqueado.

**Ativação e teste controlado com conta Google de teste:**

1. Cadastre todas as variáveis da Fase 2D na Netlify (com `GOOGLE_CALENDAR_ENABLED=true`)
   e confirme o Redirect URI `<NEXT_PUBLIC_SITE_URL>/api/calendar/callback` no
   Google Cloud Console (escopo único `https://www.googleapis.com/auth/calendar.events`).
2. **Teste negativo do worker:**
   ```bash
   curl -i -X POST "https://marcoou.netlify.app/api/calendar/worker"
   # Esperado: HTTP 401
   ```
3. Logado como o prestador de teste em `/painel`, inicie a conexão com o Google
   Calendar usando uma **conta Google dedicada de teste**:
   - valide o redirecionamento `303` para o Google, consentimento do escopo
     `calendar.events` e retorno para `/painel` com status **conectado**.
4. Crie e confirme uma reserva **multi-serviço** futura para esse prestador.
5. Dispare **uma execução manual** do worker:
   ```bash
   curl -i -X POST -H "Authorization: Bearer ${GOOGLE_CALENDAR_WORKER_SECRET}" \
     "https://marcoou.netlify.app/api/calendar/worker"
   ```
6. Abra o Google Calendar da conta de teste e valide:
   - o evento aparece no horário e duração **somada** da reserva multi-serviço;
   - o título contém o `service_name_snapshot` agregado (`"Serviço A + Serviço B"`);
   - **privacidade:** não há nome, telefone, e-mail nem ID da reserva do cliente no
     título ou descrição do evento.
7. Cancele a reserva de teste no Marcou, dispare o worker novamente e confirme que o
   evento foi removido do Google Calendar.
8. Teste a desconexão no `/painel` (`POST /api/calendar/disconnect`) e rode o worker
   caso haja eventos remanescentes: confirme que a conexão é removida após limpeza
   e revogação do token (pós-PR `#141`, falhas transitórias de revogação ficam
   pendentes para retentativa automática do worker).

**Como ativar o agendamento contínuo:**

- Somente após concluir os passos 1–8 acima, configure um agendador externo
  chamando `POST <SITE_URL>/api/calendar/worker` com
  `Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>` (ex.: a cada 1–5 min;
  cada execução processa até 10 jobs + 5 desconexões).

**Como desligar imediatamente:**

1. Pause o agendador externo do worker.
2. Defina `GOOGLE_CALENDAR_ENABLED=false` na Netlify (desliga imediatamente UI,
   OAuth e endpoint do worker).
3. Caso existam prestadores reais conectados cujos eventos precisem ser limpos
   antes de remover os secrets, mantenha os tokens/worker ativos até concluir a
   desconexão controlada (ver `docs/CALENDAR-INTEGRATION.md`, seção *Rollback*).

---

## Fase 6 — Rollback por camada

| Camada | Sintoma / Gatilho | Ação imediata de rollback | Impacto / Cuidados |
| --- | --- | --- | --- |
| **Schedulers / Flags** | Execução anômala, erro 5xx no cron ou falha externa Google | `BOOKING_EXPIRATION_ENABLED=false`; pausar cron de `/api/cron` (ou remover `CRON_SECRET`); `GOOGLE_CALENDAR_ENABLED=false` + pausar worker | Efeito em segundos; motor de reservas e expiração inline continuam operando normalmente |
| **Aplicação (Netlify)** | Regressão de UI, SSR, Auth ou Server Action após deploy | **Netlify → Deploys →** selecionar último deploy estável anterior → **Publish deploy** | Instantâneo, sem rebuild; manter compatibilidade das variáveis de ambiente |
| **Variáveis / Secrets** | Config incorreta ou suspeita de vazamento | Reverter valor no painel da Netlify / GitHub Actions; em caso de vazamento, **rotacionar no provedor** antes de republicar | Nunca reutilizar credencial exposta |
| **Banco (Supabase)** | Falha grave pós-migration | **Não** executar `DROP TABLE` nem editar migrations aplicadas. Como as migrations da Rodada 7 são aditivas e compatíveis para trás (incluindo RPC legada de 1 serviço), prefira rollback só de app/flags; se for indispensável reverter schema, restaurar o backup/snapshot da Fase 0 em janela controlada ou aplicar **nova** migration corretiva validada em staging | Evita perda de dados de reservas e inconsistência em `schema_migrations` |

---

## Fase 7 — Registro de conclusão e próximos passos

Ao concluir cada fase com sucesso, registre apenas o **resultado operacional sem
PII nem credenciais** (data/hora UTC, ambiente, fases aprovadas e eventuais
ajustes pendentes) nas issues correspondentes:

- **Autenticação / Recuperação / OAuth / SMTP:** `#70`, `#23`
- **Notificações / Lembretes / Preferências:** `#26`, `#13`
- **Plataforma / Ambientes / Deploy / Observabilidade:** `#30`, `#20`
- **Qualidade / Auditoria E2E publicada:** `#31`

> **Nota sobre PRs remanescentes da Rodada 7 (Onda 2):** caso sejam integradas
> posteriormente PRs ainda abertas na fila (`#130` origem preview/recuperação,
> `#67` tokens/tipografia do design system), repita apenas o smoke test da camada
> afetada (Fase 3 / inspeção visual) mantendo inalteradas as fases de migration,
> isolamento de secrets, schedulers e rollback deste roteiro.

Somente após o fechamento da validação em produção e aprovação explícita do
responsável deve ser criada tag ou GitHub Release (ver `AGENTS.md`).
