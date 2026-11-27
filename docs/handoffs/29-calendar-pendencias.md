# Handoff — pendências do Google Calendar (#29) após o OAuth state atômico

Registro separado das correções identificadas na auditoria da integração Google
Calendar que **não** fazem parte da entrega de consumo atômico do OAuth state.
Cada item deve virar uma tarefa própria, com sua própria revisão de segurança.

## 1. Validar o escopo concedido (`tokens.scope`)
`src/app/api/calendar/callback/route.ts` grava `tokens.scope ?? "<calendar.events>"`
sem confirmar que o consentimento granular realmente incluiu
`https://www.googleapis.com/auth/calendar.events`. Se o prestador desmarcar a
permissão, a conexão é marcada como `connected` e o worker falha depois, no
primeiro `POST` na Calendar API. A correção deve recusar a conexão (ou
suspendê-la) quando o escopo concedido não contiver `calendar.events`.

## 2. Cache e rotação de refresh token
`refreshGoogleAccessToken()` em `src/server/calendar/google.ts`:

- renova o access token em **todo** job, ignorando `access_token_expires_at` já
  persistido, o que multiplica chamadas ao endpoint de token;
- ignora um `refresh_token` rotacionado na resposta, mantendo o anterior
  cifrado, o que pode invalidar a conexão em contas com rotação obrigatória.

A correção precisa reutilizar o access token válido e persistir o refresh token
rotacionado na mesma transação lógica, sem alterar o restante do worker.

## 3. URI de callback e exigência de HTTPS
`calendarRedirectUri()` (`src/server/calendar/oauth.ts`) usa
`NEXT_PUBLIC_SITE_URL` sem impor `https:` fora de `localhost`, enquanto
`trustedAppOrigin()` (`src/server/identity.ts`) já aplica essa política. Também
falta documentar que cada ambiente (produção, Deploy Previews da Netlify,
domínio próprio) exige sua própria redirect URI registrada no Google Cloud, já
que o Google não aceita curingas. Nenhum `netlify.toml` existe no repositório.

## 4. `SUPABASE_SERVICE_ROLE_KEY` no `.env.example`
`calendarAdminClient()` exige `SUPABASE_SERVICE_ROLE_KEY`, mas a variável não
aparece no `.env.example` (nem com valor vazio). Incluir a chave sem valor real e
com aviso de que é server-side only.

## 5. Testes de rotas HTTP e do worker
Cobertura atual: `crypto`, `oauth`, `event-payload`, `worker-auth`, o callback
(consumo atômico) e o harness PostgreSQL `scripts/calendar-state-check.mjs`.
Faltam:

- testes HTTP de `connect`, `disconnect` (mesma origem), `status` e `worker`
  (401/404/503);
- testes de `google.ts`: `exchangeOAuthCode`, `refreshGoogleAccessToken`,
  `runCalendarWorker` (`409 -> PATCH`, `404/410`, `invalid_grant`, backoff);
- testes de banco para o trigger `booking_events_calendar_outbox` e para a RPC
  `claim_calendar_sync_jobs` (inclusive concorrência).

## Fora de escopo nesta entrega
Nenhuma migration foi aplicada em Supabase remoto, nenhum secret foi
configurado, `GOOGLE_CALENDAR_ENABLED` permanece `false` e o comportamento de
sincronização de eventos não foi alterado.
