# Handoff — Issue #21 (BOOKING)

**Branch de trabalho:** `arena/4017109f-marcou` (branch obrigatória desta sessão;
sua base é `main` em `67bb5717b2efdf692659bdda17c48e1b0315cacb`).
**Branch antiga reaproveitada:** `feat/21-booking-multiple-services` continha
apenas a migration parcial `202611150004_booking_multiple_services.sql` (26
linhas) e estava muito defasada do `main`; não foi reescrita, mesclada nem usada como
base. O esquema `booking_services` foi reaproveitado na migration nova.
**PR:** rascunho contra `main`, sem merge, com `Refs #21` (a issue só deve ser
fechada depois que a migration for validada em um Supabase de desenvolvimento).

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

### Regra de tempo ocupado — sem mudança de comportamento

O intervalo ocupado continua sendo `Σ (duração + intervalo) de cada serviço`,
inclusive os intervalos dos serviços intermediários. Exemplo: 30 min + 10 min
e 45 min + 5 min ⇒ 75 min de atendimento, 15 min de intervalo, 90 min
ocupados. A eventual regra de contar intervalo somente entre serviços aguarda
decisão do responsável; nada foi alterado aqui.

## Migration

- Arquivo: `supabase/migrations/20261125120000_booking_multiple_services.sql`.
- Aditiva: cria tabela, índice, RLS, grants, backfill e funções; não altera
  colunas existentes nem apaga dados.
- Executada **somente** no PostgreSQL embutido dos harnesses locais. **Não**
  foi aplicada ao Supabase remoto, não houve deploy nem mudança de secrets.
- Validação local: `npm run test:db` aplica todas as migrations em ordem.

### Roteiro de validação no Supabase de desenvolvimento

Somente o responsável deve executar, em projeto de desenvolvimento (nunca em
produção), e nenhuma credencial deve ser colada em código, doc, issue ou PR:

1. Fazer backup/schema snapshot do projeto de desenvolvimento e conferir que a
   última migration aplicada é `20261123143000_discovery_taxonomy_service_areas.sql`.
2. Aplicar **apenas** `supabase/migrations/20261125120000_booking_multiple_services.sql`
   com o fluxo de migrations do projeto (por exemplo `supabase link` no projeto
   de desenvolvimento e `supabase db push`, ou o mecanismo equivalente usado
   pelo time). Conferir que `booking_services` existe com RLS ativo, que as
   quatro assinaturas de `create_booking`/`get_provider_schedule` estão
   presentes e que não há `EXECUTE` de `PUBLIC` nas novas funções.
3. Rodar `npm run test:db` localmente mais uma vez (o harness usa Postgres
   embutido e não altera o remoto).
4. No navegador, abrir `/p/<slug>` de um negócio publicado com pelo menos três
   serviços ativos e fazer login como cliente:
   - **1 serviço:** selecionar um, escolher data/horário, confirmar; verificar
     nome, duração e preço exibidos e a reserva em `/reserva/<id>`.
   - **2 serviços:** selecionar dois do mesmo negócio; conferir o resumo com a
     soma vinda do servidor, a duração combinada nos slots e o
     `occupied_until` (duração + intervalo de ambos) na reserva criada.
   - **3 serviços:** repetir com três; tentar um horário em que apenas o
     primeiro serviria e confirmar que não é oferecido nem confirmado.
   - Tentar misturar um serviço de outro negócio (por chamada direta à RPC) e
     confirmar recusa sem vazamento de detalhes.
5. Em duas abas/sessões diferentes, tentar confirmar o mesmo intervalo
   combinado: só uma reserva pode ser criada; a outra deve exibir
   "Este horário acabou de ser reservado".
6. Somente após esses passos, fechar a issue #21 e converter o PR de draft em
   ready-for-review.

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

## Estado da branch e conflitos previstos

- `main` continua em `67bb5717b2efdf692659bdda17c48e1b0315cacb`, igual à base
  desta branch: não houve rebase a aplicar e a migration
  `20261125120000_booking_multiple_services.sql` continua sendo a de maior
  número em `supabase/migrations/`.
- Conflito textual previsto com a PR **#40**: ela altera
  `src/app/p/[slug]/actions.ts`, o mesmo arquivo desta PR (ação de reserva e
  redirecionamento). Nenhuma das duas foi alterada aqui.
- PR **#68**: sem sobreposição de arquivos com esta PR; atenção semântica em
  `/reserva/[id]` (a página lê os snapshots de `bookings`) e em
  `src/app/globals.css` (a UI pública usa classes já existentes).

## Testes executados

Resultados finais na descrição da PR. Cobertura adicionada: soma agregada
(domínio e banco), slots com intervalo combinado, conflito com serviço único
dentro do combo, expediente insuficiente, IDs duplicados/inativos/entre
negócios, array vazio/com NULL/21 serviços, nome combinado truncado com
notificação legível, resolução de overload em notação nomeada, concorrência
com cinco requisições simultâneas, compatibilidade de reserva antiga, backfill
e isolamento RLS. O harness de booking agora usa `try/finally` e foi testado
com uma falha injetada: o processo Postgres foi encerrado e a porta 55432
ficou livre.
