# Agenda do prestador (Issue #24)

Documento de referência da agenda exibida em `/painel`, entregue pela PR #39.

## Escopo

- Lista os agendamentos do **prestador dono da sessão**, agrupados por dia local.
- Filtro de período: **Próximos**, **Anteriores** e **Todos**.
- Busca textual por **cliente**, **telefone** ou **serviço**.
- Ações por agendamento seguem inalteradas: marcar comprovante, confirmar
  pagamento e cancelar (Server Action `providerBookingAction`).

## Arquitetura

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Domínio (puro) | `src/domain/agenda/agenda.ts` | normalização da busca, filtro por período, ordenação e agrupamento por dia local |
| Servidor | `src/server/bookings.ts` (`listProviderBookingsForPanel`) | consulta filtrada por `provider_id` e sinalização de falha |
| Cliente | `src/app/painel/booking-agenda.tsx` | filtros, busca, estados vazios, estado de erro e ações |
| Página | `src/app/painel/page.tsx` | busca dados do prestador autenticado e injeta a agenda no `ProviderPanelMenu` |

O componente é injetado como `bookingsContent` no `ProviderPanelMenu`, preservando
a navegação por seções da `main` (Agendamentos, Meu negócio, Serviços,
Disponibilidade e Descoberta quando a flag está ativa).

## Autorização e isolamento

- `requireUser("/painel")` garante sessão; `getOwnedProvider(user.id)` resolve o
  prestador pelo `owner_id`.
- Toda consulta usa `.eq("provider_id", provider.id)` **do prestador da sessão**;
  nenhum `provider_id` vem de query string, formulário ou cliente.
- A RLS de `bookings` continua sendo a autoridade: mesmo com filtro forjado, o
  banco só entrega linhas do dono.
- As Server Actions de transição revalidam ownership no banco
  (`transition_booking`), não no componente.

## Datas, horários e fusos

- Todos os horários são formatados no **fuso IANA do prestador** salvo no
  agendamento (`timezone`), usando `Intl.DateTimeFormat`
  (`src/lib/format.ts`).
- O agrupamento por dia usa a mesma regra (`agendaLocalDateKey`), então um
  evento às `02:30Z` em `America/Sao_Paulo` aparece no dia anterior — igual ao
  que o prestador vê no calendário dele.
- A ordenação é por instante absoluto (`Date.parse`), não por string.
- O "agora" é lido **apenas no cliente**, depois da hidratação, e recalculado a
  cada troca de filtro: evita divergência entre o HTML do servidor e o cliente.

## Estados

| Situação | Comportamento |
|---|---|
| Sem nenhum agendamento | "Nenhum agendamento por enquanto." |
| Filtro de busca sem resultado | "Nenhum agendamento corresponde a essa busca." |
| Próximos vazio | "Nenhum agendamento futuro por enquanto." |
| Anteriores vazio | "Nenhum agendamento anterior registrado." |
| **Falha de consulta** | Bloco `role="alert"` informando que a agenda não pôde ser carregada, sem lista e sem dados fictícios |

Falha e vazio são estados distintos: `listProviderBookingsForPanel` devolve
`failed: true` quando o Supabase retorna erro, e a página repassa isso ao
componente.

## Acessibilidade e responsividade

- Contagem de resultados em `role="status"` com `aria-live="polite"`.
- Botões de período com `aria-pressed` e agrupados em `role="group"` rotulado.
- Campo de busca com rótulo textual (`<label>`), `type="search"` e
  `autoComplete="off"`.
- Cada dia é uma `<section>` com título `<h3 id>` referenciado por
  `aria-labelledby`.
- Notificação de falha em `role="alert"`.
- Em telas ≤ 640 px cada item vira coluna e os botões de ação ocupam a largura
  disponível (`.agenda-list` em `src/app/globals.css`).

## Testes

- `src/domain/agenda/agenda.test.ts` — busca (acentos, telefone, serviço),
  período (limite `starts_at === now`), ordenação crescente/decrescente,
  ausência de mutação, data inválida, agrupamento por fuso
  (`America/Sao_Paulo`, `Asia/Tokyo`) e listas vazias.
- `src/server/bookings.test.ts` — filtro por `provider_id`, distinção entre
  falha e agenda vazia e retorno dos dados quando a consulta funciona.

## Fora de escopo

Paginação/scroll infinito, filtro por status, reagendamento, exportação,
notificações por e-mail e sincronização com Google Calendar (Issue #29).
