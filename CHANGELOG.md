# Changelog

Todas as mudanças funcionais, visuais, estruturais, de segurança ou de banco de
dados do Marcou são registradas neste arquivo.

O formato segue os princípios de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Toda Pull Request com mudanças relevantes deve atualizar a seção `## [Unreleased]`
(consulte [CONTRIBUTING.md](CONTRIBUTING.md)).

## [Unreleased]

### Adicionado

- Endpoint de saúde `GET /api/health` (`src/app/api/health/route.ts`, `src/server/health.ts`, Issue `#20`): modo mínimo responde HTTP `200` com `{ status, version, commit }` e `Cache-Control: private, no-store` sem consultar segredos nem expor configuração; modo profundo (`?deep=1`) exige `Authorization: Bearer <HEALTH_CHECK_SECRET>` comparado em tempo constante (`timingSafeEqual`, fail-closed) e verifica conectividade de banco via `@supabase/ssr` somente-leitura sem vazar detalhes internos.
- Política centralizada e testada de cabeçalhos HTTP de cache (`src/lib/cache-policy.ts`, `src/proxy.ts` e `next.config.ts`, Issue `#20`): páginas autenticadas, callbacks de autenticação e rotas `/api/*` recebem `Cache-Control: private, no-store, max-age=0, must-revalidate` (com defesa em profundidade em `next.config.ts`); rotas públicas anônimas recebem política explícita com `Vary: Cookie` e rebaixamento automático para `private, no-store` na presença de cookies de sessão ou `Set-Cookie`.
- Sistema tipográfico inicial (Issue `#27`): Manrope Variable para interface e Lora para títulos, fontes auto-hospedadas via Fontsource, tokens tipográficos, subconjuntos Latin/Latin Extended e licenças SIL OFL 1.1 em `LICENSES/`. Compactação incremental de espaçamentos na landing, autenticação e painel, mantendo alvos de toque de 44px. Nenhuma rota, regra de negócio ou migration alterada. Revisão visual final desktop/mobile continua pendente.

