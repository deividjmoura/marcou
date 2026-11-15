# Plataforma — inventário, ambientes e operação (Issue #30)

Documento de hardening operacional do Marcou.  
**Escopo:** auditoria e documentação local. Nenhuma alteração remota (Supabase/Vercel de produção) foi executada nesta entrega.

Última atualização verificada no repositório: 2026-11-15.

**PR:** https://github.com/deividjmoura/marcou/pull/32 · **Branch:** `feat/30-platform-hardening`

---

## 1. Inventário do que existe no repositório

### Arquitetura observada

| Camada | Tecnologia | Evidência no repo |
|--------|------------|-------------------|
| Frontend | Next.js 16 App Router + React 19 + TypeScript | `package.json`, `next.config.ts`, `src/app/` |
| Auth / DB | Supabase Auth + PostgreSQL | `src/lib/supabase/*`, `supabase/migrations/` |
| Hosting (esperado) | Vercel | `vercel.json` |
| Testes unitários/domínio | Vitest | `vitest.config.ts`, `src/**/*.test.ts` |
| Testes de integração DB | embedded-postgres + `pg` | `scripts/db-check.mjs`, script `test:db` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

### Scripts npm

| Script | Função |
|--------|--------|
| `dev` | Servidor de desenvolvimento |
| `build` | Build de produção Next.js |
| `start` | Servidor de produção local |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest (domínio) |
| `test:db` | Integração em PostgreSQL embutido (aplica migrations e exercita RLS/concorrência) |

### Migrations versionadas

1. `202611150001_initial_schema.sql` — schema base, RLS, GiST de não-sobreposição  
2. `202611150002_booking_operations.sql` — RPCs de reserva, expiração, agenda  
3. `202611150003_notifications.sql` — notificações internas  

**Estado remoto (documentado, não revalidado aqui):** projeto Supabase `peornypgltuueubmsucm` (São Paulo); migrations **não** aplicadas no remoto segundo `AGENT_TASK_MARCOU.md`.

### CI atual (`.github/workflows/ci.yml`)

- **Triggers:** push em `main`; pull_request para `main`
- **Job único `quality`:** install → lint → typecheck → test → test:db → build
- **Node:** 22
- **Gates:** sequenciais; falha em qualquer passo interrompe o job (sem `continue-on-error`)
- **Concurrency:** cancela runs redundantes na mesma ref
- **Lockfile:** o repo **não** versiona `package-lock.json` (ver `.gitignore`). Por isso o CI **não** usa `cache: npm` no `setup-node` — essa opção exige lockfile e quebrou a primeira run da PR #32.

### O que **não** foi encontrado no repositório

- Workflows de deploy automático para produção
- Configuração de Cron Jobs / scheduled functions no repo
- Alertas, APM ou dashboards de observabilidade versionados
- Scripts de backup/restore
- Arquivos `.env` com valores reais (apenas `.env.example`)
- Uso de `SERVICE_ROLE` ou chaves secretas no código-fonte da aplicação

---

## 2. Matriz de variáveis de ambiente

**Regra:** nunca commitar valores reais. Apenas nomes e finalidade.

| Variável | Local | Preview / Staging | Produção | Tipo | Onde usada | Notas |
|----------|-------|-------------------|----------|------|------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | obrigatória | obrigatória | obrigatória | pública | `src/lib/env.ts`, clients Supabase | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | obrigatória | obrigatória | obrigatória | pública (anon/publishable) | idem | Chave publicada; **não** é service-role |
| (futuro) `SUPABASE_SERVICE_ROLE_KEY` | opcional (scripts admin) | opcional | opcional | **secreta** | apenas server-side / jobs | **Não** deve ir para o browser nem para `NEXT_PUBLIC_*` |
| (futuro) `CRON_SECRET` / webhook secrets | — | se jobs | se jobs | **secreta** | headers de autenticação de jobs | Ainda não implementado |

### Classificação

- **Públicas (`NEXT_PUBLIC_*`):** seguras para bundle do cliente; ainda assim não devem ser tratadas como “sem risco” (rate limit, abuso de API).
- **Secretas:** service-role, tokens de pagamento, chaves de cron, connection strings privilegiadas. Nunca no frontend, nunca no Git, nunca em logs de build públicos.

### Verificação de exposição (auditoria 2026-11-15)

- Código em `src/` referencia apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `.gitignore` ignora `.env` e `.env.*` (mantém `.env.example`).
- Nenhum segredo real foi encontrado versionado nesta auditoria.
- Se no futuro aparecer um segredo no histórico Git: **não** republicar o valor; rotacionar no provedor e limpar histórico com processo controlado pelo responsável.

---

## 3. Ambientes e fluxo de deploy recomendado

### Ambientes

| Ambiente | Finalidade | Como materializar (recomendação) |
|----------|------------|----------------------------------|
| Local | Desenvolvimento | `.env.local` + `npm run dev`; migrations via `test:db` ou Supabase CLI local |
| Preview / Staging | Validação de PRs | Deploy preview Vercel ligado a branches/PRs; projeto Supabase de staging **separado** ou branch de DB |
| Produção | Usuários reais | Projeto Vercel production + projeto Supabase de produção |

