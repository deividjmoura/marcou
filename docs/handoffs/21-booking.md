# Handoff — Issue #21 (BOOKING)

**Branch de trabalho:** `arena/4017109f-marcou` (branch obrigatória desta sessão;
sua base é `main` em `67bb5717b2efdf692659bdda17c48e1b0315cacb`).
**Branch antiga reaproveitada:** `feat/21-booking-multiple-services` continha
apenas a migration parcial `202611150004_booking_multiple_services.sql` (26
linhas) e estava muito defasada do `main`; não foi reescrita, mesclada nem usada como
base. O esquema `booking_services` foi reaproveitado na migration nova.
**PR:** rascunho contra `main`, sem merge.

> `AGENT_TASK_MARCOU.md` não foi editado, conforme instrução explícita da
> delegação (evita conflito com outros agentes).

## Decisões

1. **Seleção:** 1 a 20 serviços ativos do mesmo estabelecimento, na ordem em
   que o cliente seleciona. O primeiro vira `bookings.service_id` (chave
   legada); os demais ficam em `booking_services`.
2. **Fonte de verdade:** `public.booking_service_totals` soma duração,
   intervalo, preço e sinal diretamente de `services`. A UI envia só IDs e
   início; `get_provider_schedule` devolve os totais agregados para exibição e
   `create_booking` recalcula tudo no banco antes de gravar.
3. **Snapshots:** `bookings` mantém snapshots agregados (compatíveis com
   reservas de serviço único, onde os valores são idênticos aos atuais) e
   `booking_services` guarda nome/duração/preço/sinal/intervalo de cada serviço.
   Histórico anterior é espelhado na nova tabela pela própria migration.
4. **Disponibilidade:** um único intervalo `[início, início + Σ(duração +
   intervalo))` passa por `is_interval_available`, pela expiração de holds
   vencidos conflitantes e pelo `pg_advisory_xact_lock` do prestador. A
   constraint GiST existente continua sendo a barreira final; duas transações
   simultâneas não conseguem sobrepor reservas ativas.
5. **Compatibilidade:** as assinaturas antigas de `create_booking(text, uuid,
   ...)` e `get_provider_schedule(text, uuid, ...)` continuam disponíveis e
   delegam para as versões com `uuid[]`. Clientes antigos de serviço único
   seguem funcionando.
6. **Permissões:** `booking_services` tem RLS de leitura para participantes e
   nenhuma política de escrita para clientes. Os novos helpers `SECURITY
   DEFINER` usam `search_path` fixo e não herdam `EXECUTE` de `PUBLIC`.

## Migration

- Arquivo: `supabase/migrations/20261125120000_booking_multiple_services.sql`.
- Aditiva: cria tabela, índice, RLS, grants, backfill e funções; não altera
  colunas existentes nem apaga dados.
- Executada **somente** no PostgreSQL embutido dos harnesses locais. **Não**
  foi aplicada ao Supabase remoto, não houve deploy nem mudança de secrets.
- Validação local planejada: `npm run test:db` aplica todas as migrations em
  ordem. Para validar em um projeto Supabase próprio, aplicar a migration
  versionada com o fluxo de migration do projeto (por exemplo `supabase db
  push`) **após autorização do responsável**, conferindo grants/RLS e
  executando o mesmo harness contra o banco de desenvolvimento.

## Riscos e limitações

- Reservas antigas são espelhadas, mas a migração não reescreve o significado
  de `service_name_snapshot`: combinações novas usam `A + B`; reservas
  antigas mantêm o nome original.
- O limite de 20 serviços por reserva é uma proteção de payload, não uma
  regra de produto; pode ser revisado depois.
- `get_provider_schedule` retorna `null` se qualquer ID for inválido,
  inativo, duplicado ou de outro prestador — sem expor o motivo ao anon.
- Não há alteração em pagamento, notificações, painel, autenticação,
  Google Calendar ou design system. O texto das notificações usa o snapshot
  agregado já existente em `bookings`, sem mudar o pipeline.
- Não foi feita validação em navegador real nem em Supabase remoto.
- `AGENT_TASK_MARCOU.md` permanece sem atualização (instrução do delegador).

## Testes executados

Ver descrição da PR para os resultados finais. Cobertura adicionada:
soma agregada (domínio e banco), slots com intervalo combinado, conflito
com serviço único dentro do combo, expediente insuficiente, IDs duplicados/
inativos/entre negócios, concorrência com cinco requisições simultâneas,
compatibilidade de reserva antiga, backfill e isolamento RLS.
