# ADR: Estratégia de testes E2E com navegador e plano de Smoke E2E (Issue `#31`)

- **Status:** Proposto — aguarda `OWNER_DECISION` para escolha definitiva do backend de teste E2E (local em container no CI × projeto Supabase de *staging* dedicado).
- **Data:** 2026-11-28
- **Issue relacionada:** `#31` (*Escopo refinado*, fases 1 e 2 — coordenada com `#30`).
- **Estado atual no repositório:** existem 46 arquivos / 438 testes Vitest (`node`), 7 harnesses de integração PostgreSQL (`embedded-postgres`, aplicando as 24 migrations) e auditoria estática (`npm run audit`). **Ainda não há runner E2E de navegador (Playwright/Cypress) nem testes E2E executando no CI.**

---

## 1. Contexto e requisitos

Os testes existentes já validam regras de domínio, Server Actions com mocks, rotas HTTP (`/api/health`, `/api/cron`, `/auth/*`, `/api/calendar/*`), contraste WCAG e invariantes transacionais/RLS no PostgreSQL real. Contudo, regressões que atravessam navegador + cookies PKCE + proxy Next.js (`src/proxy.ts`) + Server Actions + hidratação React + GoTrue (Supabase Auth) + PostgREST só são capturadas de ponta a ponta por testes E2E com navegador real.

Qualquer solução de E2E para o Marcou deve cumprir **todos** os requisitos abaixo:

1. **Zero contato com produção:** nunca ler, gravar nem autenticar contra o projeto Supabase de produção (`peornypgltuueubmsucm`).
2. **Isolamento e determinismo (anti-*flaky*):** execuções paralelas em PRs não podem colidir em slugs, e-mails, disponibilidade ou reservas.
3. **Cobertura real de Auth e RLS:** precisa executar `auth.users` / GoTrue, cookies de sessão `@supabase/ssr`, chamadas PostgREST/RPC e as **24 migrations** de `supabase/migrations/`.
4. **Compatibilidade com o build local do Next.js:** rodar contra `npm run build && npm run start` (produção local), evitando falsos positivos de HMR do `next dev`.
5. **Segurança em PRs:** não expor `SUPABASE_SERVICE_ROLE_KEY` nem segredos de ambiente em forks ou logs públicos do CI.
6. **Custo e manutenção previsíveis** para um repositório em estágio MVP.

---

## 2. Opções avaliadas para o backend de E2E

### Opção A — Supabase local via CLI + containers Docker no CI (Recomendada como padrão de PR)

Sobe uma pilha Supabase descartável (`supabase start` via `supabase/setup-cli` no runner `ubuntu-latest` do GitHub Actions, ou localmente pelo desenvolvedor) aplicando as 24 migrations de `supabase/migrations/`, com GoTrue, PostgREST, PostgreSQL, Storage e Inbucket/Mailpit (captura local de e-mails sem envio externo).

| Critério | Avaliação |
| --- | --- |
| **Custo financeiro** | **R$ 0** em infraestrutura externa (roda nos minutos padrão de GitHub Actions `ubuntu-latest` com Docker pré-instalado). |
| **Segredos no CI** | **Zero segredos remotos necessários.** Usa apenas as chaves determinísticas efêmeras do container local (`http://127.0.0.1:54321`), inclusive seguras em PRs de forks. |
| **Isolamento entre PRs** | **Total:** cada job de CI nasce com banco zerado, aplica exatamente as migrations da branch da PR (incluindo migrations ainda não mergeadas na `main`!) e é destruído ao fim do job. |
| **Testes de Auth / Confirmação / Reset** | **Nativo sem SMTP externo:** Mailpit/Inbucket local permite inspecionar links de confirmação/recuperação via HTTP local (ou desabilitar confirmação de e-mail em `supabase/config.toml` para jornadas de smoke) sem disparar e-mails reais. |
| **Testes de Storage (`service-images`)** | Sobe container real de Supabase Storage API junto com a pilha, cobrindo o caminho HTTP real além do harness SQL local. |
| **Limitações / Custos operacionais** | Adiciona ~2–4 minutos de boot de containers (pull das imagens Docker + `supabase start` + `playwright install chromium`) por execução em CI; exige versionar um `supabase/config.toml` mínimo e fixar versão da CLI do Supabase para estabilidade; não testa OAuth externo real do Google nem rede/edge da Netlify. |

### Opção B — Projeto Supabase de *staging* dedicado (remoto)

Usa um segundo projeto Supabase hospedado em nuvem dedicado a *staging*/E2E, apontado por secrets configurados em um GitHub Environment protegido.

