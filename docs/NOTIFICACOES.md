# Notificações no aplicativo

Como o Marcou avisa clientes e profissionais sobre os agendamentos.

## Origem das notificações

As notificações **não** são disparadas pela interface. A origem é a tabela
`public.booking_events`, que já registra cada mudança de estado do agendamento.
Um trigger (`booking_events_notify`, `after insert`) chama
`public.notify_on_booking_event()`, que monta as mensagens com
`public.notification_payloads()` e as grava em `public.notifications`.

Consequências dessa escolha:

- A notificação nasce na mesma transação do evento, sem estado inconsistente.
- Não existe caminho de UI que crie notificação sem um evento real.
- A função é idempotente por `(recipient_id, event_key)`, onde `event_key` é o
  `id` do evento. Reenviar o mesmo evento não duplica mensagem.

## Matriz evento × destinatário × canal

| Evento (`booking_events.event_type`) | Tipo (`notification_kind`) | Cliente | Profissional | Canal `in_app` (agora) | Canal `email` (futuro, `#26`) | Obrigatório (`in_app`)? |
| --- | --- | --- | --- | --- | --- | --- |
| `booking.created` | `booking_created` | sim | sim | Ativo (padrão: ligado) | Desligado por padrão (não envia) | Não (pode silenciar) |
| `booking.proof_received` | `booking_proof_received` | — | sim | Ativo (padrão: ligado) | Desligado por padrão (não envia) | Não (pode silenciar) |
| `booking.confirmed` | `booking_confirmed` | sim | sim | Ativo (padrão: ligado) | Desligado por padrão (não envia) | Não (pode silenciar) |
| `booking.cancelled` | `booking_cancelled` | sim | sim | Ativo (**sempre ligado**) | Desligado por padrão (não envia) | **Sim — não silenciável** |
| `booking.changed` | `booking_changed` | sim | sim | Ativo (**sempre ligado**) | Desligado por padrão (não envia) | **Sim — não silenciável** |
| `booking.expired` | `booking_expired` | sim | sim | Ativo (padrão: ligado) | Desligado por padrão (não envia) | Não (pode silenciar) |
| `booking.reminder` | `booking_reminder` | sim | sim | Ativo (padrão: ligado) | Desligado por padrão (não envia) | Não (pode silenciar) |

Notas da matriz:

- `booking.changed` já está mapeado e protegido como evento obrigatório para futuras
  edições/reagendamentos de agendamento; nenhuma transição atual o emite.
- **Conteúdo sem exposição de terceiros:** o texto usa apenas o nome do serviço
  congelado no snapshot (`service_name_snapshot`) e o horário formatado no fuso
  do prestador, com link interno para `/reserva/[id]`. Nunca inclui e-mail,
  telefone ou dados pessoais do outro participante.
- **Política de eventos obrigatórios (`OWNER_DECISION`):** o padrão adotado nesta
  entrega torna `booking.cancelled` e `booking.changed` obrigatórios no canal
  `in_app` (conforme recomendação da Issue `#13`), pois silencíá-los causaria
  desencontros críticos de atendimento. O responsável pode revisar esta lista
  em uma migration futura se desejar política diferente.

## Preferências por usuário (Issue `#13`)

A migration `20261128000500_notification_preferences.sql` cria a tabela
`public.notification_preferences (user_id, event_type, channel, enabled)`:

- **Padrão documentado (ausência de registro):**
  - `channel = 'in_app'` → **ligado (`true`)**.
  - `channel = 'email'` → **desligado (`false`)** até haver provedor e credenciais
    configuradas pelo responsável (`#26`).
- **Proteção de eventos obrigatórios em 3 camadas:**
  1. **Banco de dados (constraint `CHECK`):** `notification_preferences_mandatory_in_app_check`
     rejeita qualquer `INSERT`/`UPDATE` com `enabled = false` quando
     `channel = 'in_app'` e `event_type in ('booking.cancelled', 'booking.changed')`.
  2. **Avaliação na emissão:** `public.is_notification_enabled(user_id, event_type, channel)`
     retorna `true` incondicionalmente para eventos obrigatórios em `in_app` e
     fail-closed (`false`) para canais desconhecidos.
  3. **Domínio, Server Action e UI:** `src/domain/notifications/preferences.ts`
     e `saveNotificationPreferencesAction` sempre forçam `enabled = true` em
     eventos obrigatórios, e a interface exibe badge **Obrigatório** + explicação
     clara com controle bloqueado (`Sempre ativo`).
- **RLS e privilégios:** RLS ativa por `user_id = (select auth.uid())` para
  `SELECT`, `INSERT` e `UPDATE`. `anon` não tem nenhum privilégio; `authenticated`
  não tem `DELETE` nem `TRUNCATE`. Coberto em `scripts/privileges-check.mjs` e
  `scripts/db-check.mjs`.
