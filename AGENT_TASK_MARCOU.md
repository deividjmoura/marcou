# Marcou — estado atual e continuidade

Última atualização: 25/11/2026

## Google Calendar — Issue #29 — 25/11/2026

- Branch `arena/9e68c2bb-marcou` integra `feat/29-google-calendar-sync`
  (`b83e0cd`) sobre a `main` `9b92451`. Sem push, PR ou Supabase remoto; a
  migration `20261125153000_google_calendar_sync.sql` segue não aplicada.
- Tabela de tokens renomeada para `calendar_connections`. OAuth com state
  consumido atomicamente e preso ao usuário, escopo `calendar.events`
  obrigatório e `/connect` só via POST com checagem de origem. Worker com um
  job por reserva, escritas verificadas, estado `dead` e suspensão por
  `invalid_grant`. Desconexão mantém tokens/vínculos até a limpeza terminar.
- Validação local: lint, typecheck, 204 testes Vitest, `test:db` (legado 69,
  social 47, identidade 32, discovery 40, calendar 83 — todos sem falha) e
  build. Fluxo OAuth real, Google API, scheduler e CI não validados.
- Branch empilhada sobre a PR #123 (merge de `16f0166`, autorizado): as 3
  tabelas do Calendar entram na matriz de `scripts/privileges-check.mjs`
  (fase `before` exclui matriz e Calendar) e em
  `docs/handoffs/privilegios-tabelas.md`. A #123 precisa ser mesclada antes.
  Validação empilhada: 214 testes, `test:db` (booking 116, social 50,
  identidade 32, discovery 40, privilégios 43/49, calendar 84 — sem falhas),
  `audit` 0/0 e build. Emular defaults do Supabase desde a primeira migration
  segue dependente da #125.

## Estabilização de autenticação, velocidade de login e changelog obrigatório — 24/11/2026

- **Diagnóstico real do Google OAuth (`Erro 400: redirect_uri_mismatch`):**
  comprovado na requisição pública e no código que `NEXT_PUBLIC_SITE_URL=https://marcoou.netlify.app`
  está configurada em produção, que `googleLoginAction` envia `redirectTo` para
  `https://marcoou.netlify.app/auth/callback?next=<caminho-seguro>` (callback
  final da aplicação) e que o Supabase (`peornypgltuueubmsucm`) envia ao Google
  `client_id=563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com`
  e `redirect_uri=https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`,
  recebendo `redirect_uri_mismatch` do Google para esse URI. A lista cadastrada
  em **Authorized redirect URIs** no Google Cloud Console e o painel interno do
  Supabase não foram consultados diretamente e dependem de conferência manual.
  Padrões de allowlist no Supabase também foram corrigidos em `docs/IDENTITY.md`
  com `**` para query strings e `--` para Deploy Previews da Netlify.
- **Diagnóstico de entregabilidade de e-mail (spam):** evidenciado nos cabeçalhos
  RFC somente-leitura (sem leitura/registro de tokens ou segredos) que o envio
  passa por `smtp.gmail.com` com `Marcou <appmarcou@gmail.com>`, `SPF/DKIM/DMARC pass`
  em `gmail.com`, assunto em inglês (`Confirm your email address`) e `text/html`
  sem `text/plain` — o que não garante caixa de entrada nem prova isoladamente
  uma única causa. Documentados separadamente em `docs/IDENTITY.md` as
  evidências, hipóteses de filtragem e recomendações externas (domínio próprio,
  SMTP transacional dedicado, SPF/DKIM/DMARC alinhados e revisão dos templates).
- **Velocidade de login, medição sem PII e segurança de perfil:** `ensureAuthProfile` em
  `src/server/identity.ts` unifica leitura de `display_name, phone` em 1 único
  `SELECT` para logins recorrentes (0 escritas e eliminação da segunda consulta
  `profileNeedsPhone`), protege inserção/backfill contra corrida (`ON CONFLICT DO NOTHING`
  e guarda CAS), reaproveita o `user` retornado por `exchangeCodeForSession`/`verifyOtp`,
  paraleliza as consultas pós-login em `/inicio`, `/minha-conta` e `/painel` e
  mede o fluxo completo no servidor (`measureAuthFlow` / `AUTH_TIMING_LOG=1`)
  sem PII ou credenciais.
