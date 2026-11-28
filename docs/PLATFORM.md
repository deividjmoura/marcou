# Plataforma — inventário, ambientes e operação (Issues #30 e #20)

Documento de hardening operacional do Marcou.  
**Escopo:** inventário, matriz de variáveis, mecanismos canônicos de jobs,
ambientes, deploy, rollback e observabilidade baseados exclusivamente no que
está versionado no repositório. Nenhuma alteração remota em Supabase, Netlify,
Google Cloud ou secrets foi executada nesta entrega.

Última atualização verificada no repositório: 2026-11-27.

---

## 1. Inventário do repositório

### Arquitetura observada

| Camada | Tecnologia | Evidência no repositório |
| --- | --- | --- |
| Frontend / API | Next.js 16 (App Router) + React 19 + TypeScript | `package.json`, `next.config.ts`, `src/app/` |
| Auth / DB | Supabase Auth (PKCE via `@supabase/ssr`) + PostgreSQL | `src/lib/supabase/*`, `supabase/migrations/` |
| Hosting | Netlify (produção + Deploy Previews por PR) | `https://marcoou.netlify.app`; sem `netlify.toml` versionado (configuração no painel) |
| Testes unitários / domínio | Vitest | `vitest.config.ts`, `src/**/*.test.ts` |
| Testes de integração DB | `embedded-postgres` + `pg` | `scripts/db-check.mjs`, `social-foundation-check.mjs`, `identity-check.mjs`, `discovery-check.mjs`, `booking-concurrency.mjs`, `calendar-check.mjs`, `privileges-check.mjs` |
| Auditoria estática | Node scripts | `scripts/quality-audit.mjs`, `scripts/changelog-check.mjs` |
| CI e jobs | GitHub Actions | `.github/workflows/ci.yml`, `.github/workflows/booking-expiration.yml` |

### Scripts npm

| Script | Função |
| --- | --- |
| `dev` | Servidor de desenvolvimento |
| `build` | Build de produção Next.js |
| `start` | Servidor de produção local |
| `check:changelog` | Valida estrutura do `CHANGELOG.md` e exige registro em `## [Unreleased]` nas PRs relevantes |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `audit` | Auditoria estática de segredos, guardas de configuração Supabase e uso de `@supabase/ssr` |
| `test` | Vitest (domínio, rotas, autenticação, contraste WCAG, Calendar) |
| `test:db` | Integração em PostgreSQL embutido aplicando as migrations (`db-check`, `social-foundation-check`, `identity-check`, `discovery-check`, `booking-concurrency`, `calendar-check`, `privileges-check`) |

### Migrations versionadas

As migrations ficam em `supabase/migrations/` (24 arquivos em 2026-11-28, de
`202611150001_initial_schema.sql` até
`20261128000700_email_delivery_queue.sql`). Para a sequência
completa de aplicação — incluindo o tratamento das migrations fora de ordem da
PR `#142` (`20261125120000` e `20261125130000`) e a precedência do bucket
`service-images` (`20261128000400` antes de `20261128000600`) —, variáveis por
fase, ativação segura de schedulers e rollback, consulte
`docs/TESTE-REAL-PRODUCAO.md`.

**Estado remoto:** não revalidado aqui (sem acesso direto ao painel/CLI remoto).
Consulte `AGENT_TASK_MARCOU.md` e confirme no projeto Supabase antes de aplicar
qualquer migration; nunca aplique em produção sem validação prévia em staging e
autorização explícita do responsável.

### CI (`.github/workflows/ci.yml`)

- **Triggers:** `push` em `main` e `design/identidade-visual`; `pull_request`
  para `main`.
- **Job único `quality`:** Node 22, `fetch-depth: 0`, `timeout-minutes: 20`,
  sem `continue-on-error`.
- **Ordem dos gates:** `check:changelog` → `lint` → `typecheck` → `audit` →
  `test` → `test:db` → `build`.
- **Concurrency:** cancela runs redundantes em PRs/branches da mesma ref; não
  cancela runs em andamento na `main`.
- **Lockfile:** o repositório **não** versiona `package-lock.json` (`.gitignore`),
  portanto o CI **não** usa `cache: npm` no `setup-node` e instala com
  `npm install --no-audit --no-fund --legacy-peer-deps`.

### O que **não** está provisionado no repositório

- Workflow de deploy automático para produção (deploy ocorre via integração Netlify).
- Scheduler externo ativo para `GET /api/cron` ou `POST /api/calendar/worker`.
- Alertas externos, APM/tracing ou dashboards de observabilidade versionados.
- Scripts de backup/restore remoto.
- Credenciais ou arquivos `.env` reais (apenas `.env.example`).

