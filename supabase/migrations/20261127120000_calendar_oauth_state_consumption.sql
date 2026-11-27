-- Consumo atômico e de uso único do OAuth state do Google Calendar (Issue #29).
-- Additive; não aplicada em nenhum banco remoto.
--
-- Antes desta migration o callback lia `oauth_state_hash` com um SELECT e só o
-- limpava no UPDATE final, depois da troca do código. Dois callbacks
-- simultâneos podiam validar o mesmo state e disputar o mesmo `code` de uso
-- único no Google. A RPC abaixo consome o state em uma única instrução: a
-- primeira chamada recebe o `provider_id` e anula o hash na mesma transação; as
-- seguintes (replay ou concorrentes) recebem conjunto vazio.
create or replace function public.consume_calendar_oauth_state(p_state_hash text)
returns table (provider_id uuid)
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.provider_calendar_connections as connection
     set oauth_state_hash = null,
         oauth_state_expires_at = null,
         updated_at = now()
   where connection.oauth_state_hash = p_state_hash
     and p_state_hash ~ '^[0-9a-f]{64}$'
     and connection.oauth_state_expires_at is not null
     and connection.oauth_state_expires_at > now()
  returning connection.provider_id;
$$;

comment on function public.consume_calendar_oauth_state(text) is
  'Consome (uso único, atômico) um OAuth state não expirado e devolve o provider dono. Server-side only.';

revoke all on function public.consume_calendar_oauth_state(text) from public;
revoke all on function public.consume_calendar_oauth_state(text) from anon, authenticated;
grant execute on function public.consume_calendar_oauth_state(text) to service_role;
