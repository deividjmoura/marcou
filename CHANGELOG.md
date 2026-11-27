# Changelog

Todas as mudanças funcionais, visuais, estruturais, de segurança ou de banco de
dados do Marcou são registradas neste arquivo.

O formato segue os princípios de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Toda Pull Request com mudanças relevantes deve atualizar a seção `## [Unreleased]`
(consulte [CONTRIBUTING.md](CONTRIBUTING.md)).

## [Unreleased]

### Adicionado

- Documentação operacional consolidada em `docs/PLATFORM.md` (Issues `#30` e
  `#20`): inventário da stack na Netlify + Supabase, matriz verificada de
  variáveis de ambiente (`PUBLIC` vs `SERVER-ONLY / SECRET`), tabela de
  mecanismos canônicos únicos de schedulers (expiração, lembretes e Calendar),
  checklist pré-deploy, procedimento de rollback, backup/observabilidade e
  pendências de provisionamento do responsável.
- Cobertura unitária dedicada para `isCronAuthorized` em
  `src/server/cron-auth.test.ts` (fail-closed sem `CRON_SECRET`, header ausente,
  esquema inválido, comparação de comprimento/conteúdo em tempo constante e
  case-insensitivity de `Bearer`).
- Workflow de expiração automática exclusivamente (PR #128): GitHub Actions protegido por gate, Environment staging, validação de projeto Supabase, recusa explícita do project ref de produção, headers temporários e timeout/retry; reutiliza `expire_stale_bookings()` já existente e não cria RPC/migration de expiração.
- Pipeline CI passa a executar `npm run audit` junto às validações de PR.

- Rota cron de lembretes marcada como `server-only`, com guarda explícita para URL/chave ausentes e exceção do audit restrita ao arquivo e às garantias server-only.

- Scheduler de lembretes separado da expiração: endpoint protegido chama somente `create_booking_reminders(24)`; migration adiciona lock `FOR UPDATE SKIP LOCKED`, janela validada e harness cobre execução simultânea, cancelamento e expiração.

- `CHANGELOG.md` na raiz do repositório, `CONTRIBUTING.md` com o processo
  obrigatório de registro de mudanças e verificação automatizada
  (`scripts/changelog-check.mjs` / `npm run check:changelog`) integrada ao
  GitHub Actions (`.github/workflows/ci.yml`), exigindo que novas entradas da PR
  estejam dentro de `## [Unreleased]` sob subseção válida.
- Instrumentação de medição de fluxo completo no servidor estritamente livre de
  PII, senhas ou tokens (`measureAuthFlow`, `withAuthFlowCollector`,
  `withAuthTimingCollector`, `measureAuthStep` e emissão opt-in
  `AUTH_TIMING_LOG=1` em `src/server/identity.ts`), além de benchmark SQL local
  em PostgreSQL embutido (`scripts/identity-check.mjs`) para evidenciar a
  redução de consultas em `profiles`.
- Cobertura de testes unitários para `googleLoginAction`, `saveProfileAction`,
  `setPreferredModeAction` (troca entre Cliente e Profissional), bootstrap
  pós-login em `/inicio`, `ensureAuthProfile` (caminho rápido, primeiro login,
  backfill CAS e colisões concorrentes) e validador de changelog
  (`src/lib/changelog-check.test.ts`).
- Matriz canônica de requisitos de produto e sequência de dependências das
  Issues `#84`, `#91` e `#93` registrada em `docs/ROADMAP-MARCOU-SOCIAL.md`,
  preservando a arquitetura da Issue `#72`.
- Motor de reservas com múltiplos serviços (`booking_services`, RPCs de
  agregação, compatibilidade com reservas de serviço único e backfill) na
  migration `20261127120000_booking_multiple_services.sql` (PR `#131`, Issue `#21`).
- Matriz canônica de privilégios de tabelas/views em
  `scripts/privileges-check.mjs`, com handoff em
  `docs/handoffs/privilegios-tabelas.md` (PR `#123`).
- Integração unidirecional com Google Calendar (Issue `#29`, atrás de
  `GOOGLE_CALENDAR_ENABLED=false`): OAuth próprio com escopo
  `calendar.events`, tokens cifrados AES-256-GCM, outbox transacional
  alimentada por `booking_events`, worker protegido por bearer e página
  `/painel/integracoes/calendario`. O evento leva só serviço, início, fim e
  fuso. Migration `20261125153000_google_calendar_sync.sql` (não aplicada em
  ambiente remoto) e harness `scripts/calendar-check.mjs` em `npm run test:db`.
- Google Calendar (`#29`): ao conectar ou reconectar, reservas confirmadas
  futuras (até 500) e eventos de reservas canceladas durante uma suspensão são
  reenfileirados na mesma transação por trigger, sem gravar em
  `booking_events`; a outbox ganha `reason` (`booking_event` | `backfill`).

- Agenda do prestador (`src/app/painel/booking-agenda.tsx`) com filtros Próximos/Anteriores/Todos, busca por cliente, telefone ou serviço e agrupamento por dia local, apoiada pelas regras puras de `src/domain/agenda/agenda.ts` e coberta por `agenda.test.ts`.
- `listProviderBookingsForPanel` em `src/server/bookings.ts` retorna `{ bookings, failed }` para distinguir falha de consulta de agenda realmente vazia. Detalhes em `docs/AGENDA-PRESTADOR.md`.

### Alterado

- Hardening do pipeline CI (`.github/workflows/ci.yml`, substituindo a parte
  exclusiva da PR `#32`): adiciona `concurrency` (cancela runs redundantes fora
  da `main`), `timeout-minutes: 20`, steps nomeados e remove a execução
  duplicada de `npm run audit`, preservando todos os gates obrigatórios
  (`check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db`, `build`).
- `.env.example` reorganizado com classificação explícita `PUBLIC` vs
  `SERVER-ONLY / SECRET` e lista comentada (sem valores) das variáveis
  server-side existentes na `main`, apontando para `docs/PLATFORM.md`.
- Documentação de schedulers alinhada em `docs/NOTIFICACOES.md`,
  `docs/BOOKING-OPS.md` e `README.md`: política explícita de retries para
  `GET /api/cron`, consolidação do mecanismo canônico único de expiração vs
  lembretes e referência à documentação de plataforma.
- Auditoria de segredos (`scripts/quality-audit.mjs`) passa a aceitar a forma `${{ secrets.NOME }}` do GitHub Actions como referência a placeholder, eliminando falso positivo em workflows legítimos; atribuições literais de valor e JWTs continuam sendo acusados.
- `npm run test:db` passa a executar também `scripts/booking-concurrency.mjs`, integrando à validação padrão os cenários concorrentes de criação e transição de agendamentos.
- Fluxo de login por senha (`loginAction`), cadastro imediato (`signupAction`),
  callback OAuth (`/auth/callback`) e confirmação de e-mail (`/auth/confirm`)
  unificados em `ensureAuthProfile`: logins recorrentes executam 1 único
  `SELECT display_name, phone` em `profiles` (zero escritas e zero segunda
  consulta para `phone`), reutilizando a mesma instância do cliente Supabase e
  o `user` já retornado por `exchangeCodeForSession`/`verifyOtp`.
- Carregamento pós-login paralelizado em `/inicio`, `/minha-conta` e `/painel`,
  eliminando ondas sequenciais desnecessárias entre `getOwnedProvider`,
  `countUnreadNotifications`, `profiles` e `getPreferredMode`.
- Documentação operacional em `docs/IDENTITY.md` atualizada com o diagnóstico
  verificado do erro `400 redirect_uri_mismatch` no Google OAuth, distinção
  entre callback do Supabase e callback final da aplicação, padrões de allowlist
  com query string e análise técnica da entregabilidade de e-mails.

- Painel do prestador (`/painel`) passa a renderizar a agenda por `BookingAgenda` dentro de `ProviderPanelMenu`, substituindo a tabela inline. A consulta permanece filtrada pelo prestador dono da sessão; falha de consulta aparece como aviso (`role="alert"`), e não como agenda vazia. A lista inclui contagem acessível, filtros com `aria-pressed`, agrupamento por dia e layout responsivo.

### Corrigido

- Página pública (`#22`): reserva criada com sucesso voltava a mostrar "Não foi
  possível concluir a reserva" porque o `redirect()` do Next.js (que lança uma
  exceção de controle) estava dentro do `try/catch` de `bookSlotAction`. O
  redirect agora fica fora do bloco; teste cobre o caso (supera a PR `#40`).
