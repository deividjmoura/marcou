# Permissões de funções `SECURITY DEFINER`

## Risco corrigido

O PostgreSQL concede `EXECUTE` a `PUBLIC` por padrão quando uma função é criada.
Revogar apenas de `anon` ou `authenticated` não fecha o acesso efetivo, porque
esses papéis herdam os privilégios de `PUBLIC`.

No schema histórico, os jobs `expire_stale_bookings()` e
`create_booking_reminders(integer)` pretendiam ser exclusivos de
`service_role`, mas a revogação não removia o grant público padrão. As funções de
marcar notificações também tinham superfície maior que o contrato documentado.

A migration `20261123133000_harden_security_definer_grants.sql`:

1. remove `EXECUTE` de `PUBLIC` de todas as funções `SECURITY DEFINER` existentes
   em `public`;
2. remove grants diretos indevidos de helpers internos e jobs;
3. concede jobs somente a `service_role`;
4. preserva comandos de booking/notificação para `authenticated`;
5. preserva agenda e avaliação de flag pública para `anon` e `authenticated`.

Ela não altera dados, assinatura, lógica, RLS ou estado de reserva.

## Matriz intencional

| Grupo | `anon` | `authenticated` | `service_role` |
|---|---:|---:|---:|
| `expire_stale_bookings`, `create_booking_reminders` | não | não | sim |
| `create_booking`, `transition_booking` | não | sim | não exigido pelo app |
| `get_provider_schedule` | sim | sim | não exigido pelo app |
| `mark_notification_read`, `mark_all_notifications_read` | não | sim | não exigido pelo app |
| helpers de intervalo/payload/trigger | não | não | não; chamada interna |
| aceite legal | não | sim | não exigido pelo app |
| flag segmentada | não | sim | sim |
| flag pública | sim | sim | sim |

`service_role` é credencial de backend e nunca deve ser enviada ao navegador.
A permissão de executar uma função não substitui as validações internas de
`auth.uid()`, ownership, estado e RLS.

## Regra para novas funções

Toda migration que criar ou substituir uma função `SECURITY DEFINER` deve, no
mesmo arquivo:

```sql
create or replace function public.exemplo(...)
returns ...
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
-- valida auth.uid(), ownership e estado
$$;

revoke all on function public.exemplo(...) from public, anon, authenticated;
grant execute on function public.exemplo(...) to <menor-conjunto-de-papeis>;
```

Não dependa de uma migration posterior para retirar `PUBLIC`. Quando a função
for interna a trigger/outra função, não conceda `EXECUTE` a papéis de API.

## Teste preventivo

`scripts/social-foundation-check.mjs`, executado por `npm run test:db`, aplica
todas as migrations e falha quando:

- qualquer função definer mantém `EXECUTE` para `PUBLIC`;
- a matriz das APIs conhecidas diverge;
- `anon` ou `authenticated` consegue disparar jobs;
- uma função definer não fixa `search_path`.

A suíte também chama os jobs como `service_role`, provando que o hardening não
removeu o caminho operacional autorizado.

## Rollback e aplicação

Nenhuma migration remota foi aplicada nesta entrega. Antes de aplicar:

1. validar em ambiente não produtivo;
2. confirmar qual scheduler chama os jobs e que usa `service_role`;
3. executar `npm run test:db` contra migrations do zero;
4. observar erros `permission denied` após o deploy.

Se um consumidor legítimo perder acesso, não restaure `PUBLIC`. Crie uma
migration forward-fix concedendo `EXECUTE` somente ao papel necessário. Revogar
privilégio é aditivo e não apaga dados; não existe rollback destrutivo.
