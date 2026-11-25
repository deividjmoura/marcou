# Handoff — Issue #29 Google Calendar

Atualizado em 25/11/2026.

## Estado
- Trabalho na branch `arena/9e68c2bb-marcou`, que integra `feat/29-google-calendar-sync` (`b83e0cd`) sobre a `main` atual (`9b92451`, já com a PR #122). O único conflito foi o import em `src/app/painel/page.tsx` (mantidos `measureAuthFlow`/`measureAuthStep` da #122 e `isCalendarFeatureEnabled`).
- Sem push, sem PR e sem Supabase remoto. A migration continua **não aplicada**.
- PR #123 segue aberta (draft, head `16f0166`); `scripts/privileges-check.mjs` e `docs/handoffs/privilegios-tabelas.md` existem só lá e **não** foram trazidos.

## Itens da missão
| Item | Situação |
| --- | --- |
| A — OAuth | Feito: consumo atômico do state antes da troca do code (`consume_calendar_oauth_state`), state preso ao `user_id`, escopo `calendar.events` exigido em `tokens.scope` (revoga e recusa se faltar), `/connect` só POST com checagem de origem, redirects 303 após POST e avisos na página da integração. |
| B — Migration | Feito: `provider_calendar_connections` → `calendar_connections`; RLS/revoke/grant nas 3 tabelas; funções definer com `search_path` fixo. **Parte do check em `privileges-check.mjs`: bloqueada pela #123** (ver abaixo). |
| C — `privilegios-tabelas.md` | **Bloqueado pela #123.** |
| D — Worker | Feito: um job por reserva no claim (mais antigo não terminal), escritas verificadas, exclusão não apaga vínculo se a busca da conexão falhar, estado `dead` + log, `invalid_grant` suspende a conexão. |
| E — Desconexão | Feito: `disconnect_requested_at` + `suspended`, tokens e vínculos mantidos até a limpeza; worker continua; órfãos marcados com `orphaned_at`; `finalize_calendar_disconnect` só apaga a conexão sem vínculo ativo nem job em processing. |
| F — Testes e docs | Feito: 45 testes unitários novos (54 no total em `src/server/calendar`), `scripts/calendar-check.mjs` (83 checks), `docs/CALENDAR-INTEGRATION.md`, `CHANGELOG.md`. |

> A missão original (A–F) não estava disponível nesta sessão; os itens acima foram mapeados a partir do diagnóstico inicial de 25/11/2026.

## Validação local executada
- `npm run lint`: 0 erros (3 warnings `no-img-element` pré-existentes na `main`).
- `npm run typecheck`: ok.
- `npm test`: 26 arquivos, 204 testes ok.
- `npm run test:db`: legado 69/0, social 47/0, identidade 32/0, discovery 40/0, calendar 83/0.
- `npm run build`: ok.
- Não validado: fluxo OAuth real, Google API real, scheduler, deploy, CI do GitHub.

## Dependência da #123 — o que fazer quando ela entrar na `main`
Em `scripts/privileges-check.mjs`:
1. Remover o filtro `OBJECTS = Object.keys(MATRIX).filter((name) => name !== "calendar_connections")` para que `calendar_connections` seja verificada.
2. Acrescentar à `MATRIX`:
   ```js
   calendar_connections: { anon: [], authenticated: [], service_role: ["ALL"] },
   calendar_sync_outbox: { anon: [], authenticated: [], service_role: ["ALL"] },
   booking_calendar_events: { anon: [], authenticated: [], service_role: ["ALL"] },
   ```
3. Fazer a fase `before` excluir a migration da matriz **e** `20261125153000_google_calendar_sync.sql`. Hoje ela aplica "todas menos `SECURITY_MIGRATION`", o que passaria a incluir o Calendar. Com a exclusão, as 3 tabelas do Calendar só existem na fase `after`; a comparação before/after deve tratar os fluxos dessas tabelas como adições esperadas (sem acesso para `anon`/`authenticated`), não como regressão.
4. Emular os default privileges do Supabase desde a primeira migration (detalhado na revisão da #123). `scripts/calendar-check.mjs` já faz isso antes da migration do Calendar.
5. Remover a checagem `"calendar_connections está na matriz antes da migration do Calendar (#29)"` (ou invertê-la), já que a tabela passa a existir.

Em `docs/handoffs/privilegios-tabelas.md`: registrar as 3 tabelas do Calendar (só `service_role`) e as 4 funções com seus EXECUTE (tabela em `docs/CALENDAR-INTEGRATION.md`).

Depois: rodar `npm run test:db` com os dois checks; o bloco condicional da migration da matriz (`to_regclass('public.calendar_connections')`) continua inofensivo porque roda antes do Calendar.

## Variáveis de ambiente (só servidor)
`GOOGLE_CALENDAR_ENABLED=false` (padrão), `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32 bytes base64), `GOOGLE_CALENDAR_WORKER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.

## Scheduler
PR #38 continua aberta; não criar cron duplicado. Após deploy/migration/secrets, um scheduler externo deve chamar `POST /api/calendar/worker` com `Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>`.

## Segurança
Nenhum secret, configuração de produção, migration remota, deploy ou branch/PR de outro agente foi alterado.