### Checklist pré-deploy (produção)

1. CI verde na branch a ser promovida (lint, typecheck, test, test:db, build).
2. Migrations revisadas e **autorizadas** pelo responsável antes de aplicar no remoto.
3. Variáveis de ambiente conferidas no painel Vercel (sem service-role no client).
4. Smoke tests manuais (login, página pública, criação de reserva de teste em staging).
5. Plano de rollback definido (ver abaixo).

### Deploy (passos típicos — requerem credenciais do responsável)

1. Merge autorizado da PR em `main` (ou promoção de tag).
2. Vercel faz build a partir de `main` (config em `vercel.json`: install + `npm run build`).
3. Aplicar migrations pendentes no Supabase de produção **somente com autorização explícita** (CLI ou dashboard).
4. Smoke test pós-deploy.
5. Monitorar erros/logs nas primeiras horas.

### Rollback

- **Aplicação:** reverter deployment na Vercel para o deployment anterior estável (UI Vercel → Deployments → Promote/Rollback).
- **Banco:** migrations devem ser aditivas sempre que possível. Rollback de schema exige migration reversa ou restore de backup — **não** executar sem plano e autorização.
- **Config:** variáveis de ambiente podem ser restauradas no painel Vercel; mudanças de Auth/RLS no Supabase devem ser rastreadas.

### Smoke tests sugeridos (pós-deploy)

- `/` e página pública de um prestador publicado carregam sem erro 5xx.
- Login / callback Auth responde.
- `npm run test:db` continua passando em CI (regressão de schema).
- Criação de reserva de teste (ambiente não-prod) completa ou falha com mensagem esperada.

---

## 4. Backup e observabilidade

### Backup

| Item | Estado no repo | Recomendação |
|------|----------------|--------------|
| Backups automáticos Supabase | **Não verificado** nesta tarefa (exige acesso ao dashboard) | Habilitar backups diários no plano adequado; testar restore em staging |
| Exports manuais | Não versionados | Export periódico de schema + dados críticos antes de migrations destrutivas |
| Código | GitHub | Já versionado; tags de release recomendadas |

**Não afirmar que backups estão ativos sem evidência no dashboard do projeto.**

### Observabilidade

| Capacidade | Estado | Recomendação |
|------------|--------|--------------|
| Logs de aplicação | Vercel (runtime logs) — esperado, não auditado remotamente | Revisar retenção e alertas de erro 5xx |
| Logs de banco | Supabase logs | Ativar alertas de queries lentas / conexões se disponível no plano |
| Métricas de negócio | Não implementadas | Contadores de reservas/falhas via tabela de eventos já existente (`booking_events`) |
| Alertas | Não configurados no repo | Alertas de CI falho + erro de deploy; depois uptime da URL pública |
| APM / tracing | Ausente | Opcional (OpenTelemetry / Vercel Analytics) em fase posterior |

### Cron / jobs

- RPCs `expire_stale_bookings` e `create_booking_reminders` existem no schema, mas **não há** scheduler versionado no repositório.
- Jobs de expiração/lembrete devem ser coordenados com Issues #25/#26; esta entrega apenas registra o requisito de **idempotência**, autenticação por secret e execução via `service_role` ou edge function protegida — sem implementar o job.

---

## 5. Melhorias locais realizadas nesta entrega

1. Documentação completa de plataforma (`docs/PLATFORM.md` — este arquivo).
2. Workflow CI: concurrency, timeout 20min, steps nomeados; **sem** `cache: npm` (o repo não versiona lockfile; a primeira run da PR #32 falhou por esse motivo e foi corrigida).
3. `.env.example` com classificação PUBLIC vs SECRET, sem valores.
4. Seção operacional no README apontando para este documento.

**Não alterado:** código de produto (#21 booking, #27 design system), Auth, RLS, migrations de domínio, configurações remotas.

---

## 6. Ações que dependem do responsável

- [ ] Confirmar CI verde na PR #32 após o fix do cache.
- [ ] Confirmar e aplicar migrations no Supabase remoto (quando autorizado).
- [ ] Configurar/validar variáveis no projeto Vercel (preview e production).
- [ ] Habilitar e testar backups no Supabase; documentar procedimento de restore.
- [ ] Definir se haverá projeto Supabase separado para staging.
- [ ] Autorizar implementação de cron/jobs (Issues #25/#26) com secret e idempotência.
- [ ] Revisar e fazer merge desta PR após validação.
- [ ] No merge de `AGENT_TASK_MARCOU.md`, preferir a versão completa da `main` + nota curta #30 (evitar truncar handoffs de outros agentes).

---

## 7. Como validar esta entrega

```bash
npm install --no-audit --no-fund --legacy-peer-deps
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

Ausência de credenciais Supabase/Vercel impede validação remota — limitação esperada, não falha desta entrega documental.