| Critério | Avaliação |
| --- | --- |
| **Custo financeiro** | Exige segundo projeto Supabase (no plano Free há limite de 2 projetos ativos por conta e pausa automática após 7 dias de inatividade; no plano Pro adiciona custo mensal recorrente por projeto). **Requer `OWNER_DECISION`.** |
| **Segredos no CI** | Exige provisionar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (para seed/limpeza de contas de teste) no GitHub Actions. **Não pode rodar automaticamente em PRs de forks** por risco de exfiltração de secrets. |
| **Isolamento entre PRs** | **Fraco:** PRs concorrentes compartilham o mesmo banco e schema. Uma PR com nova migration não pode alterar o schema compartilhado sem quebrar outras PRs; exige prefixos únicos por run e rotina rigorosa de cleanup de usuários/reservas para evitar lixo acumulado. |
| **Testes de Auth / E-mail** | Depende de limites de taxa do Supabase Auth hospedado e de criação via Admin API (`service_role`) para evitar bloqueios de rate limit de signup/e-mail. |
| **Pontos fortes** | Valida exatamente a infraestrutura hospedada da Supabase (Storage CDN real, limites reais de Auth, conectividade real com deploys preview/staging da Netlify) e tem boot mais rápido no job (sem subir containers Docker). |

### Resumo comparativo

| Dimensão | (A) Supabase local via CLI/Docker no CI | (B) Projeto Supabase de *staging* dedicado |
| --- | --- | --- |
| Testa migrations novas da PR antes do merge? | **Sim (nativo, banco limpo por PR)** | Não sem risco de quebrar PRs paralelas |
| Exige segredos no CI? | **Não** | Sim (`URL`, `PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`) |
| Risco de colisão entre PRs concorrentes | **Nenhum** | Alto (estado compartilhado) |
| Risco de tocar produção | **Nulo** (loopback `127.0.0.1`) | Baixo se isolado com trava de `project_ref` |
| Custo mensal adicional | **R$ 0** | Possível custo de projeto extra / pausa do plano Free |
| Tempo extra estimado no CI | ~2–4 min (job separado `e2e`, paralelo ao `quality`) | ~30–60 s (sem boot de containers) |
| Valida edge/CDN real da Netlify + Supabase Cloud | Não (coberto na validação pré-release em staging) | Sim |

---

## 3. Decisão recomendada (aguarda `OWNER_DECISION`)

**Recomendação:** adotar uma **estratégia em duas camadas**, começando pela **Opção A** no CI de PRs:

1. **Camada 1 — CI automatizado em PRs e `main` (Opção A: Supabase local via CLI/Docker + Playwright Chromium + `next start`):**
   - Job separado `e2e` em `.github/workflows/ci.yml` (rodando em paralelo ou após `quality`, com `timeout-minutes: 20`), usando `supabase start` sobre `supabase/config.toml` versionado e `supabase/migrations/` da própria PR.
   - Zero segredos remotos, zero custo externo, isolamento total por execução e capacidade de validar novas migrations antes do merge.
   - Runner recomendado: **Playwright (`@playwright/test`)** apenas com **Chromium** na Fase 2 (menor tempo de download/execução, suporte nativo a múltiplos `BrowserContext` simultâneos — essencial para testar cliente e prestador lado a lado —, `trace: "retain-on-failure"`, `webServer` apontando para `npm run start` e integração direta com `@axe-core/playwright` na Fase 3).
2. **Camada 2 — Validação pré-produção em *staging* hospedado (Opção B, complementar):**
   - Mantém o projeto de *staging* já previsto em `docs/TESTE-REAL-PRODUCAO.md` e `.github/workflows/booking-expiration.yml` para validação manual/agendada de itens que o container local não reproduz (Google OAuth real, Supabase Storage CDN remoto, Netlify Edge/headers em preview e schedulers reais), sem bloquear PRs com banco compartilhado.

### Itens de `OWNER_DECISION` necessários antes da Fase 2 (PR de implementação)

1. **Confirmar a opção de backend para o CI de E2E:**
   - **(A) Supabase local via CLI/containers no CI** (recomendada para PRs — sem custo nem segredos), **ou**
   - **(B) Projeto Supabase de *staging* dedicado** (informando se o projeto de staging já foi provisionado e se haverá autorização para cadastrar `SUPABASE_SERVICE_ROLE_KEY` de staging em GitHub Environment restrito).
2. **Confirmar política de execução no CI:**
   - Rodar o job `e2e` em **toda PR para `main`** (recomendado após 3 execuções consecutivas sem *flakiness*), ou apenas em `push` para `main` + `workflow_dispatch` durante o período de estabilização.
