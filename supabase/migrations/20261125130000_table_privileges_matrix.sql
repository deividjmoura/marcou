-- SECURITY — matriz canônica de privilégios de tabelas e views do schema public.
--
-- Esta migration é aditiva e não altera dados, RLS, assinaturas nem lógica.
-- Ela aplica o único endurecimento pendente da matriz: a aplicação lê e grava
-- notificações exclusivamente pelas RPCs `mark_notification_read` e
-- `mark_all_notifications_read` (ambas SECURITY DEFINER), então o acesso
-- direto de `authenticated` à tabela passa a ser somente SELECT.
--
-- A matriz completa (tabela/operação/papel) está documentada em
-- docs/handoffs/privilegios-tabelas.md e é verificada por
-- scripts/privileges-check.mjs, ligado a `npm run test:db`.
--
-- Ordem em relação ao Calendar (#29): esta migration vem ANTES da migration
-- que criar `public.calendar_connections`. O bloco condicional abaixo já
-- registra a tabela de tokens na matriz; a migration do Calendar deve criar a
-- tabela com RLS e repetir os REVOKE/GRANT abaixo (ou falhará no check).

begin;

-- Notificações: remover a única write direta concedida a clientes. As RPCs
-- continuam funcionando porque executam como definer, não como o chamador.
revoke all on table public.notifications from public, anon;
grant select on table public.notifications to authenticated;
revoke update on table public.notifications from authenticated;
grant all on table public.notifications to service_role;

-- booking_services continua na matriz com o menor conjunto possível. O
-- REVOKE explicito neutraliza os default privileges do Supabase para tabelas
-- criadas depois da fundação (ver handbook/handoff). Nada muda em
-- bookings, booking_events ou nas demais tabelas existentes.
revoke all on table public.booking_services from public, anon, authenticated;
grant select on table public.booking_services to authenticated;
grant all on table public.booking_services to service_role;

-- `calendar_connections` ainda não existe: a tabela de tokens do Calendar
-- (#29) entra na matriz como objeto futuro, sem acesso a anon/authenticated.
-- Quando a migration do Calendar criar a tabela, este bloco passa a valer.
do $$
begin
  if to_regclass('public.calendar_connections') is not null then
    execute 'revoke all on table public.calendar_connections from public, anon, authenticated';
    execute 'grant all on table public.calendar_connections to service_role';
  end if;
end
$$;

commit;
