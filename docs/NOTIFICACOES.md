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
`booking.reminder` para agendamentos `confirmed` que começam dentro da janela.
A chave de idempotência é `reminder-<booking>-<YYYYMMDD>`, portanto cada
agendamento recebe no máximo um lembrete por dia. A função é `security definer`
e só pode ser executada por `service_role` (`anon`/`authenticated` não têm
`execute`).

Ainda não existe cron configurado para chamá-la. Para agendar:

- Supabase: `pg_cron` + `pg_net`, ou uma Edge Function agendada chamando a RPC
  com a `service_role` key; ou
- Vercel Cron: uma rota protegida por `CRON_SECRET` chamando a RPC com a
  `service_role` key.

Nenhuma dessas opções está provisionada. Nenhuma credencial nova foi criada.

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
- `create_booking_reminders` criando e depois não duplicando no mesmo dia.



## Endpoint de scheduler de lembretes e expiração (implementação local)

A rota protegida `GET /api/cron` executa os dois jobs de domínio quando invocada:
- `expire_stale_bookings()`: expira holds vencidos e registra o evento de auditoria;
- `create_booking_reminders(24)`: cria notificações internas para reservas confirmadas que começam nas próximas 24 horas.

A rota usa a service role **somente no servidor** e exige `Authorization: Bearer <CRON_SECRET>`. A comparação do token é feita em tempo constante. Sem segredo ou credenciais, a rota falha fechada (401/503); erros dos RPCs retornam 500 e são registrados sem expor credenciais. Os dois RPCs são idempotentes no banco, portanto chamadas repetidas não devem duplicar expirações ou lembretes.

### Agendamento ainda bloqueado por decisão de infraestrutura

A primeira tentativa de configurar Vercel Cron a cada cinco minutos recebeu falha de deployment. O link oficial indicado pelo check da Vercel leva à documentação de limites: no plano Hobby, Cron Jobs aceitam apenas uma execução por dia; frequências menores que diárias exigem Pro/Enterprise. Uma execução diária é inadequada para holds de reserva com duração padrão de 30 minutos. Por isso, **não deixamos uma agenda que possa quebrar o deploy nem reduzimos silenciosamente a frequência**.

Para ativar corretamente, o responsável precisa confirmar um destes caminhos:
- Vercel Pro/Enterprise, permitindo Cron a cada 5 minutos; ou
- um scheduler externo/Supabase Cron com acesso seguro à rota/RPC.

### Configuração necessária quando o scheduler for escolhido

Adicionar ao ambiente **Production** da Vercel (ou ao ambiente do scheduler escolhido), manualmente e fora do Git:
- `CRON_SECRET`: token aleatório forte (pelo menos 32 bytes);
- `SUPABASE_SERVICE_ROLE_KEY`: service role key do projeto Supabase correspondente.

A URL pública do Supabase é lida de `NEXT_PUBLIC_SUPABASE_URL`. Não colocar a service role em variáveis `NEXT_PUBLIC_*`, arquivos versionados ou logs. Nenhuma variável, secret, migration remota ou deployment de produção foi alterado nesta entrega.

### Verificações e limites

- Testes unitários cobrem token correto, token incorreto, header ausente/malformado e ausência de `CRON_SECRET`.
- O CI valida lint, typecheck, testes, test:db e build.
- A execução agendada real depende de decisão do plano/provedor, configuração manual dos secrets e deploy.
- E-mail permanece fora desta entrega: falta o responsável escolher o provedor e autorizar sua configuração.