3. **Confirmar adição de `devDependency`:** autorização para adicionar `@playwright/test` (Fase 2) e `@axe-core/playwright` (Fase 3) em `package.json`, além de `supabase/config.toml` mínimo (se Opção A for aprovada).

---

## 4. Plano de Smoke E2E — 3 jornadas críticas (Fase 2 da Issue `#31`)

Escopo alinhado exatamente ao *Escopo refinado* da Issue `#31`, executado contra **build local de produção** (`npm run build` → `npm run start` em `http://127.0.0.1:3000`, `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`):

### 4.1 Premissas de arquitetura dos testes (anti-*flaky*)

- **Dois `BrowserContext` isolados:** um contexto para o **Prestador** e outro para o **Cliente**, evitando troca de sessão/cookie no mesmo navegador e testando permissões reais em paralelo.
- **Massa de dados determinística e única por execução:** e-mails com sufixo único (`e2e-provider-<runId>@example.test`, `e2e-client-<runId>@example.test`) e slug único (`e2e-studio-<runId>`).
- **Data futura determinística:** escolher sempre a próxima data útil fixa no fuso `America/Sao_Paulo` (ex.: `today + 3 dias`, configurando regra de disponibilidade para o dia da semana correspondente no intervalo `09:00–18:00`), nunca dependendo do horário atual do runner para evitar falhas perto da meia-noite ou virada de fuso UTC.
- **Seletores semânticos (acessíveis):** priorizar `getByRole`, `getByLabel` e `getByText` — validando acessibilidade básica de rótulos ao mesmo tempo em que evita acoplamento a classes CSS.
- **Zero `waitForTimeout` fixo:** usar exclusivamente auto-wait do Playwright (`toBeVisible`, `toHaveURL`, resposta de Server Action / `toHaveText`).
- **Artefatos em falha:** salvar `trace`, screenshot e vídeo apenas em caso de falha (`retain-on-failure`), **nunca** imprimir tokens/cookies/senhas em stdout.
- **Confirmação de e-mail na Jornada 1:**
  - Na **Opção A**, desabilitar confirmação obrigatória no `supabase/config.toml` local (`enable_confirmations = false`) **ou** ler o link de confirmação diretamente da API local do Mailpit/Inbucket (`http://127.0.0.1:54324`) para validar inclusive `/auth/confirm` sem e-mail externo.
  - Na **Opção B**, criar/confirmar a conta de teste via Admin API no fixture de setup ou capturar e-mail em caixa de teste controlada (sem jamais depender de caixa pessoal).

### 4.2 Especificação das 3 jornadas