- Padrões de `Redirect URLs` documentados em `docs/IDENTITY.md` corrigidos para
  contemplar query strings (`**`) no glob matcher do Supabase Auth e o formato
  real de Deploy Preview da Netlify (`--marcoou.netlify.app`).
- Tratamento explícito de falha na leitura inicial de `profiles` antes de
  decidir pelo provisionamento, evitando tentativa de escrita cega sobre estado
  desconhecido.

### Segurança

- Hardening dos privilégios de tabela herdados do Supabase (Issue `#125`):
  migration `20261125140000_harden_public_table_privileges.sql` remove
  `TRUNCATE`/`REFERENCES`/`TRIGGER` de `anon`/`authenticated` nas 8 tabelas
  legadas, deixa escrita direta só onde há política (`profiles`/`providers`
  perdem `DELETE`; `bookings`/`booking_events` ficam só leitura) e tira o
  `SELECT` inútil de `anon` em reservas e eventos. `scripts/privileges-check.mjs`
  passa a emular os defaults do Supabase desde a primeira migration, aplica
  regras globais (RLS, T/R/G, escrita × política) e roda fluxos reais.
- Proteção contra condições de corrida no provisionamento de `profiles`:
  inserção inicial com `ON CONFLICT (id) DO NOTHING` (`ignoreDuplicates: true`)
  e backfill de `display_name` condicionado por guarda CAS (`IS NULL` / valor
  anterior), impedindo que requisições paralelas sobrescrevam nome ou telefone
  já escolhidos pelo usuário em `/perfil`.
- Migration aditiva `20261127130000_table_privileges_matrix.sql` (PR `#131`):
  remove o `UPDATE` direto de `authenticated` em `notifications` (a aplicação
  usa apenas as RPCs de leitura) e reafirma os grants mínimos de
  `booking_services`, sem alterar `bookings`, `booking_events`, dados, RLS ou
  assinaturas.
- `npm run test:db` falha se uma tabela ou view nova em `public` surgir sem
  entrada na matriz de privilégios; as três tabelas do Calendar entram na
  matriz só com `service_role` e são verificadas na fase `after`.
- Google Calendar (`#29`): state OAuth consumido de forma atômica
  (`consume_calendar_oauth_state`) antes da troca do code e preso ao usuário que
  iniciou o fluxo; escopo `calendar.events` exigido em `tokens.scope`;
  `/api/calendar/connect` passa a aceitar só POST com checagem de origem; claim
  processa no máximo um job por reserva, em ordem; falhas de persistência
  deixam de ser ignoradas; estado terminal `dead`; `invalid_grant` suspende a
  conexão; desconexão mantém tokens e vínculos até os eventos saírem do Google
  (ou serem marcados como órfãos).
- Google Calendar (`#29`): cliente service-role do servidor criado via
  `@supabase/ssr` (sem cookies) e rotas/página do Calendar com guarda de
  configuração do Supabase; `npm run audit` volta a 0 falhas e 0 avisos.
