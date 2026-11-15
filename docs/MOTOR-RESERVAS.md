# Motor de reservas — Marcou

Documenta o comportamento implementado do núcleo de agendamentos. O contrato
do domínio está em `CONTRATO-DOMINIO-AGENDAMENTOS.md`; este documento descreve
como ele foi realizado nesta codebase.

## Camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| Domínio puro | `src/domain/bookings/availability.ts`, `booking.ts` | Intervalos, sobreposição, geração de slots, transições de estado. Testável sem banco. |
| Banco (transações) | `supabase/migrations/202611150002_booking_operations.sql` | Atomicidade, conflito, expiração, autorização, auditoria. |
| Servidor | `src/server/bookings.ts`, `src/server/services.ts` | Orquestra chamadas, traduz erros, nunca confia no cliente. |
| Interface | `src/app/p/[slug]`, `src/app/painel`, `src/app/reserva` | Fluxo do cliente e do prestador. |

## Disponibilidade

`generateSlots` recebe data (no fuso do prestador), regras semanais, exceções,
intervalos já ocupados e o tempo do serviço (duração + intervalo). Ele:

1. seleciona as janelas do dia (expediente ou horário especial; bloqueio zera o dia);
2. respeita a vigência (`validFrom`/`validUntil`) e regras inativas;
3. mescla períodos sobrepostos;
4. gera candidatos a partir do início de cada janela, com passo `duration + buffer`;
5. descarta candidatos que não cabem na janela, que conflitam com intervalos
   ocupados ou que estão no passado / antes da antecedência mínima.

A projeção da interface **não** garante disponibilidade: o cliente pode chamar a
API diretamente. Por isso `create_booking` revalida o expediente no banco.

## Criação atômica (`create_booking`)

Função `security definer` com `set search_path = public`, executada com o JWT do
usuário (`auth.uid()`). Passos:

1. exige autenticação e prestador publicado e serviço ativo;
2. valida nome do cliente e que o início é futuro;
3. calcula `occupied_until = início + duração + intervalo`;
4. valida `is_interval_available` (expediente ou horário especial, sem cruzar a meia-noite);
5. aplica `pg_advisory_xact_lock` por prestador para serializar a disputa;
6. expira reservas vencidas que conflitam com o intervalo solicitado;
7. insere a reserva `pending_payment` com `expires_at = now + booking_hold_minutes`
   e snapshot de serviço, nome e contato do cliente;
8. registra `booking.created` em `booking_events`.

A constraint `bookings_no_overlapping_active_intervals` (GiST, por prestador,
intervalo semiaberto `[starts_at, occupied_until)`) é a garantia final. Violação
é convertida em `slot_unavailable`. A chave de idempotência (`p_idempotency_key`)
garante que repetir a chamada devolva a mesma reserva; em concorrência, a
duplicata é descartada.

## Transições (`transition_booking`)

| Evento | De | Para | Quem |
|---|---|---|---|
| `proof_received` | `pending_payment` | `pending_review` | cliente ou prestador |
| `payment_approved` | `pending_review` | `confirmed` | somente o prestador |
| `cancel` | qualquer ativo | `cancelled` | cliente ou prestador |
| `expire` | pendente vencida | `expired` | somente o prestador |

Regras:

-somente participante (cliente ou dono do prestador) pode transicionar;
- `payment_approved` só pelo dono do prestador;
- evento sobre reserva vencida: a reserva é marcada como `expired` (com
  auditoria) e a função **retorna** o estado expirado, que a camada de
  aplicação traduz em `booking_expired`. Retornar (em vez de `RASE`) preserva o
  commit da expiração;
- `cancelled` e `expired` não são reativados automaticamente.

## Expiração

- `expire_stale_bookings()` marca como `expired` todas as reservas pendentes com
  `expires_at <= now()`, de forma idempotente, e registra `booking.expired`.
  Hoje é chamada por service role / cron; a criação de reservas também expira
  conflitos imediatos.
- O prazo é configurado por prestador em `providers.booking_hold_minutes`.

## Isolamento

- RLS ativa em todas as tabelas; escrita direta de agendamentos inexistente para
  clientes.
- `get_provider_schedule` expõe apenas agenda de prestadores publicados.
- Funções de escrita conferem `auth.uid()` e a propriedade do prestador.

## Testes

- `npm test`: domínio (slots, sobreposição, transições, validação).
- `npm run test:db`: PostgreSQL real (embedded-postgres) aplicando as migrations
  e exercitando conflito, concorrência (5 requisições simultâneas), adjacência,
  limites de horário, expiração, idempotência, transições e isolamento
  multi-tenant (30 verificações).