- **Respeito às preferências na emissão:**
  - `public.notify_on_booking_event()` filtra cada destinatário com
    `public.is_notification_enabled(payload.recipient_id, new.event_type, 'in_app')`.
    Desligar uma preferência suprime a notificação **apenas** para aquele usuário;
    a outra parte segue recebendo normalmente e o registro de auditoria em
    `public.booking_events` permanece intacto.
  - `public.create_booking_reminders(p_within_hours)` só emite o evento
    `booking.reminder` quando pelo menos um participante (cliente ou prestador)
    mantém `booking.reminder` ligado em `in_app`. Se ambos desligaram, retorna `0`
    sem poluir `booking_events` ou `notifications`. Quando um ou ambos têm a
    preferência ativa, mantém intactos `FOR UPDATE OF b SKIP LOCKED` e a chave
    diária no fuso do prestador (`reminder-<booking>-<YYYYMMDD>`), preservando a
    idempotência diária mesmo em viradas de data UTC.

## Lembretes

`public.create_booking_reminders(p_within_hours)` cria eventos
`booking.reminder` para agendamentos `confirmed` cujo início (`starts_at`) é
futuro e está dentro da janela informada (`1` a `168` horas; padrão `24`h).
Reservas canceladas, expiradas ou ainda pendentes não são elegíveis.

A chave de idempotência é `reminder-<booking>-<YYYYMMDD>`, em que `<YYYYMMDD>`
é o **dia local do início da reserva no fuso do prestador** (`bookings.timezone`),
nunca o fuso da sessão do banco. Combinada à constraint única
`(source, external_event_id)` com `ON CONFLICT DO NOTHING`, uma virada de data
em UTC ou chamadas repetidas na janela não geram lembrete duplicado. A função é
`security definer` e só pode ser executada por `service_role`
(`anon`/`authenticated` não têm `execute`).

O acionamento HTTP versionado é `GET /api/cron` (ver seção **Scheduler de
lembretes** abaixo); nenhum cron externo está provisionado ou ativado no
repositório. Nenhuma credencial nova foi criada.

## Estado, permissões e isolamento

- Colunas: `is_read` (default `false`), `read_at` (nulo até ser lida) e
  `created_at`. A constraint `notifications_read_at_requires_read` impede
  `read_at` sem `is_read`.
- RLS habilitada. As políticas permitem `select` e `update` somente para o
  próprio `recipient_id` (`auth.uid()`). Não há política de `insert`/`delete`:
  o trigger é a única origem.
- `anon` não tem grant sobre a tabela; `authenticated` tem `select`/`update`;
  `service_role` tem acesso total.
- Marcar como lida é feito por RPC (`mark_notification_read`,
  `mark_all_notifications_read`), que confere `auth.uid()` internamente e
  falha com `notification_not_found` se a notificação não pertencer ao usuário.

## Interface

- `/notificacoes` lista as 50 mais recentes, com título, texto, tipo, data e
  destino. Cada item oferece "Marcar como lida" e link para `/reserva/[id]`.
- O sino (`NotificationBell`) aparece no painel, em "Meus agendamentos", em
  "Minha conta" e na página da reserva, com o contador de não lidas.
- **Gestão de preferências (`NotificationPreferencesForm`):**
  - **Cliente:** seção *Preferências de alertas* em `/minha-conta` (exibe os 6
    eventos aplicáveis ao cliente).
  - **Prestador:** seção *Alertas* no menu do `/painel` (exibe os 7 eventos
    aplicáveis ao prestador, incluindo `booking.proof_received`).
  - Ambas as seções salvam via `saveNotificationPreferencesAction` com feedback
    acessível (`role="status"` / `role="alert"`), identificam eventos obrigatórios
    não silenciáveis e informam que o canal de e-mail segue desligado por padrão.
- Datas são formatadas no fuso do navegador (`Intl.DateTimeFormat`), não no
  fuso do prestador, porque a notificação é um fato do usuário.

## E-mail (fundação neutra — Issue `#26`)

**Envio real desligado por padrão.** Nenhuma credencial de provedor existe,
nenhuma dependência externa de envio foi instalada e nenhum e-mail real é
enviado. A base neutra já está pronta e testada para plugar o provedor escolhido
pelo responsável:

- **ADR do provedor:** `docs/ADR-EMAIL-PROVEDOR.md` (comparativo Resend / Postmark /
  Amazon SES / Brevo cobrindo SPF/DKIM/DMARC, custo, limites, bounce/complaint,
  templates pt-BR e LGPD; aguarda `OWNER_DECISION` sobre provedor e domínio).
- **Interface `EmailSender` + implementação padrão `NoopEmailSender`:**
  `src/server/email/sender.ts` — não faz chamadas externas, mantém logs sem PII
  e é fail-closed (`EMAIL_DELIVERY_ENABLED` desligado por padrão).
- **Fila idempotente com retry/backoff/`dead` e reprocessamento seguro:**
  `supabase/migrations/20261128000700_email_delivery_queue.sql` (tabela
  server-only `public.email_delivery_queue` sem armazenar PII/corpo) e
  `src/server/email/queue.ts` (chave `booking_id:event_type:window_key:recipient_role`,
  backoff exponencial, estado terminal `dead` e `reprocess_dead_email_delivery`
  que nunca reenvia `sent`).
