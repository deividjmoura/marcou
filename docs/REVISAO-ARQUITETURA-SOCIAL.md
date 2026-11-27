# Revisão e consolidação da arquitetura social — Marcou

**Data:** 27/11/2026
**Status:** revisão documental concluída; nenhuma alteração de código, rotas, migrations, RLS, Supabase, Netlify ou produção.
**Base auditada:** `main` em `69d02173653384e082476e7879ee9f33672dec72` (merge da PR #40), issues #72–#112 inspecionadas em 27/11/2026, PRs abertas conferidas quanto a conflito de documentos.
**Documentos alimentados por esta revisão:** [DECISAO-ARQUITETURA-MARCOU-SOCIAL.md](DECISAO-ARQUITETURA-MARCOU-SOCIAL.md), [ROADMAP-MARCOU-SOCIAL.md](ROADMAP-MARCOU-SOCIAL.md), [CONTRATO-DOMINIO-MARCOU-SOCIAL.md](CONTRATO-DOMINIO-MARCOU-SOCIAL.md), [PROMPT-AGENTE-MARCOU-SOCIAL.md](PROMPT-AGENTE-MARCOU-SOCIAL.md), [ESCOPO-E-ARQUITETURA.md](ESCOPO-E-ARQUITETURA.md).

---

## 1. Diagnóstico da arquitetura atual (verificado, não presumido)

O Marcou **já é uma plataforma única**. Não existe hoje — em código, deploy ou
documentação operacional — criação de site individual, subdomínio, hospedagem ou
aplicação separada por profissional. Os pontos verificados:

**Aplicação e rotas (Next.js App Router, `src/app/`):**
- Uma única aplicação, um único domínio em produção (`https://marcoou.netlify.app`),
  deploy Netlify, sem subdomínios por profissional no `next.config.ts` (sem
  rewrites/domínios customizados).
- Perfil público profissional implementado como **rota interna** `/p/[slug]`
  (`src/app/p/[slug]/page.tsx`): cabeçalho público, áreas de atendimento,
  widget de agendamento com disponibilidade real e Server Actions.
- Rotas estáticas existentes no primeiro nível: `/`, `/login`, `/cadastro`,
  `/esqueci-senha`, `/redefinir-senha`, `/perfil`, `/inicio`, `/minha-conta`,
  `/meus-agendamentos`, `/notificacoes`, `/painel`, `/consentimento`,
  `/reserva/[id]`, `/p/[slug]`, `/auth/callback`, `/auth/confirm`,
  `/documentos`, `/termos`, `/privacidade`, `/diretrizes-da-comunidade`,
  `/politica-de-conteudo-e-avaliacoes`. Não há middleware nem rota catch-all.
- O painel do prestador referencia `/p/{slug}` como atalho público
  (`painel-client.tsx`) e invalida cache com `revalidatePath("/p/{slug}")`;
  o redirecionamento pós-login preserva origem via `safeNextPath("/p/{slug}?…")`.

**Dados e autoridade (Supabase Auth + PostgreSQL + RLS):**
- `profiles.id` = `auth.users.id`, RLS apenas para a própria linha — **não é
  pública e não deve se tornar**; telefone de conta permanece privado.
- `providers` é a identidade profissional: `owner_id UNIQUE` (um provider por
  conta), `slug UNIQUE` com `CHECK slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'`,
  `is_published` como publicação atual e `description` (migration
  `202611160001`). Leitura pública por linha apenas para publicados.
- `services` é a fonte de verdade do catálogo (preço, duração, sinal, buffer);
  leitura pública apenas para serviços ativos de providers publicados.
- Motor de reservas atual é a única autoridade de disponibilidade/concorrência:
  constraint GiST semiaberta, RPCs de criação/transição, snapshots
  (`*_snapshot`), expiração por rotina autorizada, `booking_events` como
  auditoria; nenhuma política de escrita direta de cliente em `bookings`.
- Fundação social já aplicada por migrations aditivas: feature flags
  fail-closed (`20261123130000`, avaliação derivada de `auth.uid()`), papéis
  combináveis/`account_preferences` (`20261123140000`) e taxonomia de
  descoberta (`20261123143000`) com RPC pública
  `get_public_provider_discovery(slug)` — projeção mínima, `SECURITY DEFINER`,
  gated pela flag `social_discovery`, sem UUID interno, endereço, CEP ou
  coordenada.

**Issues e planejamento (GitHub, inspecionado em 27/11/2026):**
- Fechadas: #80 (ADR/roadmap), #81 (contrato de domínio), #82 (flags/RLS
  baseline), #87 (taxonomia/modalidades/áreas), #106 (políticas versionadas).