- **Processo obrigatório de changelog:** criados `CHANGELOG.md`, `CONTRIBUTING.md`
  e `scripts/changelog-check.mjs` (`npm run check:changelog`), validando que
  entradas adicionadas pela PR estejam dentro de `## [Unreleased]` sob subseção
  válida e encadeado em `.github/workflows/ci.yml` com `fetch-depth: 0`.
- **Marcou Social preservado:** requisitos de produto (feed de profissionais,
  vínculo a serviços reais, Web Share API + alternativas, imagem obrigatória e
  adequada em novos serviços, OCR/bloqueio de telefone/contato/preço em imagens,
  moderação/denúncia, perfil único e acesso ao feed pelo espaço Cliente) e a
  verificação de dependências das Issues `#84`, `#91` e `#93` foram registrados
  em `docs/ROADMAP-MARCOU-SOCIAL.md` sem duplicar issues nem criar arquitetura
  paralela.
- Nenhuma migration foi criada/aplicada em produção e nenhuma configuração remota
  de Google Cloud, Supabase ou Netlify foi alterada.

## Descoberta: taxonomia e áreas — Issue #87 — 23/11/2026

- A migration aditiva `20261123143000_discovery_taxonomy_service_areas.sql`
  cria taxonomia versionada/moderada, modalidades de serviço e áreas por
  cidade, bairro ou raio aproximado; serviços antigos recebem defaults
  compatíveis.
- O painel gerencia áreas e sugestões de categoria sob a flag
  `social_discovery`; a página pública usa uma RPC fail-closed com projeção
  mínima. Rua, número, CEP e coordenadas exatas não fazem parte do schema.
- RLS deriva ownership de `providers.owner_id`; o browser não autoaprova
  categoria, não forja fonte verificada e não remove a última área usada por um
  serviço ativo no local do cliente.
- `scripts/discovery-check.mjs`, encadeado em `npm run test:db`, cobre 40
  invariantes de constraints, concorrência, versionamento, filtros, RLS, grants
  e privacidade. Painel e página pública também foram inspecionados em navegador
  headless a 1440 px e 390 px, sem overflow horizontal ou erro de console.
  Contrato e rollout: `docs/DISCOVERY-TAXONOMY.md`.
- Nenhuma migration foi aplicada remotamente e nenhuma flag/configuração de
  Supabase, Netlify ou produção foi alterada.
- A PR de identidade `#118` foi mesclada em `main` (`920ea06`) e integrada à
  `#119`. Os conflitos em `package.json` e `painel/page.tsx` foram conciliados
  preservando os quatro harnesses DB, o seletor Cliente/Profissional e toda a
  descoberta. Validação local pós-integração: lint, typecheck, 117 testes
  Vitest, DB legado `69/0`, social `47/0`, identidade `28/0` e descoberta
  `40/0`, audit e build aprovados.

## Hardening de funções SECURITY DEFINER — 23/11/2026

- A migration `20261123133000_harden_security_definer_grants.sql` remove o
  `EXECUTE` herdado de `PUBLIC` de todas as funções privilegiadas existentes e
  restabelece grants mínimos por papel.
- Jobs de expiração/lembrete ficam exclusivos de `service_role`; agenda pública
  continua disponível; comandos de booking, notificações, aceite e flags mantêm
  apenas os papéis necessários.
- O harness PostgreSQL agora falha se qualquer função `SECURITY DEFINER` atual ou
  futura conservar grant para `PUBLIC`, além de validar a matriz conhecida e
  chamadas reais dos jobs.
- Contrato e rollback: `docs/SECURITY-DEFINER-GRANTS.md`. Nenhuma migration foi
  aplicada remotamente e nenhum secret/configuração foi alterado.

## Fundação de rollout social — Issue #82 — 23/11/2026

- Migration aditiva `20261123130000_social_rollout_foundation.sql` cria ambiente
  por projeto, sete flags sociais fail-closed e overrides privados por
  conta/provider. A avaliação deriva o ator de `auth.uid()` e valida ownership;
  flag nunca substitui autorização ou RLS.
- Helpers server-side e budgets de paginação ficam em
  `src/server/feature-flags.ts` e `src/lib/social-pagination.ts`.
