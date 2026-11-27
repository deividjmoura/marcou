# Auditoria da Issue #29 — Google Calendar (consolidação final)

Auditoria **somente leitura**. Nenhum arquivo do repositório, branch, PR, banco,
secret ou serviço externo foi modificado; nenhuma alteração local staged foi
tocada, stageada ou descartada.

## Escopo e SHAs verificados (2026-11-27)

| Objeto | SHA | Situação |
|---|---|---|
| `main` | `69d02173653384e082476e7879ee9f33672dec72` | referência |
| `arena/29-calendar-integration` | `26baee930cc48e1ec38561903337d5148d5274c7` | integração original, sem PR |
| `fix/29-oauth-state-atomic` | `2f577e2810bb66f79d1fdc1c697859bdfa42843d` | `26baee9` + 1 commit (state atômico + admin/audit) |
| PR #126 (Calendar + hardening) | `335e3f50b1d8dba862c2c769039a1750e94a6681` | OPEN, draft, **CONFLICTING** |
| PR #39 (agenda do prestador) | `6f44b506…` | sem relação com este escopo |

Evidência executada em clone isolado de `2f577e2` (sem alterar o remoto):
build ok, `tsc --noEmit` ok, lint 0 erros/4 warnings, `vitest` 136 testes,
`npm run audit` **0 falhas / 5 avisos**, `scripts/calendar-state-check.mjs` 25/25.

## Achados confirmados

### P0 — escopo concedido não é validado
`src/app/api/calendar/callback/route.ts:33` grava
`granted_scope: tokens.scope ?? "https://www.googleapis.com/auth/calendar.events"`.
`granted_scope` **não é lido em lugar nenhum** (`git grep` em `src/`), e a conexão
vira `connected` mesmo se o consentimento granular negar `calendar.events`.
Risco: prestador vê “conectado”, mas o worker falha em todo `POST /events`
(`google_event_upsert_failed`), consumindo 8 tentativas por reserva.

### P0 — OAuth sem PKCE
`src/server/calendar/oauth.ts` (URL) e `src/server/calendar/google.ts`
(`exchangeOAuthCode`) não enviam `code_challenge`/`code_challenge_method` nem
`code_verifier`. O `state` protege CSRF, não interceptação do `code`. Google
suporta PKCE para clientes web; ausência amplia o impacto de vazamento de
`code`/`redirect_uri` em logs, referrer ou preview.

### P1 — refresh token sem cache e sem rotação
`src/server/calendar/google.ts` (`refreshGoogleAccessToken`):
- renova o access token em **todo** job, ignorando `access_token_expires_at`
  já persistido → 1 chamada extra ao endpoint de token por evento;
- ignora um `refresh_token` **rotacionado** na resposta (o `update` não inclui
  `refresh_token_ciphertext`) → contas com rotação obrigatória perdem a conexão
  no ciclo seguinte (`invalid_grant` → `suspended`).

### P1 — desconexão concorrente ao worker/outbox
`src/app/api/calendar/disconnect/route.ts`:
- marca `calendar_sync_outbox` de `pending|failed|processing` como `succeeded`
  com `last_error_code: "provider_disconnected"` e depois **apaga** a conexão;
- um worker que já reivindicou o job regrava a linha como `failed` **depois**
  disso, ressuscitando o job (e o `attempts` continua subindo);
- o cleanup de eventos é um laço sequencial sem paginação/limite — provedor com
  muitos eventos pode estourar o tempo da função na Netlify;
- `refreshGoogleAccessToken` é chamado dentro do disconnect e **escreve** em
  `provider_calendar_connections` (pode marcar `suspended` no meio do fluxo).

### P1 — 5 avisos de `npm run audit` não resolvidos
```
WARN src/app/painel/integracoes/calendario/page.tsx  Supabase sem isSupabaseConfigured
WARN src/app/api/calendar/callback/route.ts          Supabase sem tratar ausência de env
WARN src/app/api/calendar/connect/route.ts           idem
WARN src/app/api/calendar/disconnect/route.ts        idem
WARN src/app/api/calendar/status/route.ts            idem
```
`src/server/calendar/admin.ts:5` exporta `isCalendarAdminConfigured()` que
**nunca é chamado** — a correção foi iniciada e não concluída (código morto).

### P1 — `.env.example` incompleto
`SUPABASE_SERVICE_ROLE_KEY` é obrigatória em `calendarAdminClient`, mas não
aparece no `.env.example` (nem vazia).