- Abertas e coerentes com a direção social: #83 (papéis combináveis, handle
  público com nomes reservados), #84 (pipeline de mídia), #85 (portfólio),
  #86 (“Transformar `/p/[slug]` em vitrine social do profissional sem
  interromper o CTA de agendamento”), #88 (busca indexada), #89 (Explorar com
  SEO/OG/canonical), #90–#95 (grafo social, posts, feed), #96 (notificações
  sociais), #97 (modalidades/orçamento), #98 (solicitações/propostas), #99
  (CTA social → motor real), #100/#101 (conversas), #102 (avaliações
  verificadas), #103–#108 (confiança/moderação/admin), #109–#112 (operação e
  beta).

**Conclusão do diagnóstico:** a arquitetura existente já realiza “plataforma
única + perfil público interno + motor de reservas único”. O roadmap não está
desatualizado; as lacunas reais são de **explicitação e blindagem documental**
(nada registra a decisão de URL canônica nem proíbe, como princípio vinculante,
site independente por profissional), não de novo desenho.

## 2. Diferenças entre o que já está documentado e a nova definição de produto

| # | Direção de produto definida | Estado documental encontrado | Lacuna real |
|---|---|---|---|
| 1 | Plataforma única: um domínio, uma aplicação, uma auth, uma identidade visual, um banco | ADR §2 fixa “Marcou é canônico” e veta Firebase/API paralela; contrato §0 invariantes 1–4 | “Nunca site/subdomínio/hospedagem independente por profissional” não constava como decisão vinculante explícita (o veto de “segunda identidade de domínio” do ADR referia-se à stack Zelora) |
| 2 | Perfil público é rota interna com slug | Contrato §2.2 trata `providers.slug` como allowlist pública; issue #86 declara transformar `/p/[slug]` em vitrine | A convenção de URL canônica do perfil não estava decidida em nenhum documento; risco de um agente futuro inventar `/{slug}` ou rota paralela |
| 3 | Visitante navega conteúdo público sem criar conta; ações privadas exigem auth | ADR §3.1 (ator Visitante) e contrato §5 (coluna Visitante da matriz) já cobrem | Espalhado em dois documentos; consolidado como princípio no ADR (§2) |
| 4 | Descoberta por feed, pesquisa, categorias, região, serviços, recomendações | Roadmap M1/M2 (#88, #89, #94, #95) e #87 concluído | Nenhuma lacuna de arquitetura; apenas nota de que recomendação/relações sociais são sinais futuros de ranking, sem algoritmo de ML no beta (§12 do roadmap já adia) |
| 5 | Conversão: Descoberta → Perfil → Serviço → Disponibilidade → Agendamento; orçamento via Solicitação → Proposta → motor | ADR §5.1/§5.2 e contrato §4.2/§8 já descrevem exatamente esse caminho, sem motor paralelo | Nenhuma lacuna real |
| 6 | Preservar Supabase Auth, `profiles.id`, `providers`, `providers.slug`, `services`, motor, RLS, flags | Tudo já vinculado no ADR §2/§4, roadmap §6.5 e contrato §0/§2/§10–§11 | Nenhuma lacuna |
| 7 | Critérios de aceite das issues coerentes com a direção | #86/#89/#99 têm critérios bons, mas não fixam a URL canônica nem o princípio “rota interna, não site separado” | Ajuste recomendado nos corpos das issues (lista na seção 6) |

Nenhum documento exigia reescrita; todas as alterações desta PR são aditivas e
preservam o histórico das decisões anteriores (PR #113 / issues #80–#82).

## 3. Recomendação definitiva: identidade e perfil público

1. **Supabase Auth continua sendo a única identidade.** `profiles.id` associado
   a `auth.users.id` permanece privado (RLS por linha própria) e **não** se
   torna tabela pública. Dados privados de conta (telefone, e-mail) jamais
   entram em projeções públicas.
2. **`providers` permanece a identidade profissional e a origem dos campos
   públicos**, com `is_published` controlando a projeção e a allowlist definida
   pelo contrato de domínio (§2.2/§2.3). O perfil social (#83/#86) evolui
   `providers` por migration aditiva — não cria entidade concorrente.
3. **`providers.slug` é o identificador público**, sujeito às regras existentes
   (`UNIQUE`, `CHECK` de formato, normalização 3–48 minúsculas no
   `providerInputSchema`, nomes reservados em #83). Nenhuma nova convenção de
   identificador é introduzida.
4. **O perfil público é uma superfície da rede social dentro da aplicação**
   (evolução da rota `/p/[slug]` pela #86), compartilhando layout, identidade
   visual, navegação e infraestrutura com o restante da plataforma. Deve
   permitir: identificação pública, foto/capa (via #84), apresentação, serviços
   (`services`), portfólio (#85), publicações (#91), seguidores/interações
   permitidas (#92/#93), avaliações elegíveis (#102), localização aproximada e
   modalidades (já implementadas pela RPC de descoberta), acesso à
   disponibilidade/agendamento (widget atual) e compartilhamento da URL pública
   (#93).
5. **Visitante sem conta** navega conteúdo público permitido; seguir, salvar,
   comentar, solicitar e agendar exigem a autenticação e as permissões
   existentes, que não são relaxadas.
6. **Nenhum motor de agendamento paralelo**: solicitações sob orçamento (#98)
   convertem em reserva somente pelo motor atual, conforme contrato §4.2/§8.
7. **`providers.owner_id UNIQUE` não é relaxado** e não se introduz múltiplos
   profissionais por conta sem decisão específica e análise de impacto (item já
   registrado como decisão aberta no contrato §11, responsável #83).

## 4. Recomendação de URL interna para o perfil público

**Recomendação: manter `/p/[slug]` como rota canônica do perfil público** —
é o que já está implementado e integrado ponta a ponta.

| Opção | Avaliação | Decisão |
|---|---|---|
| `/p/[slug]` (atual) | Zero conflito de namespace (as ~20 rotas estáticas de primeiro nível permanecem intocadas); já integrada a Server Actions, `revalidatePath`, atalhos do painel, `safeNextPath` pós-login e RPCs keyed por slug; curta para compartilhamento/QR/WhatsApp; o SEO mora no slug (`ana-beleza`), com metadata/OG pela #89 | **Canônica** |
| `/{slug}` | Rota dinâmica na raiz dividiria namespace com todas as rotas estáticas e com toda rota futura; exigiria middleware + registro de slugs reservados + guarda permanente; um novo recurso de primeiro nível poderia colidir com um slug existente e quebrar URL pública de profissional | Rejeitada |
| `/@{slug}` | App Router reserva pastas iniciadas por `@` para parallel routes; só seria possível via rewrite em middleware, adicionando peça móvel e risco de conteúdo duplicado. Adiável **apenas como alias de vaidade** futuro, com rewrite interno para `/p/{slug}` e `rel=canonical` apontando para `/p/{slug}` (nunca segunda URL canônica) | Adiada (alias opcional, não canônica) |
| `/profissional/{slug}` | Viável e explícita, mas redundante frente à rota existente; mudar agora criaria superfície de redirecionamento para todos os deep links `/p/{slug}?service=…&date=…&slot=…` do fluxo de reserva | Adiada; reabrir só com evidência de produto/SEO, como novo canônico + 301/308 de `/p/{slug}` preservando query |

Regras complementares documentadas no ADR (nova seção 3.3): nenhuma
implementação de rota nesta tarefa; qualquer alias futuro deve reescrever para
a rota canônica sem criar segunda URL canônica; o exemplo conceitual
`marcou.com/@ana-beleza` é apenas ilustração de rota interna, não definição de
domínio (o domínio definitivo não é escolhido nesta tarefa).

## 5. Fluxo completo de descoberta até agendamento

Descoberta → Publicação ou perfil → Serviço → Disponibilidade → Agendamento
(orçamento: → Solicitação → Proposta → Conversão pelo motor).

1. **Descoberta** (visitante ou cliente autenticado): feed (#94/#95, flag
   `social_feed` a partir de `/inicio`), Explorar/pesquisa (#88/#89),
   categorias e especialidades (#87, concluído), região aproximada
   (`provider_service_areas`), serviços (`services`), publicações (#91) e,
   no futuro, recomendações/relações sociais (#92/#93 como sinais). Tudo sob
   flags fail-closed.
2. **Publicação ou perfil**: destino sempre em rotas internas — perfil
   `/p/{slug}` (#86) e permalink de post (#91). Nenhum destino externo.
3. **Serviço**: catálogo lido de `services` (fonte de verdade); CTA contextual
   (#99) não aceita preço/duração/prestador do navegador.
4. **Disponibilidade**: consulta de slots reais pelo motor
   (`getAvailableSlots` → RPC), nunca simulada na interface.
5. **Agendamento**: Server Action → `createBooking` (RPC com checagem de
   conflito atômica, hold com expiração e snapshot); login preserva origem via
   `safeNextPath` (implementado); confirmação pelo fluxo existente
   (`/reserva/[id]`), comprovante e validação do sinal como hoje.
6. **Orçamento**: serviço sob orçamento (#97) não simula slots; solicitação
   (#98) → proposta/contraproposta auditável → conversão transacional em
   reserva pelo motor quando suportada (contrato §4.2), sem estado de booking
   paralelo.
7. **Pós-contratação**: notificações (#26/#96), avaliações só com contratação
   elegível (#102) e métricas de funil (#109).

## 6. Arquivos e Issues que precisam de ajustes

**Arquivos alterados nesta PR (todos documentais):**

| Arquivo | Ajuste | Motivo |
|---|---|---|
| `docs/DECISAO-ARQUITETURA-MARCOU-SOCIAL.md` | Nota de revisão; §2 com “plataforma única” e “visitante sem conta”; nova §3.3 (perfil interno + URL canônica); §10 com alternativas rejeitadas | Formalizar a decisão de produto ausente |
| `docs/CONTRATO-DOMINIO-MARCOU-SOCIAL.md` | §1.1 (glossário do provider) e §2.3 (regra de consulta pública) | Fixar `/p/{slug}` canônica no contrato técnico |
| `docs/ROADMAP-MARCOU-SOCIAL.md` | Data de atualização; nova linha em §6.5 | Rastrear o requisito de produto nas entregas M1 |
| `docs/PROMPT-AGENTE-MARCOU-SOCIAL.md` | Novo bullet em “Decisões já tomadas” | Blindar agentes futuros contra site independente/rota raiz |
| `docs/ESCOPO-E-ARQUITETURA.md` | Parágrafo de cross-reference | Coerência para quem lê primeiro o documento do MVP |
| `docs/REVISAO-ARQUITETURA-SOCIAL.md` | **Novo** (este arquivo) | Registro datado e auditável da consolidação |
| `CHANGELOG.md` | Entrada em `[Unreleased]` | Processo obrigatório do repositório |

**Arquivo deliberadamente NÃO alterado:** `AGENT_TASK_MARCOU.md`. Ele não contém
instrução conflitante e está sendo modificado simultaneamente pelas PRs abertas
#2, #32, #41, #46, #67, #126 e #131; editar aqui criaria conflito trivial com
sete PRs. A continuidade desta tarefa fica registrada no JSON de coordenação
(`coordination/agents`) e neste documento.

**Issues com critérios de aceite a esclarecer** (sugestão de acréscimo ao
corpo; edição dos corpos fica como pendência de aprovação do responsável, para
não sobrescrever trabalho de outros agentes):

- **#86 (Perfil profissional social):** acrescentar — “A vitrine permanece na
  rota canônica `/p/[slug]` da aplicação única, sem site, subdomínio ou
  hospedagem independente por profissional; ao despublicar/ocultar, a projeção
  pública deixa de existir imediatamente (404/projeção vazia), inclusive em
  caches (`revalidatePath`); metadata/OG somente com campos da allowlist
  pública.”
- **#89 (Explorar/Buscar):** acrescentar — “Perfis públicos usam
  `/p/{slug}` como URL canônica (`rel=canonical`); consultas privadas com
  `noindex` já previstas permanecem; nenhum alias cria segunda URL canônica.”
- **#99 (CTA social → booking):** acrescentar — “Deep links de CTA mantêm o
  formato `/p/{slug}?service=…&date=…&slot=…` e passam por `safeNextPath`
  (sem open redirect); nenhuma superfície social cria reserva fora das RPCs do
  motor.”
- **#83 (Identidade social):** critério de nomes reservados já existente deve
  citar explicitamente, quando o handle for exibido em URL, que a rota é
  `/p/{handle}` — sem nova convenção de identificador.

## 7. Matriz de compatibilidade com a implementação atual

| Capacidade da arquitetura social | Estado na `main` `69d0217` | Compatível? | Issue proprietária |
|---|---|---|---|
| Plataforma única, um domínio/aplicação | Next.js único + Netlify, sem subdomínios | Sim, já vigente | — |
| Perfil público como rota interna | `/p/[slug]` implementada | Sim | #86 |
| Identidade Supabase Auth única | `profiles.id = auth.users.id`, RLS própria linha | Sim | #83 (evolução aditiva) |
| `providers.slug` identificador público | `UNIQUE` + `CHECK` de formato + normalização no schema Zod | Sim | #83/#86 |
| Projeção pública por allowlist | RLS por linha (providers/services publicados) + RPC `get_public_provider_discovery` mínima | Sim, com caveat do `availability_exceptions.note` já documentado no contrato §2.3 | #86/#88 |
| Descoberta por categoria/modalidade/área | Migration #87 aplicada, flag `social_discovery` | Sim | #88/#89 |
| Busca indexada/ranking | Não implementada | Prevista no roadmap | #88 |
| Feed/grafo social/posts | Não implementados; flags fail-closed prontas | Sim | #90–#95 |
| Mídia/portfólio | Não implementado | Sim | #84/#85 |
| CTA social → booking preservando origem | `safeNextPath` + `/p/{slug}?service=…` existentes | Sim | #99 |
| Motor de reservas único | RPCs, GiST, snapshots, expiração | Sim; nenhuma alteração | — |
| Solicitações/orçamento | Não implementado; contrato §4.2 fixa conversão pelo motor | Sim | #97/#98 |
| Avaliações elegíveis | Não implementado; default seguro é não habilitar | Sim | #102 |
| Compartilhamento da URL pública | Não implementado; Web Share + link canônico planejados | Sim | #93 |
| Moderação/confiança/LGPD | Não implementados | Sim | #103–#108 |
| Visitante sem conta vê conteúdo público | Leitura pública por linha para publicados | Sim | #86/#89 |

## 8. Riscos de segurança, privacidade, SEO e migração

**Segurança**
- *Namespace de rotas:* a decisão contra `/{slug}` elimina a classe de risco de
  colisão slug↔rota e de shadowing por middleware. Qualquer alias futuro via
  middleware deve rejeitar slugs que colidam com rotas existentes.
- *Enumeração/scraping de perfis:* manter cursor/limites (#88) e rate limit
  (#104); não expor UUIDs internos em projeções públicas (já observado pela RPC
  de descoberta).
- *Metadata/OG:* só campos da allowlist podem entrar em Open Graph/JSON-LD;
  nunca `profiles.phone` ou endereço.
- *Cache/invalidação:* despublicar/ocultar precisa invalidar `/p/{slug}`
  imediatamente (padrão `revalidatePath` já usado no painel), inclusive para
  censura/moderação (#105).

**Privacidade**
- `profiles` permanece privada; projeções públicas por allowlist apenas
  (contrato §2.2/§2.3). `availability_exceptions.note` continua tratado como
  público até existir projeção de coluna — não gravar PII ali.
- Localização pública permanece cidade/bairro/raio aproximado (migration #87
  já não armazena rua/número/CEP/coordenada).
- OCR/validação de mídia (#104) bloqueia telefone/contato/preço em imagens
  antes da publicação.

**SEO**
- URL canônica única `/p/{slug}` evita conteúdo duplicado; `noindex` para
  consultas privadas (#89); sitemap de perfis públicos é acréscimo natural da
  #89 (não implementado nesta tarefa).
- Domínio definitivo fica fora do escopo; produção segue
  `https://marcoou.netlify.app` e nenhuma mudança de domínio/subdomínio é
  proposta.

**Migração**
- Renomear slug hoje quebra links antigos (404). Histórico de slugs com
  redirecionamento 301/308 é melhoria futura que exige tabela/decisão própria —
  registrada como pendência, não implementada.
- Nenhuma migration é criada nesta tarefa; toda evolução de schema segue o
  roadmap (#83 e seguintes) por migrations aditivas com rollback.

## 9. Sequência recomendada de implementação

A árvore existente é suficiente — **nenhuma nova issue, epic ou milestone é
criada**. A sequência vigente do roadmap permanece, com três reforços:

1. **Agora (esta PR):** consolidar decisões documentais (ADR §2/§3.3/§10,
   contrato, roadmap §6.5, prompt de agentes, este registro) e submeter a PR
   documental para revisão. Pendência: aplicar os acréscimos de critérios de
   aceite nas issues #86/#89/#99/#83 após aprovação do responsável.
2. **M1:** #83 → #84 → #85 → #86 (a vitrine `/p/[slug]` herda a decisão de URL
   canônica desta revisão); #88/#89 já podem ser preparados após #83/#86/#87
   (concluída).
3. **M2→M5:** seguem como documentados (#90–#95 feed; #97–#99 conversão; #100–#102
   conversas/reputação; #103–#107 confiança/LGPD; #108–#112 operação/beta),
   preservando o motor de reservas como única autoridade e as flags fail-closed
   como mecanismo de rollout/kill switch.

## 10. Critérios de aceite para validar a arquitetura

A consolidação é considerada válida quando, sem flags sociais ligadas e sem
alterar o motor:

1. Um visitante **sem conta** abre `/p/{slug}` de um provider publicado e vê
   apenas dados da allowlist pública; o HTML/fonte/metadata não contêm
   telefone, endereço completo, e-mail, dados de conta ou UUIDs sensíveis.
2. Provider não publicado ou oculto/removido/moderado não produz projeção
   pública em `/p/{slug}` nem na RPC de descoberta (404/projeção vazia),
   inclusive após invalidação de cache.
3. `/p/{slug}` é servida pela mesma aplicação Next.js, domínio, layout e
   autenticação do restante da plataforma; **não** existe site, subdomínio,
   hospedagem, aplicação, API ou motor de agendamento independente por
   profissional em código, config ou deploy.
4. O agendamento iniciado no perfil continua criando reserva exclusivamente
   pelas RPCs do motor (concorrência impede dupla marcação; snapshot e
   expiração preservados) e o login preserva origem/serviço via `safeNextPath`
   sem open redirect.
5. As consultas públicas continuam retornando seleção explícita de campos
   (nunca `SELECT *` como contrato social) e passam nos testes negativos
   multi-tenant de `npm run test:db`.
6. Toda superfície social nova (busca, feed, CTA) nasce atrás de feature flag
   fail-closed, com kill switch que desliga a superfície sem apagar dados nem
   impedir reservas.
7. A documentação (ADR, contrato, roadmap, prompt de agentes) permanece
   coerente entre si sobre: identidade única, `providers.slug` como
   identificador público, `/p/{slug}` canônica e conversão pelo motor único —
   sem segunda fonte de verdade para preço, duração, disponibilidade, estado ou
   contadores.

## 11. Verificações realizadas nesta revisão

- Leitura integral dos seis documentos exigidos + `PROMPT-AGENTE-MARCOU-SOCIAL.md`,
  `CHANGELOG.md`, `CONTRIBUTING.md` e `scripts/changelog-check.mjs`.
- Inspeção de rotas (`src/app/**`), Server Actions de `/p/[slug]`, painel,
  `src/server/{bookings,discovery,identity,services}.ts`, validações
  (`src/lib/validation.ts`) e todas as 11 migrations em `supabase/migrations/`.
- Issues #72–#112 listadas com estado; corpos de #83, #86, #88, #89, #95 e #99
  lidos integralmente; #80/#81/#82/#87/#106 confirmadas fechadas.
- PRs abertas (#2, #32, #38, #39, #41, #46, #67, #68, #71, #124, #126, #127,
  #128, #130, #131) conferidas quanto a arquivos tocados: nenhum conflito com
  os documentos alterados nesta PR; `AGENT_TASK_MARCOU.md` evitado por
  concorrência.
- `git diff --check` e revisão manual do diff; nenhuma validação de runtime era
  aplicável (mudança exclusivamente documental, sem código executável).
