# Google Calendar — integração unidirecional

## Escopo v1
Sincroniza eventos do Marcou para o Google Calendar do prestador. Google Calendar não altera disponibilidade, preços, status ou reservas do Marcou.

- `booking.confirmed`: cria evento.
- `booking.cancelled` e `booking.expired`: remove evento associado.
- Reagendamento / `booking.changed`: fora da v1.
- O evento contém apenas o snapshot do serviço, início e fim, no fuso IANA do prestador. **Não inclui nome, telefone, e-mail nem dados pessoais do cliente.** Um identificador interno mínimo poderá ser usado somente em metadados privados se necessário para idempotência.
- Evento determinístico e outbox garantem idempotência e retry.

## Arquitetura
Eventos persistidos em `booking_events` são capturados por trigger e inseridos na `calendar_sync_outbox` na mesma transação. O worker protegido processa jobs e mantém o vínculo em `booking_calendar_events`.

O worker usa `FOR UPDATE SKIP LOCKED` via RPC para reivindicar lotes. Falhas transitórias recebem backoff exponencial com limite; erros permanentes (revogação/invalid_grant) suspendem a conexão. A operação deve ser repetível: cria com ID determinístico e remove pelo ID mapeado.

## OAuth e armazenamento
OAuth independente do Supabase Auth; solicita somente `calendar.events`, offline access e consentimento explícito. State aleatório é validado e expira. Refresh token e access token são cifrados AES-256-GCM com chave exclusiva do servidor. Nunca retornados ao navegador nem registrados em logs. Desconectar revoga best-effort o token e elimina a conexão cifrada.

### Consumo do state
`/api/calendar/connect` grava apenas `sha256(state)` em `provider_calendar_connections` com validade de 10 minutos. O callback consome esse hash pela RPC `consume_calendar_oauth_state(text)` (`SECURITY DEFINER`, `search_path = pg_catalog, public`, `EXECUTE` somente para `service_role`), que anula `oauth_state_hash`/`oauth_state_expires_at` e devolve o `provider_id` na **mesma instrução**, antes de `exchangeOAuthCode()`.

Consequências do contrato:

- o primeiro callback válido recebe o `provider_id`; callbacks concorrentes ou repetidos recebem conjunto vazio e caem em `calendar=expired-state`;
- state expirado, inexistente ou malformado nunca é consumido nem aceito;
- se a troca do código, a propriedade do prestador ou a persistência dos tokens falhar depois do consumo, o state não é restaurado e o usuário precisa autorizar novamente;
- um `connect` concorrente que grave um state novo não é apagado pela persistência de tokens, porque o `UPDATE` final não toca mais nas colunas de state.

## Dados e privacidade
V1 usa `service_name_snapshot`, `starts_at`, `ends_at` e `timezone`. Não inclui nome do cliente. A descrição deve permanecer vazia ou conter somente informação operacional não pessoal. Não sincroniza reservas pendentes de pagamento/revisão.

## Retry, operação e scheduler
Worker exige bearer secret, falha fechado e limita lote. Erros são registrados por código/estado, sem tokens nem payload pessoal. Retry com backoff; conexões revogadas são marcadas para reconexão.

A PR #38 propõe `GET /api/cron`, mas não está mesclada nem tem scheduler ativo confirmado. Esta entrega não cria cron concorrente. O worker deve ser chamado por job externo (por exemplo, scheduler configurado pelo operador) após deploy e configuração de secrets.

## Feature flag
`GOOGLE_CALENDAR_ENABLED=false` por padrão. UI e endpoints desativados até configuração completa. O rollout exige Google OAuth client, redirect URI, encryption key e worker secret, configurados fora do Git.

## Variáveis
- `GOOGLE_CALENDAR_ENABLED`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32 bytes, base64)
- `GOOGLE_CALENDAR_WORKER_SECRET`
- `NEXT_PUBLIC_SITE_URL`

Não registrar secrets, tokens, código OAuth ou conteúdo de eventos.

## Rollback
Desativar feature flag, parar o scheduler externo, desconectar prestadores e, se necessário, excluir eventos já criados usando os IDs persistidos. Não reverter migration sem backup e revisão dos dados de outbox/mapeamento.

## Fora da v1
Sincronização reversa, reagendamento, nome do cliente (somente com consentimento e revisão de privacidade), escolha de calendário e gestão avançada de conflitos.