### P2 — `search_path` do trigger fora do padrão do repositório
`supabase/migrations/20261125153000_google_calendar_sync.sql`:
`enqueue_calendar_sync_from_booking_event()` usa `set search_path = public`;
`CONTRIBUTING.md` e `docs/SECURITY-DEFINER-GRANTS.md` exigem
`pg_catalog, public`. `consume_calendar_oauth_state` já está correto.

### P2 — URI de callback sem política de HTTPS
`calendarRedirectUri()` usa `NEXT_PUBLIC_SITE_URL` sem impor `https:` fora de
`localhost` (diferente de `trustedAppOrigin()` em `src/lib/identity.ts`). Não há
`netlify.toml`; cada ambiente (produção, Deploy Preview, domínio próprio) precisa
de entrada própria no Google Cloud, sem wildcard.

### P2 — criptografia sem versionamento de chave
`src/server/calendar/crypto.ts` usa AES-256-GCM com IV aleatório por token, sem
prefixo de versão de chave: rotacionar `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
inviabiliza decifrar tokens existentes (reconexão forçada de todos).

### P2 — outbox enfileira com flag desligada
O trigger `booking_events_calendar_outbox` insere em `calendar_sync_outbox` sem
consultar `GOOGLE_CALENDAR_ENABLED`; com a feature desligada as linhas
acumulam como `pending` (sem worker) indefinidamente.

## Comparação com os seis arquivos staged (`fix/29-oauth-state-atomic`)

O commit `2f577e2` (“consume OAuth state atomically”) altera **8 arquivos**;
os **seis** relatados pelo responsável são exatamente o conjunto do patch de
consumo atômico já validado nesta sessão (`patches/29-calendar-oauth-state-atomic.patch`).
Comparação byte a byte: `callback/route.ts`, a migration
`20261127120000_calendar_oauth_state_consumption.sql` e
`scripts/calendar-state-check.mjs` estão **idênticos** ao patch auditado.

| Arquivo | O que faz | Veredito |
|---|---|---|
| `src/app/api/calendar/callback/route.ts` | consome o state via RPC **antes** de `exchangeOAuthCode`; falha = `expired-state`/`connection-error`, sem restaurar state | correto para o escopo; **não** valida `tokens.scope` (P0 acima) |
| `supabase/migrations/20261127120000_calendar_oauth_state_consumption.sql` | RPC `consume_calendar_oauth_state(text)`: `UPDATE … RETURNING` de uso único, `SECURITY DEFINER`, `search_path = pg_catalog, public`, `EXECUTE` só `service_role` | aprovado |
| `scripts/calendar-state-check.mjs` | 25 verificações em PostgreSQL real: válido, expirado, inexistente, malformado, replay, 2 e 8 concorrentes, isolamento entre providers, grants, RLS | aprovado; cobre **só** a RPC de state |
| `src/app/api/calendar/callback/route.test.ts` | 10 testes: consumo antes da troca, replay, concorrência, ownership, falhas pós-consumo | aprovado |
| `package.json` | `test:db` passa a incluir `calendar-state-check.mjs` | aprovado |
| `docs/CALENDAR-INTEGRATION.md` | documenta o contrato de consumo do state | aprovado |

Dois arquivos **extras** no mesmo commit, fora do conjunto relatado:

| Arquivo | Mudança | Observação |
|---|---|---|
| `src/server/calendar/admin.ts` | `import "server-only"` + `isCalendarAdminConfigured()` | build/typecheck ok (Next resolve `server-only` por alias interno), mas o pacote **não** está em `package.json`: importar `admin.ts` fora do bundler (vitest/script Node) falharia. `isCalendarAdminConfigured` é código morto e **não** elimina os 5 avisos do audit |
| `scripts/quality-audit.mjs` | exceção para `@supabase/supabase-js` em `admin.ts` (quando há `server-only`) e regex de client secret mais estrita | funcional, porém com indentação fora do padrão do arquivo |

**Conclusão da comparação:** os seis arquivos resolvem **apenas** o consumo
atômico do state (a falha de concorrência/replay). Nenhum achado P0/P1 acima é
coberto por eles — em particular escopos, PKCE, rotação de refresh token,
consistência desconexão×worker e cobertura de banco do outbox.

## Testes necessários (por prioridade)

1. `src/server/calendar/oauth.test.ts` — URL contém `code_challenge` (S256) e
   `code_challenge_method`; `redirect_uri` derivado de `NEXT_PUBLIC_SITE_URL`.
2. `src/app/api/calendar/callback/route.test.ts` — recusa conexão quando
   `tokens.scope` não contém `calendar.events`; grava `granted_scope` real.
3. `src/server/calendar/google.test.ts` (novo) — `exchangeOAuthCode` envia
   `code_verifier`; `refreshGoogleAccessToken` reutiliza access token válido
   (zero `fetch`), persiste `refresh_token` rotacionado, mapeia `invalid_grant`
   para `suspended` e erros para códigos estáveis.
4. `src/server/calendar/worker.test.ts` (novo) — `runCalendarWorker`: sucesso,
   `409 → PATCH`, `404/410` tratados como delete idempotente, backoff
   `min(3600, 30·2^(n-1))`, `attempts >= 8` não reenfileira, payload sem PII.
5. Rotas HTTP (`connect`, `disconnect`, `status`, `worker`) — 401/403/404/503,
   checagem de `Origin` no disconnect, `calendar=provider-required`,
   `configuration-error` quando falta env.
6. `scripts/calendar-state-check.mjs` (ampliar) ou novo harness —
   `booking_events_calendar_outbox` enfileira `upsert` em `booking.confirmed` e
   `delete` em `cancelled/expired`, e ignora outros eventos;
   `claim_calendar_sync_jobs`: `FOR UPDATE SKIP LOCKED`, recuperação de
   `processing` com mais de 10 min, exclusão de `attempts >= 8`, limite 1–25;
   matriz de grants/RLS das três tabelas; `search_path` de todas as definer.
7. Cenário de corrida desconexão×worker — job reivindicado durante o disconnect
   não deve voltar para `failed` (ou deve convergir para estado terminal).

## Sequência segura de implementação

**Fase 0 — higiene da branch (sem force push)**
Merging de `main` (`69d0217`) sobre `fix/29-oauth-state-atomic`, resolvendo
`src/app/painel/page.tsx`, `README.md` e `package.json`. Gate: CI verde no SHA
do merge, `npm run audit` sem novas falhas.

**Fase 1 — P0 consentimento (1 PR)**
Validar `tokens.scope` no callback (recusar/suspender quando faltar
`calendar.events`) + PKCE (`oauth.ts`, `google.ts`, tabela de state já guarda o
hash; o `code_verifier` pode ir em cookie `HttpOnly` de curta duração ou em
coluna cifrada na conexão). Testes 1, 2, 3.

**Fase 2 — P1 tokens e observabilidade**
Cache de access token por `access_token_expires_at`; persistir refresh token
rotacionado; usar `isCalendarAdminConfigured()` nas rotas (ou remover a função)
para zerar os 5 avisos; incluir `SUPABASE_SERVICE_ROLE_KEY` no `.env.example`
(vazio).

**Fase 3 — P1 desconexão × worker × outbox**
Marcar jobs em uma transação e ignorar jobs de conexão inexistente; limitar o
cleanup de eventos (paginado/limite por execução); teste 7 + testes 4 e 5.

**Fase 4 — cobertura de banco**
Testes 6 no `test:db`; corrigir `search_path` do trigger para
`pg_catalog, public` em migration incremental (não editar a aplicada).

**Fase 5 — endurecimento final**
HTTPS obrigatório em `calendarRedirectUri` fora de localhost; versionamento de
chave em `crypto.ts` (`v1.iv.tag.ct`); documentar redirect URIs por ambiente;
revisar PR #126 (que hoje está `CONFLICTING`) para decidir o que dela ainda é
necessário.

**Regras de gate em todas as fases:** `GOOGLE_CALENDAR_ENABLED=false`; nenhuma
migration aplicada em Supabase remoto; nenhum secret novo em repositório; lint,
typecheck, `test`, `test:db`, `audit` e `build` verdes no SHA final; sem merge
antes de CI verde; sem force push.

## Riscos de integração

- A branch do Calendar está **atrás da main** e altera `src/app/painel/page.tsx`,
  `README.md` e `package.json` — o mesmo tipo de conflito já resolvido na PR #39;
  resolva por merge commit (fast-forward), não por rebase forçado.
- PR #126 concentra Calendar + hardening de privilégios (#125) e está
  `CONFLICTING`; qualquer trabalho novo deve declarar se a substitui ou não.
- `calendar-state-check.mjs` roda em porta 55435 e aplica **todas** as
  migrations: qualquer nova migration do Calendar entra automaticamente no
  harness (boa propriedade, mas exige manter a ordem dos prefixos).

## Limitações desta auditoria

- As alterações locais staged do responsável **não** foram acessadas nem
  modificadas; a comparação usou a versão publicada em `fix/29-oauth-state-atomic`
  (`2f577e2`), que contém os seis arquivos do patch + dois extras.
- Nenhum acesso a Google Cloud, Supabase remoto, Netlify, secrets ou produção.
- CI/preview não existem para nenhum SHA deste escopo no momento da auditoria.