---

## 2. Matriz de variáveis de ambiente

**Regra:** nunca commitar valores reais no Git, logs, PRs ou documentos.

### Variáveis da aplicação (Next.js / Netlify)

| Variável | Local | Preview / Staging | Produção | Classificação | Onde usada | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | origem exata do preview | `https://marcoou.netlify.app` | pública | `src/lib/identity.ts`, `src/server/calendar/http.ts`, `src/server/calendar/oauth.ts` | Origem usada em redirects Auth/OAuth; ver `docs/IDENTITY.md` |
| `NEXT_PUBLIC_SUPABASE_URL` | obrigatória | obrigatória | obrigatória | pública | `src/lib/env.ts`, `src/app/api/cron/route.ts`, `src/server/calendar/admin.ts` | URL HTTPS do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | obrigatória | obrigatória | obrigatória | pública | `src/lib/env.ts`, clients Supabase | Chave publishable/anon; **não** é service-role |
| `SUPABASE_SERVICE_ROLE_KEY` | opcional | se jobs/worker | se jobs/worker | **secreta (server-only)** | `src/app/api/cron/route.ts`, `src/server/calendar/admin.ts` | Nunca no browser nem em `NEXT_PUBLIC_*` |
| `CRON_SECRET` | opcional | se lembretes | se lembretes | **secreta (server-only)** | `src/server/cron-auth.ts` (`GET /api/cron`) | Bearer token comparado em tempo constante; fail-closed se ausente |
| `HEALTH_CHECK_SECRET` | opcional | opcional | opcional | **secreta (server-only)** | `src/server/health.ts` (`GET /api/health?deep=1`) | Bearer token em tempo constante para modo profundo (checagem de banco); modo mínimo `GET /api/health` não consulta segredos |
| `AUTH_TIMING_LOG` | opcional | opcional | opcional | operacional (server-only) | `src/server/identity.ts` | `"1"` ativa logs de latência sem PII |
| `GOOGLE_CALENDAR_ENABLED` | opcional (`false`) | opcional (`false`) | opcional (`false`) | feature flag (server-only) | `src/server/calendar/crypto.ts` | Somente `"true"` habilita UI/rotas; desligado por padrão |
| `GOOGLE_CALENDAR_CLIENT_ID` | opcional | se Calendar ativo | se Calendar ativo | configuração (server-only) | `src/server/calendar/google.ts`, `oauth.ts` | OAuth Google Calendar; ver `docs/CALENDAR-INTEGRATION.md` |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | opcional | se Calendar ativo | se Calendar ativo | **secreta (server-only)** | `src/server/calendar/google.ts` | Nunca no cliente |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | opcional | se Calendar ativo | se Calendar ativo | **secreta (server-only)** | `src/server/calendar/crypto.ts` | Chave AES-256-GCM (32 bytes em base64) |
| `GOOGLE_CALENDAR_WORKER_SECRET` | opcional | se Calendar ativo | se Calendar ativo | **secreta (server-only)** | `src/server/calendar/worker-auth.ts` (`POST /api/calendar/worker`) | Bearer token do worker Calendar |

### Variáveis do GitHub Actions (`.github/workflows/booking-expiration.yml`)

