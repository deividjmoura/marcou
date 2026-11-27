-- SECURITY (#125) — privilégios de tabela herdados do GRANT ALL padrão do
-- Supabase nas 8 tabelas criadas antes da convenção `revoke all … grant …`.
--
-- No Supabase, toda tabela nova de `public` nasce com ALL (inclusive TRUNCATE,
-- REFERENCES e TRIGGER) para anon e authenticated. O RLS barra escrita via API,
-- mas TRUNCATE ignora RLS, e I/U/D sem política só é inofensivo enquanto o RLS
-- estiver certo. Esta migration deixa cada tabela com o conjunto exato que a
-- aplicação usa:
--   - escrita direta só onde existe política de escrita para authenticated;
--   - SELECT de anon só onde existe política de leitura que vale para anon;
--   - nenhum TRUNCATE/REFERENCES/TRIGGER para clientes.
--
-- Escritas da aplicação que NÃO dependem de privilégio de tabela (SECURITY
-- DEFINER): create_booking, transition_booking, notify_on_booking_event,
-- mark_notification_read, mark_all_notifications_read.
--
-- Não altera dados, RLS, políticas, funções nem ALTER DEFAULT PRIVILEGES
-- (decisão registrada na #125). Reexecutável. Matriz verificada por
-- scripts/privileges-check.mjs com os defaults do Supabase emulados desde a
-- primeira migration. Rollback: GRANT do privilégio específico de volta na
-- tabela afetada — nunca GRANT ALL.

begin;

revoke all on table
  public.profiles,
  public.providers,
  public.services,
  public.availability_rules,
  public.availability_exceptions,
  public.bookings,
  public.booking_events,
  public.notifications
from public, anon, authenticated;

-- Perfil próprio: upsert no login/cadastro/callback. Sem política de DELETE.
grant select, insert, update on table public.profiles to authenticated;

-- Estabelecimento: leitura pública (política sem papel), criação e edição pelo
-- dono. Sem política de DELETE.
grant select on table public.providers to anon;
grant select, insert, update on table public.providers to authenticated;

-- Serviços e disponibilidade: leitura pública e gestão completa pelo dono.
grant select on table public.services, public.availability_rules, public.availability_exceptions to anon;
grant select, insert, update, delete on table
  public.services,
  public.availability_rules,
  public.availability_exceptions
to authenticated;

-- Reservas e eventos: só leitura pelos participantes; escrita apenas pelas
-- RPCs/trigger SECURITY DEFINER. Nenhuma política vale para anon.
grant select on table public.bookings, public.booking_events to authenticated;

-- Notificações: leitura pelo destinatário; marcar como lida só via RPC
-- (mesmo contrato da 20261125130000).
grant select on table public.notifications to authenticated;

grant all on table
  public.profiles,
  public.providers,
  public.services,
  public.availability_rules,
  public.availability_exceptions,
  public.bookings,
  public.booking_events,
  public.notifications
to service_role;

commit;
