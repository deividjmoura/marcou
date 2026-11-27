# Google Calendar — integração unidirecional

## Escopo v1
Sincroniza eventos do Marcou para o Google Calendar do prestador. O Google Calendar não altera disponibilidade, preços, status nem reservas do Marcou: eventos externos não criam falsa disponibilidade nem burlam as garantias do banco de reservas.

- `booking.confirmed`: cria/atualiza o evento.
- `booking.cancelled` e `booking.expired`: removem o evento associado.
- Reagendamento / `booking.changed`: fora da v1.
- Ao conectar (ou reconectar após suspensão), reservas confirmadas futuras são reenviadas (backfill, ver abaixo).
- O evento contém apenas o snapshot do serviço, início e fim, no fuso IANA do prestador. Em reservas com vários serviços (PR #123), o título é o `service_name_snapshot` agregado ("Corte + Barba", até 180 caracteres) e o fim cobre a duração somada. **Não inclui nome, telefone, e-mail, ID da reserva nem outro dado pessoal do cliente.**
- ID de evento determinístico (`googleEventIdForBooking`) + outbox garantem idempotência e retry.

## Arquitetura
Eventos gravados em `booking_events` são capturados pelo trigger `booking_events_calendar_outbox` e inseridos na `calendar_sync_outbox` na mesma transação. O worker (`POST /api/calendar/worker`) reivindica jobs pela RPC `claim_calendar_sync_jobs` e mantém o vínculo reserva → evento em `booking_calendar_events`.

Código em `src/server/calendar/`:

| Módulo | Papel |
| --- | --- |
| `oauth.ts` / `oauth-flow.ts` | URL de autorização, state, callback (consumo atômico, escopo, refresh token) |
| `google.ts` | Cliente HTTP do Google com classificação de erros (retentável × permanente) |
| `store.ts` | Persistência via service role; toda escrita confirma a linha afetada |
| `worker.ts` | Processamento de jobs, tokens, retry/`dead`, limpeza de desconexão |
| `status.ts` | Estado exibido no painel |
| `http.ts` | Checagem de origem e redirects 303 |

### Reenvio ao conectar (backfill)
O trigger `calendar_connections_backfill_on_connect` roda na transição de `connection_status` para `connected` (primeira conexão, reconexão após suspensão ou linha inserida já conectada), na mesma transação que grava os tokens. Ele enfileira jobs com `reason = 'backfill'` e `booking_event_id` nulo, sem gravar nada em `booking_events`, para:
- reservas **confirmadas** do prestador que ainda não terminaram (`ends_at > now()`);
- reservas **não confirmadas** que ainda têm evento ativo no Google, por exemplo canceladas durante uma suspensão, quando o job de remoção foi para `dead`.

Ficam de fora as reservas que já têm job `pending`, as já terminadas e as de outros prestadores. O limite é de 500 reservas por conexão, das mais próximas para as mais distantes. O worker trata esses jobs como qualquer outro: decide pelo estado atual, e uma reserva já sincronizada vira `PATCH`. Update `connected → connected` não reenfileira.

### Ordem e idempotência
- O claim devolve **no máximo um job por reserva**: sempre o mais antigo não terminal (`pending`/`failed`/`processing`). Se esse job ainda está em `processing` (não vencido) ou em backoff, a reserva inteira espera — confirmação e cancelamento nunca correm juntos nem invertidos. `created_at` usa `clock_timestamp()`.
- O worker relê o status atual da reserva (idempotência por estado): confirmada ⇒ evento presente; qualquer outro estado ⇒ evento ausente.
- Insert com ID determinístico; `409` vira `PATCH`. `404/410` no `DELETE` contam como removido.

### Retry e estado terminal
- Erros transitórios (rede, `401/403/408/429/5xx`, falha de persistência) voltam para `failed` com backoff exponencial (30 s → 1 h).
- Na 8.ª tentativa, ou em erro permanente (demais `4xx`, cifra ilegível), o job vai para **`dead`** com `last_error_code` e `completed_at`, e o worker registra `job_dead` (só IDs internos e código). Jobs presos em `processing` após a última tentativa são marcados `dead` pelo próprio claim (`worker_timeout_max_attempts`).
- `invalid_grant` no refresh **suspende a conexão** (`connection_status = suspended`, `suspended_reason = invalid_grant`) e encerra o job sem retry. O painel pede reconexão.
- Falha ao gravar `succeeded`/`failed`/`dead` não é ignorada: o job fica em `processing`, é contado em `persistErrors` e volta a ser reivindicado após 10 min (seguro porque o processamento é idempotente).
- Na exclusão, se a busca da conexão falha, nada é apagado (nem vínculo nem evento). Sem conexão, o vínculo é marcado `orphaned_at` em vez de removido.

## OAuth e armazenamento
OAuth independente do Supabase Auth; solicita somente `https://www.googleapis.com/auth/calendar.events`, `access_type=offline` e `prompt=consent`.

- `/api/calendar/connect` aceita **só POST** com `Origin` igual a `NEXT_PUBLIC_SITE_URL` (sem a variável, falha fechada). Responde `303` para o Google.
- O state é aleatório (32 bytes), vale 10 min e só o hash SHA-256 é salvo, junto com o `user_id` de quem iniciou (`oauth_state_user_id`).
- No callback, `consume_calendar_oauth_state` consome o state **antes** de trocar o code: `SELECT … FOR UPDATE` + anulação na mesma transação. Replay e callbacks simultâneos falham; state de outro usuário é recusado e queimado. Depois, confere se o usuário ainda é dono do prestador.
- O escopo `calendar.events` precisa constar em `tokens.scope`; sem ele (ou sem refresh token), o token emitido é revogado e a conexão é recusada.
- Refresh e access tokens são cifrados AES-256-GCM (chave de 32 bytes exclusiva do servidor), nunca retornados ao navegador nem registrados em logs. O access token salvo é reaproveitado até 1 min antes de vencer.

## Desconexão
1. `POST /api/calendar/disconnect` (mesma checagem de origem) marca a conexão como `suspended` com `disconnect_requested_at`. Tokens e vínculos **são mantidos**.
2. A rota tenta a limpeza na hora: remove do Google cada evento mapeado e só então apaga o vínculo.
3. O que falhar fica para o worker, que repete a limpeza a cada execução (painel mostra "desconexão em andamento"). Jobs de sincronização desse prestador viram no-op (`calendar_disconnecting`).
4. Se o token foi revogado (`invalid_grant`), os vínculos restantes recebem `orphaned_at` (rastro) e o painel avisa quantos eventos precisam ser removidos manualmente.
5. `finalize_calendar_disconnect` só apaga a conexão quando não há vínculo ativo nem job em `processing` do prestador; devolve o refresh token cifrado para revogação best-effort (falha é registrada, não bloqueia).

Nova conexão não começa enquanto a desconexão está em andamento.

## Banco de dados
Tabelas exclusivas do servidor: `calendar_connections`, `calendar_sync_outbox`, `booking_calendar_events`. RLS ligada, nenhuma policy de cliente, `revoke all … from public, anon, authenticated` e `grant all … to service_role` — neutralizando os default privileges que o Supabase dá a objetos novos. Não há sequences.

Funções (`SECURITY DEFINER`, `search_path = public`, sem EXECUTE para `public/anon/authenticated`):

| Função | EXECUTE |
| --- | --- |
| `enqueue_calendar_sync_from_booking_event()` (trigger) | ninguém (nem `service_role`) |
| `enqueue_calendar_backfill_on_connect()` (trigger) | ninguém (nem `service_role`) |
| `claim_calendar_sync_jobs(integer)` | `service_role` |
| `consume_calendar_oauth_state(text, uuid)` | `service_role` |
| `finalize_calendar_disconnect(uuid)` | `service_role` |

As três tabelas estão na matriz de `scripts/privileges-check.mjs` (PR #123): ausentes na fase `before`, sem privilégio para `anon`/`authenticated` na `after`. `scripts/calendar-check.mjs` (em `npm run test:db`) aplica todas as migrations emulando os default privileges do Supabase e verifica privilégios, RLS, trigger, ordem/exclusividade do claim (inclusive 8 claims paralelos), `dead`, state OAuth e finalização.

## Scheduler
A PR #38 propõe `GET /api/cron`, mas não está mesclada nem tem scheduler ativo. Esta entrega não cria cron concorrente. Depois de deploy, migration e secrets, configurar um job externo para `POST /api/calendar/worker` com `Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>` (lote de 10 jobs + até 5 desconexões por chamada).

## Feature flag e variáveis
`GOOGLE_CALENDAR_ENABLED=true` liga; ausente ou qualquer outro valor desliga (UI e endpoints).

- `GOOGLE_CALENDAR_ENABLED`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32 bytes, base64)
- `GOOGLE_CALENDAR_WORKER_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (origem do redirect OAuth e da checagem de origem)

Redirect URI no Google Cloud: `<NEXT_PUBLIC_SITE_URL>/api/calendar/callback`. Não registrar secrets, tokens, código OAuth ou conteúdo de eventos.

## Limitações conhecidas (v1)
- Evento apagado manualmente no Google não é recriado (`google_event_missing`); o vínculo é mantido.
- O backfill cobre no máximo 500 reservas por conexão. Reservas confirmadas além desse limite só sincronizam no próximo evento delas.
- Jobs que vão para `dead` com a conexão ativa (ex.: 8 falhas transitórias) só são reenviados na próxima reconexão ou no próximo evento da reserva.
- Vínculos órfãos são só rastro; não há botão para limpá-los.
- Só o calendário `primary`.

## Rollback
Desligar a flag, parar o scheduler externo e desconectar prestadores (a limpeza usa os IDs persistidos). Não reverter a migration sem backup e revisão dos dados de outbox/vínculos.

## Fora da v1
Sincronização reversa, reagendamento, nome do cliente (somente com consentimento e revisão de privacidade), escolha de calendário e gestão avançada de conflitos.