| Jornada | Atores e rotas percorridas | Passos executados contra o build local | Asserções obrigatórias (critério de passe) |
| --- | --- | --- | --- |
| **J1 — Cadastro do prestador → criar serviço → publicar** | **Prestador** (`/cadastro` → `/perfil` → `/painel` → `/p/<slug>`) | 1. Acessar `/cadastro`, preencher **Nome**, **E-mail** e **Senha** (`>= 8` chars) e enviar **Criar conta**.<br>2. Concluir `/perfil` informando telefone válido (ex.: `(11) 99999-0001`).<br>3. Acessar `/painel`, salvar dados do negócio (`saveProviderAction`) com nome e slug único `e2e-studio-<runId>`, fuso `America/Sao_Paulo`.<br>4. Criar **2 serviços ativos** (`saveServiceAction`): ex. *Serviço A* (`60 min`, `R$ 80,00`, sinal `R$ 20,00`, buffer `15 min`) e *Serviço B* (`30 min`, `R$ 45,00`, sinal `R$ 10,00`, buffer `10 min`).<br>5. Cadastrar regra de disponibilidade (`saveRuleAction`) para o dia da semana alvo (`09:00`–`18:00`).<br>6. Abrir a página pública `/p/e2e-studio-<runId>` em contexto anônimo. | • `/p/e2e-studio-<runId>` responde HTTP `200` (sem 404).<br>• Nome do estabelecimento e os 2 serviços ativos são exibidos com preço/duração corretos.<br>• Seleção da data alvo carrega lista não vazia de horários disponíveis.<br>• Cabeçalho `Cache-Control` em `/painel` contém `private, no-store`. |
| **J2 — Reserva pública multi-serviço** | **Cliente** (`/cadastro` ou login → `/p/<slug>` → `/reserva/<id>`) | 1. No contexto do Cliente, autenticar conta cliente de teste com perfil/telefone completos.<br>2. Abrir `/p/e2e-studio-<runId>` e selecionar **Serviço A + Serviço B**.<br>3. Verificar resumo agregado exibido antes de enviar (`90 min`, `R$ 125,00`, sinal `R$ 30,00`).<br>4. Selecionar data alvo e primeiro horário disponível (ex.: `10:00`) e confirmar agendamento (`bookSlotAction`).<br>5. Aguardar redirecionamento automático para `/reserva/<id>`.<br>6. Reabrir `/p/e2e-studio-<runId>` na mesma data para os mesmos serviços. | • Redirecionamento para `/reserva/<uuid>` sem mensagem de erro.<br>• Página `/reserva/<id>` exibe snapshot agregado (`Serviço A + Serviço B`), duração `90 min`, total `R$ 125,00`, sinal `R$ 30,00` e status inicial aguardando pagamento.<br>• Cliente vê **Já enviei o comprovante** e **Cancelar agendamento**, e **não** vê **Confirmar pagamento**.<br>• O horário reservado (`10:00`) e a faixa coberta pelo 2º serviço/buffer (`10:30`–`11:30`) não aparecem mais disponíveis em `/p/<slug>`. |
| **J3 — Confirmação e cancelamento pelo prestador (+ notificações)** | **Cliente + Prestador** (`/reserva/<id>`, `/painel`, `/notificacoes`, `/p/<slug>`) | **Subfluxo 3A — Confirmação:**<br>1. Na reserva da J2, Cliente clica em **Já enviei o comprovante** (`pending_payment` → `pending_review`).<br>2. Prestador abre `/painel` (ou `/reserva/<id>`), localiza a reserva e clica em **Confirmar pagamento** (`pending_review` → `confirmed`).<br>3. Cliente e Prestador abrem `/notificacoes`.<br><br>**Subfluxo 3B — Cancelamento:**<br>4. Cliente cria uma 2ª reserva multi-serviço em outro horário livre (ex.: `14:00`) → `/reserva/<id2>`.<br>5. Prestador acessa `/reserva/<id2>` (ou `/painel`) e aciona **Cancelar reserva do cliente** (`cancelled`).<br>6. Cliente abre `/notificacoes` e verifica `/p/e2e-studio-<runId>` na mesma data. | • **3A:** status muda para confirmado; botões de pagamento desaparecem; cliente e prestador recebem notificação de confirmação com o snapshot agregado em `/notificacoes`.<br>• **3B:** status muda para cancelado; cliente recebe notificação obrigatória de cancelamento em `/notificacoes`; o horário `14:00` volta a aparecer disponível em `/p/<slug>`.<br>• **Isolamento:** uma requisição direta de conta terceira (não participante) a `/reserva/<id>` não acessa os dados da reserva. |

### 4.3 Estrutura prevista de arquivos na PR da Fase 2 (ainda não criada nesta PR)

```text
playwright.config.ts           # baseURL 127.0.0.1:3000, webServer npm run start, retries: 1 no CI, trace retain-on-failure
supabase/config.toml           # configuração mínima local (se Opção A confirmada)
e2e/
  fixtures/
    auth.ts                    # helpers de cadastro/login isolados para Prestador e Cliente
    dates.ts                   # cálculo determinístico de data futura em America/Sao_Paulo
  smoke.spec.ts                # J1, J2 e J3 encadeadas de forma limpa ou isoladas com setup dedicado
```

Scripts previstos em `package.json`:
- `"test:e2e": "playwright test"` (executa contra build local `next start` + backend configurado)
- `"test:e2e:ui": "playwright test --ui"` (depuração local opcional)

### 4.4 Critérios de aceite para considerar a Fase 2 estável no CI

1. **Zero *flakiness*:** 3 execuções consecutivas verdes em CI sem rerun manual.
2. **Tempo total controlado:** job `e2e` completo (setup + 3 jornadas) em menos de 8 minutos no runner padrão.
3. **Sem impacto no gate atual:** `quality` (`check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db`, `build`) continua passando de forma independente e sem `continue-on-error`.
4. **Rastreabilidade na Issue `#31`:** atualizar `docs/QUALITY-AUDIT.md` com o resultado real da primeira execução em CI e seguir para as Fases 3 (acessibilidade automatizada + manual + `prefers-reduced-motion`), 4 (medições reais mobile LCP/CLS/INP sem números inventados) e 5 (revisão de segurança + rate limiting).

---

## 5. Preparação já entregue (sem instalar dependências · Onda 6)

Para começar a Fase 2 imediatamente assim que o responsável registrar o
`OWNER_DECISION`, os blocos independentes de runner/dependência já foram
implementados e testados no repositório:

