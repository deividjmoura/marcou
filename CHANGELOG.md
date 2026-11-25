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

### Alterado

- Sinal (depósito) do serviço passa a ser opcional no formulário do painel:
  campo vazio significa "sem sinal" e é gravado como 0, como já permitiam o
  schema e o banco. O preço continua obrigatório.
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

- Preço e sinal de serviços no painel aceitam ponto como separador de milhar e
  vírgula como decimal (`1.234,56`), mantêm o formato `1234.56` gerado pelo
  formulário de edição e recusam entradas ambíguas (como `0.500`) com mensagem
  clara, em vez de gravar outro valor. O cálculo usa apenas inteiros
  (`src/lib/money.ts`).
- A página `/reserva/[id]` mostra ações e rótulos por papel: o dono do
  estabelecimento deixa de ver "Já enviei o comprovante" e "Cancelar
  agendamento", textos do cliente, e passa a ver "Marcar comprovante recebido",
  "Confirmar pagamento" e "Cancelar reserva do cliente". A autorização continua
  integralmente em `transition_booking`.
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