| Nome | Escopo GitHub | Classificação | Finalidade |
| --- | --- | --- | --- |
| `BOOKING_EXPIRATION_ENABLED` | Repository variable | gate operacional | Precisa ser `"true"` para executar; ausente ou outro valor mantém o job inerte |
| `SUPABASE_PROJECT_REF` | Environment `booking-expiration-staging` (variable) | configuração | Project ref de 20 caracteres do staging; o workflow **recusa explicitamente** o ref de produção (`peornypgltuueubmsucm`) |
| `SUPABASE_URL` | Environment `booking-expiration-staging` (secret) | segredo de ambiente | URL exata `https://${SUPABASE_PROJECT_REF}.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Environment `booking-expiration-staging` (secret) | **secreta** | Usada somente na chamada REST para `expire_stale_bookings()` |

### Verificação de exposição

- `npm run audit` (`scripts/quality-audit.mjs`) varre arquivos rastreados para
  padrões de segredos/JWTs, exige guarda de configuração (`isSupabaseConfigured`)
  em páginas/rotas/ações e garante uso de `@supabase/ssr` (PKCE), com exceção
  restrita e verificada apenas para `src/app/api/cron/route.ts`.
- `.gitignore` ignora `.env` e `.env.*` (mantendo `.env.example`).
- Caso qualquer credencial seja exposta em logs, chat ou histórico Git: **não**
  republicar o valor; rotacionar imediatamente no provedor e atualizar os secrets.

---

## 3. Mecanismo canônico único de schedulers e jobs

Para evitar concorrência entre jobs duplicados, cada rotina agendada possui um
**único** mecanismo canônico versionado — todos **desligados por padrão** até
configuração e autorização do responsável:

| Rotina | Mecanismo canônico | RPC / destino | Estado padrão | Documentação |
| --- | --- | --- | --- | --- |
| Expiração de holds vencidos | `.github/workflows/booking-expiration.yml` (GitHub Actions, a cada 5 min) | `POST /rest/v1/rpc/expire_stale_bookings` | **Desligado** (`BOOKING_EXPIRATION_ENABLED != 'true'`), staging-only | `docs/BOOKING-EXPIRATION-SCHEDULER.md` |
| Lembretes de reservas confirmadas | `GET /api/cron` (`Authorization: Bearer <CRON_SECRET>`, `server-only`, `private/no-store`) | `create_booking_reminders(24)` | **Sem scheduler externo ativo**; fail-closed sem secrets | `docs/NOTIFICACOES.md` |
| Sincronização Google Calendar | `POST /api/calendar/worker` (`Authorization: Bearer <GOOGLE_CALENDAR_WORKER_SECRET>`) | Outbox Calendar | **Desligado** (`GOOGLE_CALENDAR_ENABLED != 'true'`) | `docs/CALENDAR-INTEGRATION.md` |

- Não existe endpoint HTTP de expiração no app Next.js (propostas antigas como
  `POST /api/bookings/expire` foram descartadas para evitar duplicação com o
  workflow canônico da PR #128).
- Desde a migration `20261123133000_harden_security_definer_grants.sql`,
  `expire_stale_bookings()` e `create_booking_reminders(integer)` aceitam
  execução apenas de `service_role` (ver `docs/SECURITY-DEFINER-GRANTS.md`).

---

## 4. Ambientes, deploy e rollback

### Ambientes

| Ambiente | Finalidade | Como materializar |
| --- | --- | --- |
| Local | Desenvolvimento e testes | `.env.local` + `npm run dev`; integração de banco via `npm run test:db` (`embedded-postgres`) |
| Preview / Staging | Validação de PRs e homologação | Deploy Previews da Netlify por PR + projeto Supabase de **staging separado** |
| Produção | Usuários reais | Site Netlify de produção (`https://marcoou.netlify.app`) + projeto Supabase de produção (`peornypgltuueubmsucm`) |

### Checklist pré-deploy (produção)

1. CI `quality` verde no SHA exato (`check:changelog`, `lint`, `typecheck`,
   `audit`, `test`, `test:db`, `build`).
2. Checks da Netlify (`Redirect rules`, `Header rules`) verdes no Deploy Preview.
3. Migrations novas revisadas, testadas em staging e **autorizadas** pelo
   responsável antes de aplicar no remoto.
4. Variáveis de ambiente conferidas por contexto na Netlify (Site configuration
   → Environment variables), garantindo que nenhuma chave secreta use prefixo
   `NEXT_PUBLIC_*`.
5. Smoke tests concluídos em staging/preview e plano de rollback confirmado.

### Deploy controlado (requer credenciais e autorização do responsável)

1. Merge autorizado da PR em `main`.
2. A Netlify executa o build automático a partir da `main` (configuração mantida
   no painel; não há `netlify.toml` versionado).
3. Aplicar migrations pendentes no Supabase de staging primeiro e, após
   validação, em produção **somente com autorização explícita**.
4. Executar smoke tests pós-deploy e monitorar logs nas primeiras horas.

### Procedimento de rollback

- **Aplicação (Netlify):** em *Deploys*, selecionar o último deploy estável
  anterior e acionar *Publish deploy* (restauração instantânea sem rebuild).
- **Banco (Supabase):** priorizar migrations aditivas e compatíveis para trás.
  Rollback de schema exige migration reversa revisada ou restauração de backup
  em janela controlada — nunca executar sem plano e autorização.
- **Configuração e feature flags:** variáveis de ambiente podem ser revertidas
  no painel da Netlify; schedulers e integrações podem ser desligados
  imediatamente via `BOOKING_EXPIRATION_ENABLED=false`, remoção/desativação do
  cron externo ou `GOOGLE_CALENDAR_ENABLED=false`.

### Smoke tests pós-deploy

