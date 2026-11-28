-- Fila idempotente de entrega por e-mail (Issue #26).
--
-- Esta migration prepara apenas o armazenamento server-only e as operações
-- idempotentes de enfileiramento e reprocessamento seguro de itens `dead`.
-- Nenhum trigger, cron ou provedor externo de e-mail está ativado por padrão.
--
-- Privacidade (LGPD): a fila NÃO armazena endereço de e-mail nem conteúdo do
-- corpo; guarda apenas IDs internos (`booking_id`, `recipient_id`), chave de
-- idempotência (`booking_id:event_type:window_key:recipient_role`) e metadados
-- operacionais de retry/backoff/dead.

create table public.email_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  recipient_role text not null,
  event_type text not null,
  window_key text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  lease_token uuid,
  provider_name text,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  dead_at timestamptz,
  reprocessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_delivery_queue_recipient_role_check check (
    recipient_role in ('customer', 'provider')
  ),
  constraint email_delivery_queue_event_type_check check (
    event_type in (
      'booking.created',
      'booking.proof_received',
      'booking.confirmed',
      'booking.cancelled',
      'booking.expired',
      'booking.reminder',
      'booking.changed'
    )
  ),
  constraint email_delivery_queue_window_key_check check (
    length(btrim(window_key)) between 1 and 120
  ),
  constraint email_delivery_queue_status_check check (
    status in ('pending', 'processing', 'sent', 'dead')
  ),
  constraint email_delivery_queue_attempts_check check (
    attempts >= 0 and max_attempts between 1 and 20
  ),
  constraint email_delivery_queue_sent_at_check check (
    status <> 'sent' or sent_at is not null
  ),
  constraint email_delivery_queue_dead_at_check check (
    status <> 'dead' or dead_at is not null
  )
);

create index email_delivery_queue_claim_idx
  on public.email_delivery_queue (next_attempt_at, created_at)
  where status in ('pending', 'processing');

create index email_delivery_queue_booking_idx
  on public.email_delivery_queue (booking_id, event_type);

alter table public.email_delivery_queue enable row level security;

-- Tabela estritamente server-only (nenhum privilégio nem política para clientes).
revoke all on table public.email_delivery_queue from public, anon, authenticated;
grant all on table public.email_delivery_queue to service_role;

comment on table public.email_delivery_queue is
  'Fila server-only idempotente para futura entrega de e-mails transacionais (#26). Sem PII nem corpo; desligada por padrão até decisão de provedor.';

-- Enfileira uma entrega de e-mail de forma idempotente pela chave canônica
-- `<booking_id>:<event_type>:<window_key>:<recipient_role>`.
-- Retorna o UUID do item criado ou NULL se a chave já existir.
create or replace function public.enqueue_email_delivery(
  p_booking_id uuid,
  p_recipient_id uuid,
  p_recipient_role text,
  p_event_type text,
  p_window_key text,
  p_max_attempts integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window text := btrim(coalesce(p_window_key, ''));
  v_key text;
  v_id uuid;
begin
  if p_booking_id is null or p_recipient_id is null then
    raise exception 'invalid_email_queue_target' using errcode = 'P0001';
  end if;

  if p_recipient_role is null or p_recipient_role not in ('customer', 'provider') then
    raise exception 'invalid_email_recipient_role' using errcode = 'P0001';
  end if;

  if v_window = '' or length(v_window) > 120 or v_window ~ '[:\s]' then
    raise exception 'invalid_email_window_key' using errcode = 'P0001';
  end if;

  v_key := p_booking_id::text || ':' || p_event_type || ':' || v_window || ':' || p_recipient_role;

  insert into public.email_delivery_queue (
    idempotency_key,
    booking_id,
    recipient_id,
    recipient_role,
    event_type,
    window_key,
    max_attempts
  )
  values (
    v_key,
    p_booking_id,
    p_recipient_id,
    p_recipient_role,
    p_event_type,
    v_window,
    coalesce(p_max_attempts, 5)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_email_delivery(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_email_delivery(uuid, uuid, text, text, text, integer)
  to service_role;

-- Reprocessamento seguro exclusivo de itens no estado terminal `dead`.
-- Nunca reabre itens `sent`, `pending` ou `processing` e preserva a mesma
-- `idempotency_key`.
create or replace function public.reprocess_dead_email_delivery(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if p_job_id is null then
    return false;
  end if;

  update public.email_delivery_queue
     set status = 'pending',
         attempts = 0,
         next_attempt_at = now(),
         locked_until = null,
         lease_token = null,
         last_error_code = null,
         dead_at = null,
         reprocessed_at = now(),
         updated_at = now()
   where id = p_job_id
     and status = 'dead';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.reprocess_dead_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.reprocess_dead_email_delivery(uuid)
  to service_role;