- **Templates pt-BR sem PII de terceiros (`src/server/email/template.ts`):**
  horário no fuso do prestador (`bookings.timezone`), escape HTML e link único
  para `/reserva/[id]` (exige autenticação).
- Nenhum trigger ou cron enfileira/dispara e-mails reais até a escolha do
  provedor e configuração das variáveis pelo responsável.

## Testes

`npm run test:db` aplica as migrations em PostgreSQL real e cobre, na seção
`[notificações]`:

- destinatários corretos em criação, comprovante, confirmação e expiração;
- ausência de notificação para terceiro;
- unicidade do `booking_created` por destinatário;
- transição persistindo mesmo com o trigger;
- RLS: cliente/prestador só leem as próprias; `anon` não lê;
- impossibilidade de o usuário forjar notificação;
- `mark_notification_read` gravando `read_at` e não afetando notificação alheia;
- `mark_all_notifications_read` zerando as não lidas;
- `create_booking_reminders` criando e depois não duplicando no mesmo dia; concorrência, cancelamento e reservas expiradas não recebem lembrete;
- na seção `[preferências de notificação (#13)]`: padrão `in_app` ligado / `email` desligado, isolamento RLS entre usuários (`SELECT`/`INSERT`/`UPDATE` e bloqueio de `anon`), recusa de silenciamento dos eventos obrigatórios (`booking.cancelled` e `booking.changed`), supressão seletiva por destinatário em criação/confirmação, entrega obrigatória de cancelamento pelo prestador sem PII de terceiros e respeito às preferências em `create_booking_reminders(24)` preservando a idempotência diária por fuso do prestador.

Complementarmente, `npm test` cobre o domínio de preferências
(`src/domain/notifications/preferences.test.ts`) e a Server Action
(`src/app/notificacoes/actions.test.ts`).

## Scheduler de lembretes (PR #38)

- **Separação canônica de schedulers:** a PR #128 (`.github/workflows/booking-expiration.yml`) é o único mecanismo canônico de expiração automática de holds (`expire_stale_bookings()`). A rota protegida `GET /api/cron` chama exclusivamente `create_booking_reminders(24)` — não executa expiração e não coexiste com endpoints duplicados de expiração (ver `docs/PLATFORM.md`).
- **Elegibilidade e janela:** a RPC valida `p_within_hours` entre `1` e `168` (lança `invalid_reminder_window` fora da faixa) e seleciona apenas reservas `confirmed`, futuras (`starts_at > now()`) e dentro da janela (`starts_at <= now() + make_interval(hours => p_within_hours)`). Canceladas e expiradas permanecem inelegíveis.
- **Concorrência e serialização:** a migration `20261127000100_reminder_concurrency_lock.sql` usa `FOR UPDATE OF b SKIP LOCKED`, de modo que execuções paralelas não duplicam eventos e transições concorrentes de cancelamento ou expiração são serializadas. Se uma reserva estiver temporariamente bloqueada por outra transação, será reavaliada na execução ou retry seguinte.
- **Idempotência diária por fuso do prestador:** a chave `reminder-<booking-id>-<YYYYMMDD>` usa o dia local do início da reserva em `bookings.timezone` (`to_char(starts_at at time zone timezone, 'YYYYMMDD')`), nunca o fuso da sessão do banco: a virada de data em UTC não gera segundo lembrete enquanto a reserva segue na janela, e o mesmo agendamento recebe no máximo um lembrete. O trigger cria notificações para cliente e prestador.
- **Contrato HTTP e segurança:** `GET /api/cron` é marcado com `import "server-only"`, autentica `Authorization: Bearer <CRON_SECRET>` em tempo constante (`timingSafeEqual`, fail-closed), usa `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor, envia `Cache-Control: private, no-store, max-age=0` em todos os status e responde `401` sem token válido, `503` sem URL/chave configuradas, `500` genérico em erro RPC/exceção e `200` com contagem. Logs registram somente código/nome de erro, sem PII ou segredos.
- **Política de retries do chamador externo:** retentativas automáticas (com backoff) em falhas transitórias de rede, timeout ou HTTP `500` são seguras graças à idempotência da RPC e ao lock `SKIP LOCKED`. Respostas `401` (segredo ausente/inválido) e `503` (ambiente sem configuração) indicam erro operacional e **não** devem entrar em loop de retry — devem gerar alerta.
- **Provisionamento externo pendente (desligado por padrão):** nenhum scheduler externo está ativado por padrão. O hosting canônico da aplicação é **Netlify** (a tentativa inicial com Vercel Cron falhou no plano Hobby por limitar a 1x/dia); o responsável deve escolher e provisionar o agendador externo (ex.: GitHub Actions, serviço de cron HTTPS ou Supabase `pg_cron`/`pg_net`) com frequência adequada (ex.: a cada 15–30 minutos para janela de 24h) e os segredos `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e URL do ambiente.
- E-mail não faz parte desta entrega.
