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

## Eventos e destinatários

| Evento (`booking_events.event_type`) | Cliente | Profissional | Tipo |
| --- | --- | --- | --- |
| `booking.created` | sim | sim | `booking_created` |
| `booking.proof_received` | — | sim | `booking_proof_received` |
| `booking.confirmed` | sim | sim | `booking_confirmed` |
| `booking.cancelled` | sim | sim | `booking_cancelled` |
| `booking.expired` | sim | sim | `booking_expired` |
| `booking.reminder` | sim | sim | `booking_reminder` |
| `booking.changed` | sim | sim | `booking_changed` |

`booking.changed` está previsto no mapeamento para futuras edições de
agendamento (reagendamento, alteração de serviço); nenhuma transição atual o
emite.

O texto usa o nome do serviço congelado no snapshot
(`service_name_snapshot`) e o horário formatado no fuso do prestador.

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
- O sino (`NotificationBell`) aparece no painel, em "Meus agendamentos" e na
  página da reserva, com o contador de não lidas.
- Datas são formatadas no fuso do navegador (`Intl.DateTimeFormat`), não no
  fuso do prestador, porque a notificação é um fato do usuário.

## E-mail

**Não implementado.** Nenhuma infraestrutura de envio está configurada no
projeto (não há dependência de envio, nem variável de ambiente de SMTP/API).
A estrutura de notificações é a base para o e-mail futuro: basta consumir
`public.notifications` (ou `booking_events`) e enviar. Para habilitar, seriam
necessários:

- um provedor (Resend/SendGrid/SES etc.) e a dependência correspondente;
- variáveis de ambiente com a chave do provedor (nunca commitadas);
- uma tarefa que envie e registre o resultado, com idempotência por
  `notifications.id`;
- consentimento/preferência de recebimento, se aplicável.

Nada disso foi criado e nenhum botão de e-mail foi adicionado à interface.

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
- `create_booking_reminders` criando e depois não duplicando no mesmo dia; concorrência, cancelamento e reservas expiradas não recebem lembrete.

## Scheduler de lembretes (PR #38)

- **Separação canônica de schedulers:** a PR #128 (`.github/workflows/booking-expiration.yml`) é o único mecanismo canônico de expiração automática de holds (`expire_stale_bookings()`). A rota protegida `GET /api/cron` chama exclusivamente `create_booking_reminders(24)` — não executa expiração e não coexiste com endpoints duplicados de expiração (ver `docs/PLATFORM.md`).
- **Elegibilidade e janela:** a RPC valida `p_within_hours` entre `1` e `168` (lança `invalid_reminder_window` fora da faixa) e seleciona apenas reservas `confirmed`, futuras (`starts_at > now()`) e dentro da janela (`starts_at <= now() + make_interval(hours => p_within_hours)`). Canceladas e expiradas permanecem inelegíveis.
- **Concorrência e serialização:** a migration `20261127000100_reminder_concurrency_lock.sql` usa `FOR UPDATE OF b SKIP LOCKED`, de modo que execuções paralelas não duplicam eventos e transições concorrentes de cancelamento ou expiração são serializadas. Se uma reserva estiver temporariamente bloqueada por outra transação, será reavaliada na execução ou retry seguinte.
- **Idempotência diária por fuso do prestador:** a chave `reminder-<booking-id>-<YYYYMMDD>` usa o dia local do início da reserva em `bookings.timezone` (`to_char(starts_at at time zone timezone, 'YYYYMMDD')`), nunca o fuso da sessão do banco: a virada de data em UTC não gera segundo lembrete enquanto a reserva segue na janela, e o mesmo agendamento recebe no máximo um lembrete. O trigger cria notificações para cliente e prestador.
- **Contrato HTTP e segurança:** `GET /api/cron` é marcado com `import "server-only"`, autentica `Authorization: Bearer <CRON_SECRET>` em tempo constante (`timingSafeEqual`, fail-closed), usa `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor, envia `Cache-Control: private, no-store, max-age=0` em todos os status e responde `401` sem token válido, `503` sem URL/chave configuradas, `500` genérico em erro RPC/exceção e `200` com contagem. Logs registram somente código/nome de erro, sem PII ou segredos.
- **Política de retries do chamador externo:** retentativas automáticas (com backoff) em falhas transitórias de rede, timeout ou HTTP `500` são seguras graças à idempotência da RPC e ao lock `SKIP LOCKED`. Respostas `401` (segredo ausente/inválido) e `503` (ambiente sem configuração) indicam erro operacional e **não** devem entrar em loop de retry — devem gerar alerta.
- **Provisionamento externo pendente (desligado por padrão):** nenhum scheduler externo está ativado por padrão. O hosting canônico da aplicação é **Netlify** (a tentativa inicial com Vercel Cron falhou no plano Hobby por limitar a 1x/dia); o responsável deve escolher e provisionar o agendador externo (ex.: GitHub Actions, serviço de cron HTTPS ou Supabase `pg_cron`/`pg_net`) com frequência adequada (ex.: a cada 15–30 minutos para janela de 24h) e os segredos `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e URL do ambiente.
- E-mail não faz parte desta entrega.
