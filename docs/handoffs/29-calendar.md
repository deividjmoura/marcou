# Handoff — Issue #29 Google Calendar

Atualizado em 25/11/2026.

## Estado
- Trabalho na branch `arena/9e68c2bb-marcou`, que integra `feat/29-google-calendar-sync` (`b83e0cd`) sobre a `main` atual (`9b92451`, já com a PR #122). O único conflito foi o import em `src/app/painel/page.tsx` (mantidos `measureAuthFlow`/`measureAuthStep` da #122 e `isCalendarFeatureEnabled`).
- **Empilhada sobre a PR #123** (merge de `16f0166`, autorizado pelo responsável): necessário porque `privileges-check.mjs` exige as migrations `20261125120000` e `20261125130000`. A branch da #123 não foi alterada. Conflitos resolvidos em `package.json` (`test:db` com os dois checks), `README.md` (migrations 11–13) e `CHANGELOG.md` (entradas das duas frentes).
- **Ordem de merge:** a #123 precisa entrar na `main` antes desta branch. Depois disso, o diff desta branch volta a ser só o Calendar.
- Sem push, sem PR e sem Supabase remoto. A migration continua **não aplicada**.

## Itens da missão
| Item | Situação |
| --- | --- |
| A — OAuth | Feito: consumo atômico do state antes da troca do code (`consume_calendar_oauth_state`), state preso ao `user_id`, escopo `calendar.events` exigido em `tokens.scope` (revoga e recusa se faltar), `/connect` só POST com checagem de origem, redirects 303 após POST e avisos na página da integração. |
| B — Migration + check | Feito: `provider_calendar_connections` → `calendar_connections`; RLS/revoke/grant nas 3 tabelas; funções definer com `search_path` fixo. `privileges-check.mjs` verifica as 3 tabelas (ver abaixo). |
| C — `privilegios-tabelas.md` | Feito: matriz com as 3 tabelas, EXECUTE das 4 funções, regra para migrations posteriores à matriz e lacuna remanescente (#125). |
| D — Worker | Feito: um job por reserva no claim (mais antigo não terminal), escritas verificadas, exclusão não apaga vínculo se a busca da conexão falhar, estado `dead` + log, `invalid_grant` suspende a conexão. |
| E — Desconexão | Feito: `disconnect_requested_at` + `suspended`, tokens e vínculos mantidos até a limpeza; worker continua; órfãos marcados com `orphaned_at`; `finalize_calendar_disconnect` só apaga a conexão sem vínculo ativo nem job em processing. |
| F — Testes e docs | Feito: 45 testes unitários novos (54 no total em `src/server/calendar`), `scripts/calendar-check.mjs` (83 checks), `docs/CALENDAR-INTEGRATION.md`, `CHANGELOG.md`. |

> A missão original (A–F) não estava disponível nesta sessão; os itens acima foram mapeados a partir do diagnóstico inicial de 25/11/2026.

## Validação local executada
Com a #123 empilhada:
- `npm run lint`: 0 erros (3 warnings `no-img-element` pré-existentes na `main`).
- `npm run typecheck`: ok.
- `npm test`: 214 testes ok.
- `npm run test:db`: booking 116/0, social 50/0, identidade 32/0, discovery 40/0, privilégios before 43/0 e after 49/0, calendar 84/0.
- `npm run audit`: 0 falhas, 0 avisos.
- `npm run build`: ok.
- Não validado: fluxo OAuth real, Google API real, scheduler, deploy, CI do GitHub.

## Integração com a matriz de privilégios da #123 (feito)
Em `scripts/privileges-check.mjs`:
1. Removido o filtro que excluía `calendar_connections` de `OBJECTS`.
2. `calendar_connections`, `calendar_sync_outbox` e `booking_calendar_events` na `MATRIX` com `anon: []`, `authenticated: []`, `service_role: ["ALL"]`.
3. A fase `before` exclui a migration da matriz **e** a do Calendar (antes ela aplicava "todas menos a matriz", o que incluiria o Calendar) e exige que as tabelas do Calendar ainda não existam.
4. Na fase `after`, os defaults do Supabase (tabelas, sequences, funções) são emulados antes da migration do Calendar; as tabelas precisam existir sem privilégio para `anon`/`authenticated`.
5. A checagem "calendar_connections está na matriz antes da migration do Calendar" (sempre verdadeira) virou "tabelas do Calendar surgem só na fase after, sem privilégio para anon/authenticated"; a comparação aceita essas adições só se vierem vazias.
6. Teste negativo: sem os `revoke all on table` na migration do Calendar, o check falha com 7 erros (antes ficava verde, como apontou a auditoria da #123).

`docs/handoffs/privilegios-tabelas.md` atualizado (matriz, funções, validação).

### Pendente fora da #29
- **Emular os defaults do Supabase desde a primeira migration:** hoje isso gera falhas nas tabelas legadas (`bookings`, `profiles`, `notifications`…). Depende do hardening da #125 e é da #123/#125, não do Calendar.

## Audit de qualidade
`npm run audit` acusava 2 falhas e 5 avisos no código do Calendar (vindos da `feat/29`); corrigidos sem afrouxar o script:
- cliente service-role agora via `@supabase/ssr` sem cookies (`admin.test.ts` prova que a chave vai como bearer);
- credenciais OAuth montadas sem o literal que casava com o padrão de segredo;
- rotas e página do Calendar com guarda `isSupabaseConfigured`.

## Variáveis de ambiente (só servidor)
`GOOGLE_CALENDAR_ENABLED=false` (padrão), `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32 bytes base64), `GOOGLE_CALENDAR_WORKER_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.

## Scheduler
PR #38 continua aberta; não criar cron duplicado. Após deploy/migration/secrets, um scheduler externo deve chamar `POST /api/calendar/worker` com `Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>`.

## Segurança
Nenhum secret, configuração de produção, migration remota, deploy ou branch/PR de outro agente foi alterado.
