# Changelog

Todas as mudanças funcionais, visuais, estruturais, de segurança ou de banco de
dados do Marcou são registradas neste arquivo.

O formato segue os princípios de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Toda Pull Request com mudanças relevantes deve atualizar a seção `## [Unreleased]`
(consulte [CONTRIBUTING.md](CONTRIBUTING.md)).

## [Unreleased]

### Adicionado

- `CHANGELOG.md` na raiz do repositório, `CONTRIBUTING.md` com o processo
  obrigatório de registro de mudanças e verificação automatizada
  (`scripts/changelog-check.mjs` / `npm run check:changelog`) integrada ao
  GitHub Actions (`.github/workflows/ci.yml`).
- Instrumentação de medição de etapas de login estritamente livre de PII,
  senhas ou tokens (`withAuthTimingCollector` e `measureAuthStep` em
  `src/server/identity.ts`) e medição comparativa real em PostgreSQL embutido
  (`scripts/identity-check.mjs`).
- Cobertura de testes unitários para `googleLoginAction`, `saveProfileAction`,
  `ensureAuthProfile` (caminho rápido, primeiro login, backfill CAS e colisões
  concorrentes) e validador de changelog (`src/lib/changelog-check.test.ts`).
- Matriz canônica de requisitos de produto e sequência de dependências das
  Issues `#84`, `#91` e `#93` registrada em `docs/ROADMAP-MARCOU-SOCIAL.md`,
  preservando a arquitetura da Issue `#72`.

### Alterado

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

### Corrigido

- Padrões de `Redirect URLs` documentados em `docs/IDENTITY.md` corrigidos para
  contemplar query strings (`**`) no glob matcher do Supabase Auth e o formato
  real de Deploy Preview da Netlify (`--marcoou.netlify.app`).
- Tratamento explícito de falha na leitura inicial de `profiles` antes de
  decidir pelo provisionamento, evitando tentativa de escrita cega sobre estado
  desconhecido.

### Segurança

- Proteção contra condições de corrida no provisionamento de `profiles`:
  inserção inicial com `ON CONFLICT (id) DO NOTHING` (`ignoreDuplicates: true`)
  e backfill de `display_name` condicionado por guarda CAS (`IS NULL` / valor
  anterior), impedindo que requisições paralelas sobrescrevam nome ou telefone
  já escolhidos pelo usuário em `/perfil`.