- `GET /api/health` responde HTTP `200` com `{ status: "ok", version, commit }` e `Cache-Control: private, no-store, max-age=0, must-revalidate` sem expor configuração; `GET /api/health?deep=1` sem token retorna HTTP `401`.
- `/` e `/p/[slug]` de um prestador publicado carregam com HTTP `200` e política explícita de cache (`Vary: Cookie`, rebaixada para `private, no-store` quando há cookie de sessão).
- Páginas autenticadas (`/painel`, `/minha-conta`, `/reserva/[id]`, `/notificacoes`, `/inicio`, `/perfil`, `/meus-agendamentos`) e callbacks Auth (`/auth/callback`, `/auth/confirm`) retornam `Cache-Control: private, no-store, max-age=0, must-revalidate`.
- `GET /api/cron` sem token retorna HTTP `401` com `Cache-Control: private, no-store, max-age=0`.
- Fluxo de reserva, transição e notificações em staging sem erro 5xx.

---

## 5. Backup e observabilidade

### Backup

| Item | Estado no repositório | Recomendação operacional |
| --- | --- | --- |
| Backups automáticos Supabase | **Não verificado remotamente** (exige acesso ao dashboard) | Confirmar backups diários no plano contratado e executar teste periódico de restore em staging |
| Snapshots pré-migration | Não automatizado no repo | Exportar schema/dados críticos antes de migrations estruturais em produção |
| Código-fonte | GitHub (`deividjmoura/marcou`) | Versionado; publicar releases/tags apenas com aprovação explícita (`AGENTS.md`) |

### Observabilidade

| Capacidade | Estado | Recomendação |
| --- | --- | --- |
| Health check HTTP | **`GET /api/health`** implementado (`src/app/api/health/route.ts`): modo mínimo sem segredos + `?deep=1` protegido por `HEALTH_CHECK_SECRET` | Apontar monitor de uptime externo para `GET /api/health` e alertas em caso de falha |
| Política de cache HTTP | Implementada em `src/lib/cache-policy.ts`, `src/proxy.ts` e `next.config.ts` (`private, no-store` em rotas autenticadas/API e política explícita em rotas públicas com `Vary: Cookie`) | Conferir cabeçalhos efetivos no deploy publicado da Netlify |
| Logs de aplicação | Netlify (logs de deploy e funções — não auditados remotamente) | Revisar retenção e alertas de erro 5xx |
| Logs de banco | Supabase logs (não auditados remotamente) | Monitorar erros de RPC, locks e queries lentas |
| Latência de Auth | Instrumentação server-side sem PII (`AUTH_TIMING_LOG=1`) | Habilitar sob demanda em diagnóstico |
| Histórico de jobs | GitHub Actions runs (expiração); logs sem PII em `GET /api/cron` | Configurar alertas de falha e ausência de execução |
| Métricas de negócio | Tabela de auditoria `booking_events` já existe | Consultar agregados sem expor PII |
| Rate limiting / APM | **Ausente no repositório** | Configurar na borda/provedor (Issues #30/#31) antes de tráfego amplo |

---

## 6. Pendências que dependem do responsável (`OWNER_DECISION`)

Itens fora do escopo de automação por agente (Issues #30 e #20):

- [ ] Confirmar separação de projeto Supabase de staging vs produção (`peornypgltuueubmsucm`).
- [ ] Aplicar migrations pendentes primeiro em staging e, após validação, autorizar em produção.
- [ ] Conferir variáveis de ambiente por contexto na Netlify (Production, Deploy Previews, Branch Deploys) e rotacionar credenciais OAuth/SMTP previamente expostas.
- [ ] Validar política de cache/headers de rotas públicas vs autenticadas na Netlify e testar procedimento de rollback (*Publish deploy*).
- [ ] Confirmar backups automáticos no Supabase e documentar procedimento testado de restore.
- [ ] Provisionar Environment `booking-expiration-staging` e validar `booking-expiration.yml` antes de ligar `BOOKING_EXPIRATION_ENABLED=true`.
- [ ] Escolher e provisionar scheduler externo para `GET /api/cron` (`CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) e, se desejado, para `POST /api/calendar/worker`.
- [ ] Definir rate limiting, health check externo e alertas de erro 5xx/uptime.

---

## 7. Validação local

```bash
npm install --no-audit --no-fund --legacy-peer-deps
npm run check:changelog
npm run lint
npm run typecheck
npm run audit
npm test
npm run test:db
npm run build
```

A ausência de credenciais remotas de Supabase e Netlify impede validação em
ambiente publicado — limitação esperada desta entrega documental e de CI.