### 5.1 Módulo puro de contrato, guarda anti-produção e massa determinística

- **`src/lib/e2e-smoke.ts`** e **`src/lib/e2e-smoke.test.ts`** (cobertos pelo
  `npm test` em toda PR, sem novas dependências):
  - `assertSafeE2EEnvironment({ supabaseUrl, siteUrl })`: trava **fail-closed**
    que bloqueia explicitamente qualquer execução contra o project ref de
    produção (`peornypgltuueubmsucm`) ou contra `marcoou.netlify.app`, exige
    HTTPS para staging remoto e devolve `healthUrl` apontando para
    `GET /api/health` (PR `#157`) — pronta para uso direto como `webServer.url`
    do Playwright.
  - `pickDeterministicE2EDate({ now, timeZone, offsetDays })`: calcula a data
    futura no fuso `America/Sao_Paulo` e converte o dia da semana para a
    convenção do Marcou (`0 = domingo .. 6 = sábado`), evitando deriva na virada
    de dia UTC em runners de CI.
  - `buildSmokeFixture(runId)`: gera contas isoladas no TLD reservado `.test`
    (RFC 2606 — prestador, cliente e terceira conta para isolamento), slug único
    válido, 2 serviços multi-serviço (*Serviço A* + *Serviço B*) e expectativas
    calculadas por `aggregateBookingServices()`, tudo validado em teste contra
    `providerInputSchema`, `serviceInputSchema`, `availabilityRuleInputSchema` e
    os rótulos reais de `reservationActionsFor()`.

### 5.2 Blueprint de `supabase/config.toml` mínimo (se Opção A for aprovada)

```toml
project_id = "marcou-e2e-local"

[api]
enabled = true
port = 54321
schemas = ["public", "storage"]

[db]
port = 54322
major_version = 15

[storage]
enabled = true
file_size_limit = "5MiB"

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = [
  "http://127.0.0.1:3000/auth/callback**",
  "http://127.0.0.1:3000/auth/confirm**"
]
enable_signup = true

[auth.email]
enable_signup = true
# Desabilitar confirmação obrigatória no container local elimina dependência de
# SMTP nas jornadas de smoke; ou habilitar e ler links do Inbucket/Mailpit em :54324.
enable_confirmations = false
```

### 5.3 Blueprint do job `e2e` no CI (a adicionar em `.github/workflows/ci.yml` após decisão)

- **Opção A (Supabase local — recomendada, zero segredos remotos):**
  1. `actions/checkout@v4` + `actions/setup-node@v4` (Node 22) + `npm install --no-audit --no-fund --legacy-peer-deps`.
  2. `supabase/setup-cli@v1` (versão fixa) → `supabase start` (aplica automaticamente as 24+ migrations em `supabase/migrations/`).
  3. Exportar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` a partir de `supabase status -o env` + `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`.
  4. `npx playwright install --with-deps chromium` → `npm run build` → `npm run test:e2e` (com `webServer` apontando para `npm run start` e pronto quando `GET /api/health` responder `200`).
  5. Upload de artefatos Playwright (`playwright-report/`, `test-results/`) somente `if: failure()`, seguido de `supabase stop --no-backup` (`if: always()`).
- **Opção B (Projeto de *staging* dedicado):**
  1. Rodar em GitHub Environment protegido (sem execução em PRs de forks), exigindo `assertSafeE2EEnvironment()` no `globalSetup` do Playwright.
  2. Criar e limpar as contas temporárias `e2e-*-<runId>@marcou.test` em `globalTeardown` via Admin API (`SUPABASE_SERVICE_ROLE_KEY` de staging), sem jamais compartilhar slugs entre runs.

### 5.4 Checklist de execução imediata pós-`OWNER_DECISION` (Fase 2)

1. Adicionar `@playwright/test` em `devDependencies` + scripts `test:e2e` / `test:e2e:ui` em `package.json`.
2. Criar `playwright.config.ts` chamando `assertSafeE2EEnvironment(process.env)` antes de iniciar e usando `healthUrl` (`http://127.0.0.1:3000/api/health`) em `webServer.url`.
3. Criar `supabase/config.toml` (se Opção A) e `e2e/smoke.spec.ts` consumindo `buildSmokeFixture()` para executar J1, J2 e J3 com dois `BrowserContext` isolados (Prestador e Cliente) + verificação de bloqueio para `outsiderAccount`.
4. Adicionar o job `e2e` ao `.github/workflows/ci.yml`, validar 3 execuções consecutivas verdes sem *flakiness* e registrar resultados reais em `docs/QUALITY-AUDIT.md`.

