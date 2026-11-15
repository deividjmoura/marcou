-- Notificações no aplicativo para clientes e profissionais.
--
-- A origem das notificações é o próprio booking_events: um trigger cria as
-- mensagens de forma transacional e idempotente (event_key = id do evento por
-- destinatário). Nenhuma notificação é disparada diretamente pela interface.

create type public.notification_kind as enum (
  'booking_created',
  'booking_proof_received',
  'booking_confirmed',
  'booking_cancelled',
  'booking_expired',
  'booking_reminder',
  'booking_changed'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text not null,
  booking_id uuid references public.bookings (id) on delete cascade,
  event_key text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key),
  constraint notifications_read_at_requires_read check (
    is_read or read_at is null
  )
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Sem INSERT/DELETE por política: o trigger (security definer) é a única origem.

-- Monta os destinatários e o conteúdo de cada tipo de evento de agendamento.
create or replace function public.notification_payloads(
  p_event text,
  p_booking public.bookings,
  p_provider public.providers,
  p_when text
)
returns table (
  recipient_id uuid,
  kind public.notification_kind,
  title text,
  body text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  case p_event
    when 'booking.created' then
      return query
      select p_booking.customer_id,
             'booking_created'::public.notification_kind,
             'Solicitação recebida',
             'Recebemos sua solicitação para "' || p_booking.service_name_snapshot
               || '" em ' || p_when || '.';
      return query
      select p_provider.owner_id,
             'booking_created'::public.notification_kind,
             'Novo agendamento',
             'Você recebeu uma solicitação para "' || p_booking.service_name_snapshot
               || '" em ' || p_when || '.';
    when 'booking.proof_received' then
      return query
      select p_provider.owner_id,
             'booking_proof_received'::public.notification_kind,
             'Comprovante recebido',
             'Recebemos o comprovante da solicitação para "'
               || p_booking.service_name_snapshot || '" em ' || p_when || '.';
    when 'booking.confirmed' then
      return query
      select p_booking.customer_id,
             'booking_confirmed'::public.notification_kind,
             'Agendamento confirmado',
             'Seu agendamento de "' || p_booking.service_name_snapshot
               || '" em ' || p_when || ' foi confirmado.';
      return query
      select p_provider.owner_id,
             'booking_confirmed'::public.notification_kind,
             'Agendamento confirmado',
             'O agendamento de "' || p_booking.service_name_snapshot
               || '" em ' || p_when || ' foi confirmado.';
    when 'booking.cancelled' then
      return query
      select p_booking.customer_id,
             'booking_cancelled'::public.notification_kind,
             'Agendamento cancelado',
             'Sua solicitação para "' || p_booking.service_name_snapshot
               || '" em ' || p_when || ' foi cancelada.';
      return query
      select p_provider.owner_id,
             'booking_cancelled'::public.notification_kind,
             'Agendamento cancelado',
             'A solicitação para "' || p_booking.service_name_snapshot
               || '" em ' || p_when || ' foi cancelada.';
    when 'booking.expired' then
      return query
      select p_booking.customer_id,
             'booking_expired'::public.notification_kind,
             'Reserva expirada',
             'Sua reserva para "' || p_booking.service_name_snapshot
               || '" expirou por falta de confirmação do sinal.';
      return query
      select p_provider.owner_id,
             'booking_expired'::public.notification_kind,
             'Reserva expirada',
             'A reserva para "' || p_booking.service_name_snapshot
               || '" expirou e o horário foi liberado.';
    when 'booking.reminder' then
      return query
      select p_booking.customer_id,
             'booking_reminder'::public.notification_kind,
             'Lembrete de agendamento',
             'Seu agendamento de "' || p_booking.service_name_snapshot
               || '" é em ' || p_when || '.';
      return query
      select p_provider.owner_id,
             'booking_reminder'::public.notification_kind,
             'Lembrete de agendamento',
             'Você tem "' || p_booking.service_name_snapshot
               || '" em ' || p_when || '.';
    when 'booking.changed' then
      return query
      select p_booking.customer_id,
             'booking_changed'::public.notification_kind,
             'Agendamento alterado',
             'Seu agendamento de "' || p_booking.service_name_snapshot
               || '" foi alterado.';
      return query
      select p_provider.owner_id,
             'booking_changed'::public.notification_kind,
             'Agendamento alterado',
             'O agendamento de "' || p_booking.service_name_snapshot
               || '" foi alterado.';
  end case;
end;
$$;

revoke all on function public.notification_payloads(text, public.bookings, public.providers, text) from public;

-- AFTER INSERT: se uma notificação falhar, o evento de agendamento já foi
-- persistido e o commit segue; a mensagem não pode impedir a operação.
create or replace function public.notify_on_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_provider public.providers;
  v_when text;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then
    return null;
  end if;

  select * into v_provider from public.providers where id = v_booking.provider_id;
  v_when := to_char(
    v_booking.starts_at at time zone v_booking.timezone,
    'DD/MM/YYYY HH24:MI'
  );

  insert into public.notifications
    (recipient_id, kind, title, body, booking_id, event_key)
  select
    payload.recipient_id,
    payload.kind,
    payload.title,
    payload.body,
    v_booking.id,
    new.id::text
  from public.notification_payloads(
    new.event_type, v_booking, v_provider, v_when
  ) as payload
  on conflict (recipient_id, event_key) do nothing;

  return null;
end;
$$;

revoke all on function public.notify_on_booking_event() from public;

create trigger booking_events_notify
  after insert on public.booking_events
  for each row execute function public.notify_on_booking_event();

-- Gera lembretes de agendamentos confirmados que começam dentro da janela.
-- Idempotente por dia e por agendamento; chamado por service role/cron.
create or replace function public.create_booking_reminders(p_within_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with inserted as (
    insert into public.booking_events
      (booking_id, event_type, actor_id, source, reason, external_event_id)
    select
      b.id,
      'booking.reminder',
      null,
      'system',
      'Lembrete automático de agendamento',
      'reminder-' || b.id::text || '-' || to_char(now(), 'YYYYMMDD')
    from public.bookings b
    where b.status = 'confirmed'
      and b.starts_at > now()
      and b.starts_at <= now() + make_interval(hours => p_within_hours)
    on conflict (source, external_event_id) do nothing
    returning booking_id
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.create_booking_reminders(integer) from anon, authenticated;
grant execute on function public.create_booking_reminders(integer) to service_role;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_notification public.notifications;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  update public.notifications
  set is_read = true, read_at = now()
  where id = p_notification_id and recipient_id = v_actor
  returning * into v_notification;

  if not found then
    raise exception 'notification_not_found' using errcode = 'P0001';
  end if;

  return v_notification;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  update public.notifications
  set is_read = true, read_at = now()
  where recipient_id = v_actor and not is_read;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Privilégios da nova tabela (o grant genérico de 0002 cobria apenas as
-- tabelas existentes naquele momento).
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