- Atalhos WhatsApp (`wa.me`) no detalhe da reserva e no painel do prestador, com normalização E.164 e RPC `booking_counterparty_phone` restrita a participantes (issue #57).
- Teste de integração PostgreSQL para `booking_counterparty_phone`: confirma o telefone somente para cliente e dono da reserva, nega terceiros e verifica grants mínimos da RPC.
- Roteiro operacional ordenado para teste real em produção pelo responsável em
  `docs/TESTE-REAL-PRODUCAO.md` (Issues `#30`, `#20`, `#26`, `#31`): sequência
  das 19 migrations (incluindo tratamento da ordem fora de sequência da PR
  `#142` e precedência obrigatória antes da `20261128000200` da PR `#145`),
  variáveis de ambiente por fase, teste de recuperação de senha pós-PR `#127`,
  reserva multi-serviço ponta a ponta pós-PRs `#142`/`#143`/`#146`, ativação
  segura e desligamento de cada scheduler (expiração, lembretes e Google
  Calendar) e plano de rollback por camada. Somente documentação; nenhuma
  migration ou scheduler foi aplicado/ativado.
- Cobertura de integração em PostgreSQL real (`scripts/db-check.mjs`) para
  expiração periódica (`expire_stale_bookings()`, `#128`), expiração inline e
  lembretes (`create_booking_reminders(24)`, `#38`) sobre reservas de múltiplos
  serviços (`20261125120000_booking_multiple_services.sql`, `#142`, e
  `20261128000200_booking_definer_search_path.sql`, `#145`): validação de
  snapshots agregados, preservação de `booking_services`, liberação completa da
  janela combinada (inclusive faixa do 2º serviço), idempotência diária por fuso
  do prestador na virada de dia UTC independente do fuso da sessão, concorrência
  (`FOR UPDATE SKIP LOCKED`) e verificação RLS/privilégios de `booking_services`.
- Página de confirmação `/reserva/[id]` com feedback visual por status, download `.ics` (duração e preço totais no evento) e rótulos compatíveis com reservas multi-serviço e de um serviço (PR `#68` / onda 2).
- Motor de reservas com múltiplos serviços do mesmo estabelecimento (Issue `#21`, PR `#139`): tabela `booking_services`, RPCs agregadas, seleção múltipla na página pública, compatibilidade com reservas de um serviço e migration `20261125120000_booking_multiple_services.sql`.
- Matriz de privilégios com grants mínimos para `notifications` e `booking_services` (`20261125130000_table_privileges_matrix.sql`).
- Consolidação documental “plataforma única, perfil público interno”:
  `docs/REVISAO-ARQUITETURA-SOCIAL.md` com auditoria, decisão de URL canônica
  `/p/[slug]` para o perfil público (alternativas `/{slug}`, `/@{slug}` e
  `/profissional/{slug}` rejeitadas/adiadas) e matriz de compatibilidade;
  ADR (`docs/DECISAO-ARQUITETURA-MARCOU-SOCIAL.md`), contrato de domínio,
  roadmap e prompt de agentes atualizados com os princípios de plataforma
  única, perfil como rota interna e visitante sem conta para conteúdo público.
  Nenhuma rota, migration ou configuração foi alterada.

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
  migration `20261125120000_booking_multiple_services.sql` (PR `#123`).
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

- Normalização WhatsApp: DDDs 12–19 (e demais Anatel) deixam de ser rejeitados; internacional só com `+` explícito diferente de 55 (#153 regressão).
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
- Recuperação de senha (Issue `#70`): o proxy (`src/proxy.ts`) reencaminha um
  `code` ou `token_hash` que chegar fora do handler correto — ex.: landing page
  quando o Supabase substitui o `redirectTo` pelo Site URL — para
  `/auth/callback` ou `/auth/confirm` (`src/lib/auth-url.ts`), sem reaproveitar
  `next` da URL original e sem criar loops. O callback (`/auth/callback`)
  reconhece recuperação pelo `redirectType` do auth-js (além do legado
  `flow=recovery`) e encaminha a sessão PKCE válida para `/redefinir-senha`,
  avisando quando o verificador PKCE está ausente em outro navegador.
- Caracteres invisíveis na origem (Issue `#70`): `parseConfiguredOrigin` e
  `trustedAppOrigin` agora removem caracteres de formato Unicode (ex.: U+2060
  WORD JOINER, U+200B ZERO WIDTH SPACE, U+FEFF BOM) de `NEXT_PUBLIC_SITE_URL`
  antes de montar URLs de redirect. Isso evita que o Supabase rejeite o
  `redirectTo` por causa de um caractere invisível e faça fallback silencioso
  para a raiz do Site URL, enviando o usuário de volta à landing page.
- Segurança do fallback de recuperação: redirecionamentos do proxy agora usam
  origem validada (domínio oficial Marcou, previews numerados da Netlify ou
  localhost), não o Host recebido; testes cobrem Host malicioso e preservam
  previews e ambiente local.

### Segurança

- Endurece o `search_path` das cinco sobrecargas/helpers `SECURITY DEFINER` do motor de reservas multi-serviço para `pg_catalog, public`, com migration forward-only `20261128000200_booking_definer_search_path.sql` e regressões de `search_path` e grants mínimos em `social-foundation-check.mjs`.

- O harness `scripts/privileges-check.mjs` passa a integrar `npm run test:db`, validando a matriz completa de privilégios com defaults do Supabase emulados, incluindo as tabelas novas de reservas multi-serviço. Usa portas próprias (55438/55439) para não colidir com os demais PostgreSQL embutidos da suíte.

- Google Calendar (#29): callback OAuth falha fechado com `503` quando `NEXT_PUBLIC_SITE_URL` está ausente/inválida, sem aceitar a origem da própria requisição como fallback. Worker da outbox usa `lease_token` rotativo por claim e exige o token atual para confirmar/reagendar/encerrar jobs, impedindo ack tardio de worker cujo lease foi retomado. Migration `20261128000000_calendar_worker_fencing.sql`; harness `calendar-check.mjs` passa a integrar `npm run test:db`. Revogação externa do refresh token permanece pendente no banco até confirmação do Google; falhas transitórias são repetidas pelo worker, com `complete_calendar_disconnect` removendo a conexão só após sucesso. Funções Calendar recebem `search_path = pg_catalog, public` na migration `20261128000100_calendar_disconnect_revocation_retry.sql`.

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
- Migration aditiva `20261125130000_table_privileges_matrix.sql` (PR `#123`):
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
