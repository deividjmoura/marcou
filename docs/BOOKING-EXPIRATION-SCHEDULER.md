# Job periódico: expiração de reservas

## Arquitetura

O agendador é um **GitHub Actions scheduled workflow** que chama diretamente a
RPC Supabase `expire_stale_bookings()` pela Data API REST. O job fica
versionado no repositório, com execução agendada a cada 5 minutos e opção de
execução manual (`workflow_dispatch`).

A chamada não altera a RPC, migrations, políticas RLS ou grants. A RPC existente
é `security definer`, tem `search_path = public` fixo, revoga execução de
`anon` e `authenticated`, e concede `execute` somente a `service_role`.
A chave de service role é usada exclusivamente no runner GitHub, nunca no
frontend, e não deve ser registrada nos logs. Os headers autenticados são
materializados em arquivo temporário com permissão 0600, removido ao fim, para
evitar que a chave seja passada como argumento do processo curl.

## Por que GitHub Actions

| Opção | Segurança | Confiabilidade/observabilidade | Operação/custo |
| --- | --- | --- | --- |
| Supabase Cron/pg_cron + pg_net | Exige provisionar extensões, armazenar secret no banco/Vault e criar job remoto | Job e erros podem ser observados no banco; dependente do projeto e sua configuração | Menos dependências externas após provisionar; configuração remota não é declarada neste repo |
| Edge Function agendada | Secret pode ser configurado em secrets; requer função e mecanismo agendador | Logs da função; precisa provisionar/deploy da função e schedule | Mais componentes/deploys e configuração |
| **GitHub Actions (escolhida)** | Secret de repo/environment; endpoint HTTPS; RPC restringida ao service role | Histórico de runs, status/falha, logs com contagem, retry HTTP e timeout | YAML versionado; configuração de secrets manual; scheduler GitHub pode atrasar |

O intervalo de **5 minutos** equilibra liberação oportuna dos holds com execução
moderada. Scheduled workflows são best-effort e podem sofrer atraso, portanto
não constituem SLA. A criação de nova reserva ainda expira conflitos vencidos
inline, como proteção de disponibilidade.

## Configuração manual obrigatória

O gate é a **Repository variable** `BOOKING_EXPIRATION_ENABLED`, que precisa ser `true` para o job rodar (seja schedule ou execução manual); ausente ou diferente de `true`, ambos são ignorados. Mantenha-a desligada até aprovação operacional. O gate é de repositório porque Environment variables não estão disponíveis para a avaliação do `if` do job.

Configure o GitHub Environment **`booking-expiration-staging`** e mantenha as credenciais isoladas nele (o job referencia explicitamente esse Environment):

- Environment secret `SUPABASE_URL`: URL HTTPS do projeto staging.
- Environment secret `SUPABASE_SERVICE_ROLE_KEY`: service-role secret key do staging.
- Environment variable `SUPABASE_PROJECT_REF`: project ref exato do staging (20 caracteres minúsculos), não é secret. O workflow exige que o hostname seja exatamente `${SUPABASE_PROJECT_REF}.supabase.co`; sufixo genérico não basta.

Não use publishable/anon key como service-role credential. Nunca coloque a
service role em variável pública, arquivo versionado, Netlify ou código client-side.

Não habilite o gate nem execute o workflow antes de validar as configurações no
Environment **staging**. O schedule roda somente no branch padrão; o dispatch
manual também respeita o mesmo gate. Ambos usam o Environment
`booking-expiration-staging`. Não há caminho para produção neste workflow. Produção
requer Environment próprio, workflow/job separado, ref e secrets próprios, além
de proteção/aprovação.

Nenhum secret, cron remoto ou serviço foi provisionado por esta alteração.

## Autenticação e comportamento

- POST `/rest/v1/rpc/expire_stale_bookings` com `apikey` e Bearer service-role.
- Valida existência dos secrets e `SUPABASE_PROJECT_REF` (formato de 20 caracteres minúsculos) e exige hostname exatamente igual a `${SUPABASE_PROJECT_REF}.supabase.co`; também rejeita userinfo, query, fragment, path não vazio e porta não padrão. Evita enviar a chave a outro projeto Supabase ou host por configuração incorreta.
- Timeout de conexão 10 s, timeout total 30 s e até 2 retries para erros transitórios, com limite de 20 s para a janela de retries. Não usa `--retry-all-errors`, evitando retries de erros não transitórios.
- Resposta aceita somente HTTP 200 e payload inteiro não-negativo.
- Logs apenas timestamp UTC, status/resultado e número de reservas expiradas;
  corpo de erro da API não é despejado nos logs.
- Concurrency group fixo `booking-expiration` tem escopo de repositório e impede duas execuções desse workflow de rodarem simultaneamente, mesmo de refs/branches diferentes. `cancel-in-progress: false` não cancela a ativa; o GitHub mantém no máximo uma pendente por grupo e uma nova pendente pode substituir a anterior.
- Falhas de secrets, HTTP, timeout ou payload inválido marcam run como failed,
  permitindo alerta via notificações do GitHub Actions.
- A RPC é idempotente: chamadas repetidas não reexpiram registros nem duplicam
  eventos `booking.expired`.

## Validação em staging

1. Configure os secrets e `SUPABASE_PROJECT_REF` no Environment
   `booking-expiration-staging`, confirmando que são do projeto staging, não produção.
2. No staging, crie uma reserva pendente com `expires_at` vencido e outra não
   vencida; mantenha também uma reserva confirmada como controle.
3. Execute manualmente o workflow `Booking expiration scheduler`.
4. Verifique no run: status success e `expired_count` esperado (a primeira
   execução deve expirar apenas os registros vencidos).
5. Confira no banco staging os status e eventos correspondentes:
   - vencidas: status `expired` e um `booking.expired` por booking;
   - pendente válida e confirmada: status inalterado;
   - execute novamente: `expired_count=0`, sem evento duplicado.
6. Faça teste negativo usando secrets ausentes/inválidos em um ambiente de teste
   isolado: run deve falhar sem revelar chave ou response body.
7. Não reutilize este Environment para produção. Produção exige Environment
   separado, secrets/ref próprios, proteção/aprovação e workflow/job que o
   referencie explicitamente, seguido de autorização operacional.

## Operação e alertas

O histórico de GitHub Actions é a fonte inicial de observabilidade. Habilite
notificações de falha de workflow para responsáveis do repo. Recomenda-se
monitorar run failures e gaps de execução; alertar se não houver sucesso por
15 minutos. O job registra a contagem retornada pela RPC, mas não expõe dados
de booking.

## Limitações

- O scheduler do GitHub pode atrasar execuções e não oferece SLA de cinco
  minutos.
- O job é externo ao Supabase; GitHub Actions e Data API precisam estar
  disponíveis.
- Não cria secrets, cron, policies, grants, migrations ou configurações remotas.


## Responsabilidade e integração com notificações

Esta PR mantém **somente a expiração de holds**. A função SQL existente
`expire_stale_bookings()` muda o status e insere `booking.expired`; o trigger
de `booking_events` é quem gera notificações. A rota de lembretes da PR #38
não chama a RPC de expiração e não é outro scheduler para holds.

A execução do workflow permanece desativada até a variável
`BOOKING_EXPIRATION_ENABLED` ser explicitamente `true` e o Environment
`booking-expiration-staging` receber credenciais de staging. Não habilite
produção neste workflow.
