# Marcou — estado atual e continuidade

Última atualização: 23/11/2026

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