- `scripts/social-foundation-check.mjs`, encadeado por `npm run test:db`, aplica
  todas as migrations e testa grants, kill switch, ambiente, coortes e
  isolamento entre dois usuários/providers sem alterar o harness de booking.
- Convenções de migration/backfill, ativação, query budgets e rollback estão em
  `docs/FUNDACAO-ROLLOUT-SOCIAL.md`.
- Nenhuma flag foi ativada e nenhuma alteração foi aplicada a Supabase, Netlify
  ou produção.

## Planejamento Marcou Social — 23/11/2026

- O Marcou passa a ter um roadmap para rede social de apresentação de serviços
  integrada ao motor de agendamentos. A Zelora foi usada como referência de
  produto, marketplace, confiança e LGPD; sua stack Firebase/Vite não será
  importada.
- O Marcou permanece como base canônica: Next.js, Supabase Auth/PostgreSQL,
  Storage, RLS e o motor de reservas atual.
- A árvore real no GitHub parte da Issue #72, com 7 epics (#73–#79), 33 leaf
  issues (#80–#112), 6 milestones e subissues nativas. Cada leaf issue planeja
  uma PR principal; PRs vazias não foram abertas.
- Documentos: `docs/DECISAO-ARQUITETURA-MARCOU-SOCIAL.md`,
  `docs/ROADMAP-MARCOU-SOCIAL.md` e
  `docs/PROMPT-AGENTE-MARCOU-SOCIAL.md`.
- Issues legadas relacionadas foram apenas marcadas com
  `initiative:marcou-social`; não tiveram corpo, prioridade ou milestone
  alterados.
- Nenhum código de produto, migration, Supabase remoto, Netlify ou produção foi
  alterado neste planejamento.

## Limpeza de branches já mergeadas — 16/11/2026

O clone local era raso (`main` com 1 commit visível, histórico "grafted"), então o
primeiro passo foi `git fetch --unshallow` e o fetch de todas as heads remotas. Sem
isso, qualquer conclusão sobre "branch mergeada" seria falsa — inclusive `git cherry`
e `git branch --merged` davam resultado enganoso.

Critério aplicado (só apaguei o que era inequívoco):

1. PR em estado `MERGED` **e** tip remoto idêntico ao `headRefOid` da PR (evita apagar
   branch que recebeu commits depois do merge); ou
2. ponteiro da branch idêntico ao da `main` (nenhum commit próprio).

**Removidas — mergeadas:**
- `feat/50-public-booking-experience` — PR #51, squash em `6b778f0`.
- `feat/novo-fluxo-agendamento-calendario` — PR #49, squash em `0f694a1`.
- `fix/booking-idempotency-authorization` — PR #59, squash em `a1d0554`.
- `design/layout-principal` — sem PR; ponteiro igual ao da `main` na época (`b804309`).

**Removidas — superadas** (conteúdo já na `main` por outra via, com autorização do responsável):
- `docs/proxima-etapa-multisservicos-expiracao` — alterava apenas este arquivo, em versão anterior à da `main`.
- `feat/31-quality-hardening` — `docs/QUALITY.md` superado por `docs/QUALITY-AUDIT.md` (PR #42).
- `feat/landing-scroll-motion` — comportamento entregue em `StepsSection` (IntersectionObserver + classe `is-visible`).

**Mantidas — PRs abertas:** #2 `feat/calendario-mobile`, #32 `feat/30-platform-hardening`,
#38 `feat/26-notification-scheduler`, #39 `feat/24-provider-agenda`,
#40 `fix/22-public-booking-redirect`, #41 `fix/security-definer-execute-grants`,
#46 `arena/116298da-marcou`, #48 `feat/customer-account-area`.

**Mantidas — trabalho não integrado:**
- `feat/21-booking-multiple-services` — a migration `supabase/migrations/202611150004_booking_multiple_services.sql` não existe na `main`; é trabalho real da Issue #21.
- `feat/pagina-publica-agendamento` — PR #1 foi fechada **sem** merge.

**Resultado:** de 17 para 11 branches remotas (incluindo `main`). A `main` avançou de
`b804309` para `a1d0554` durante a limpeza (merge da PR #59). Nenhum código, migration,
ambiente remoto, deploy ou configuração foi alterado por esta limpeza.

## Entregas recentes (mergeadas)

### PR #51 — experiência pública: cards de serviços e calendário
- Branch: `feat/50-public-booking-experience` (removida após o merge), baseada na `main` que contém o merge da PR #49.
- Removida a lista lateral redundante; a escolha de serviço ocorre nos cards horizontais no próprio fluxo.
- Cards mostram nome, descrição, duração e preço; há placeholder quando o serviço não possui imagem.
- Ao selecionar uma data, a página conduz a seção **Horários disponíveis** com scroll suave; respeita `prefers-reduced-motion`, mantém a data selecionada visível e usa `scroll-margin-top`.
- O calendário continua consultando disponibilidade real e a reserva segue usando a ação de backend já existente.
- O contrato atual permite um serviço por reserva. Seleção múltipla e duração combinada permanecem na Issue #21; a interface não simula suporte inexistente.
- CI do commit final da PR #51 (run `43815526621`): lint, typecheck, testes, testes de banco e build concluídos com sucesso.
- Nenhuma migration foi criada/aplicada e nenhum ambiente remoto/produção foi alterado.
- Pendências desmembradas: #52 (imagem de serviço), #53 (foto do profissional), #54 (edição de perfil, URL e QR Code), #55 (auditoria/remoção do campo de intervalo). A Issue #21 continua responsável pelo motor multi-serviço; a #22 continua aberta para critérios restantes do fluxo público.
- PR #51 foi mergeada em `main` em 16/11/2026 por squash; commit integrado `6b778f00a642248ebf56c1e66fa8981cc71f1437`.

### PR #49 — calendário e novo fluxo de agendamento
- Branch: `feat/novo-fluxo-agendamento-calendario` (removida após o merge), mergeada por squash em `0f694a1`.
- Evolução do seletor de data/horário e do fluxo público de agendamento.
- Barra de navegação preparada com os ícones do pack em `public/icons/navigation/`.
- Campo de endereço público (slug) converte letras para minúsculas durante a digitação e normaliza no servidor antes de salvar.
- Campo de fuso horário removido da interface do painel. O fuso continua no backend, com padrão `America/Sao_Paulo`, pois é necessário para calcular disponibilidade e horários corretamente.
- Campo opcional “Frase de impacto” adicionado ao cadastro do negócio; limite de 180 caracteres. A descrição é salva e exibida na página pública.
- Migration pendente de aplicação no Supabase: `supabase/migrations/202611160001_provider_description.sql`.
- Hospedagem e deploy do projeto: Netlify. Manter documentação, instruções e arquivos de configuração de deploy alinhados exclusivamente a esse provedor.

## Já concluído e integrado à main
- Autenticação e perfil (PR #33), incluindo callback OAuth/PKCE, recuperação de senha e dados de perfil.
- Auditoria e correções de qualidade da Issue #31.
- Autorização antes de reproduzir operações de agendamento (PR #59, squash em `a1d0554`).
- Melhorias de disponibilidade/calendário resiliente já integradas anteriormente.
- Infraestrutura da aplicação: Next.js, Supabase e deploy pela Netlify.

## Próximos passos
1. Aplicar a migration pendente `supabase/migrations/202611160001_provider_description.sql` no Supabase e validar o fluxo real na Netlify.
2. Retomar o motor multi-serviço (Issue #21) na branch `feat/21-booking-multiple-services`, cuja migration `202611150004` ainda não está na `main`.
3. Fechar os critérios restantes da Issue #22 (PR #40, `fix/22-public-booking-redirect`).
4. Revisar as PRs abertas de hardening (#32, #38, #39, #41) e decidir o descarte definitivo da branch `feat/pagina-publica-agendamento` (PR #1 fechada sem merge).
5. Em cada entrega: aguardar o GitHub Actions executar lint, typecheck, testes e build, e só declarar validação com resultado real.

## Regras para agentes
- Trabalhar na branch/issue atribuída; não sobrescrever trabalho de outras branches.
- Não alterar produção, Supabase remoto ou configurações externas sem autorização explícita.
- Não remover funcionalidades existentes fora do escopo.
- Antes de encerrar, registrar aqui apenas mudanças relevantes, testes realmente executados e pendências atuais.
