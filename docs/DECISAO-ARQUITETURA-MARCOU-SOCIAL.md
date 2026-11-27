# Decisão de arquitetura — Marcou Social

**Status:** aceita para planejamento e implementação incremental
**Data:** 23/11/2026
**Revisada em:** 27/11/2026 — consolidação “plataforma única, perfil público
interno” (decisões de URL e superfície de perfil em §2, §3.3 e §10; detalhes em
[REVISAO-ARQUITETURA-SOCIAL.md](REVISAO-ARQUITETURA-SOCIAL.md)). As decisões
anteriores desta ADR permanecem válidas.
**Issue principal:** [#72 — Rede social de serviços integrada ao agendamento](https://github.com/deividjmoura/marcou/issues/72)
**Issue desta decisão:** [#80](https://github.com/deividjmoura/marcou/issues/80)

## 1. Contexto

A direção de produto passa a combinar duas propostas:

1. **Marcou:** catálogo público, disponibilidade e motor de reservas já
   implementados com proteção contra conflito, idempotência, histórico e RLS.
2. **Zelora:** visão de marketplace social para profissionais de serviços, com
   perfis, descoberta, portfólio, solicitações, chat, reputação, confiança,
   moderação e cuidados de privacidade/LGPD.

Os repositórios não estão no mesmo estágio nem usam a mesma stack:

| Base | Estado útil | Stack |
|---|---|---|
| Marcou | aplicação Next.js com autenticação Supabase, perfis, serviços, disponibilidade, reservas, notificações, migrations e testes de domínio/DB | Next.js 16, React 19, TypeScript, Supabase Auth/PostgreSQL/Storage |
| Zelora | documentação de produto/legal e fundação mínima de identidade; não possui os módulos sociais ou de contratação implementados | React/Vite, API Node, PostgreSQL, Firebase Auth |

Uma fusão literal introduziria duas autoridades de autenticação, dois frontends e
camadas de backend concorrentes sem trazer funcionalidades sociais prontas.

## 2. Decisão

O **Marcou é a aplicação e a arquitetura canônicas**. Serão incorporados os
conceitos de produto, segurança e operação úteis da Zelora, não a sua base de
código.

Decisões vinculantes:

- manter Next.js App Router, Supabase Auth, PostgreSQL, Storage e RLS;
- evoluir as tabelas e operações atuais por migrations aditivas e testadas;
- manter o motor de reservas como única autoridade para disponibilidade,
  duração, preço capturado, ocupação e estado de agendamento;
- adicionar a rede social por módulos e feature flags, sem interromper o fluxo
  de reserva existente;
- adotar uma experiência social **centrada em serviços**: conteúdo e relações
  devem levar a um perfil, serviço, solicitação ou agendamento legítimo;
- operar o beta com publicação profissional. Clientes podem descobrir, seguir,
  curtir, comentar, salvar, compartilhar, conversar e contratar. Publicação
  pública irrestrita por clientes só entra após decisão explícita de produto e
  segurança;
- operar **uma única plataforma**: um domínio principal, uma aplicação Next.js,
  uma autenticação centralizada, uma identidade visual, um banco de dados e uma
  autoridade de domínio. O perfil público de cada profissional é uma **rota
  interna da própria aplicação** (canonicamente `/p/{slug}`), acessível por
  descoberta, pesquisa e compartilhamento — nunca um site, subdomínio,
  hospedagem ou aplicação independente por profissional;
- permitir que o visitante conheça profissionais e navegue conteúdo público
  permitido **sem criar conta**; ações privadas (seguir, salvar, comentar,
  solicitar, agendar) continuam exigindo a autenticação e as permissões
  existentes, sem relaxamento;
- não criar uma segunda identidade de domínio, sites/subdomínios individuais
  por profissional nem integrar Firebase ao Marcou.

## 3. Proposta de produto

### 3.1 Atores

- **Visitante:** vê somente perfis, serviços, portfólios, posts e avaliações
  publicados; pode buscar e compartilhar links públicos.
- **Cliente autenticado:** mantém dados privados, segue profissionais, interage,
  salva, solicita orçamento, agenda, conversa em contexto autorizado e avalia
  contratações elegíveis.
- **Profissional:** possui todos os recursos de cliente e também administra um
  perfil público, serviços, áreas de atendimento, portfólio, posts,
  disponibilidade, solicitações e agenda.
- **Administrador/moderador:** atua por permissões explícitas, com menor
  privilégio e auditoria; nunca recebe poder apenas por parâmetro do navegador.

A mesma conta pode acumular os papéis de cliente e profissional. O papel não é
confiado ao cliente e não exige duplicar a identidade Supabase.

### 3.2 Experiência social completa, mas orientada à contratação

O escopo inclui:

- perfil público e portfólio profissional;
- busca e descoberta por categoria, região aproximada, modalidade, preço,
  disponibilidade e reputação;
- posts com texto/mídia e vínculo opcional a um serviço próprio;
- seguir/deixar de seguir, curtidas, comentários, salvos e compartilhamento;
- feed paginado com ranking inicial simples, determinístico e documentado;
- notificações sociais agrupadas e configuráveis;
- bloqueio, silêncio, denúncia, antispam e moderação;
- CTA contextual para agendamento direto ou solicitação de orçamento;
- conversas vinculadas a solicitação ou reserva;
- avaliações verificadas após contratação elegível.

A contagem de seguidores ou curtidas nunca substitui uma avaliação verificada.
Nenhum selo deve sugerir verificação que não tenha realmente ocorrido.

### 3.3 Perfil público interno e URL canônica

O perfil público do profissional é uma superfície da rede social **dentro da
aplicação Marcou** (evolução da rota atual `/p/[slug]` pela
[#86](https://github.com/deividjmoura/marcou/issues/86)), compartilhando
layout, identidade visual, navegação e infraestrutura com o restante da
plataforma. Ele identifica o profissional, exibe foto/apresentação, serviços,
portfólio, publicações, seguidores e interações permitidas, avaliações
elegíveis, localização aproximada e modalidades, e dá acesso à disponibilidade
e ao agendamento pelo motor existente.

**URL canônica: `/p/{slug}`**, onde `slug` é `providers.slug`, sujeito às
regras de validação e unicidade existentes. Alternativas avaliadas na revisão
de 27/11/2026 ([REVISAO-ARQUITETURA-SOCIAL.md](REVISAO-ARQUITETURA-SOCIAL.md)):

| Opção | Resultado |
|---|---|
| `/p/{slug}` | **Canônica.** Zero conflito com as rotas estáticas do App Router; já integrada a Server Actions, `revalidatePath`, painel e redirecionamento pós-login; curta para compartilhamento; SEO concentrado no slug + metadata da #89 |
| `/{slug}` | **Rejeitada.** Rota dinâmica na raiz dividiria namespace com todas as rotas estáticas e futuras, exigindo middleware, registro de slugs reservados e guarda permanente contra colisão |
| `/@{slug}` | **Adiada como alias opcional.** Pastas iniciadas por `@` são slots de parallel routes no App Router; só seria possível via rewrite em middleware. Se algum dia for implementada, reescreve internamente para `/p/{slug}` e nunca cria segunda URL canônica (`rel=canonical` permanece em `/p/{slug}`) |
| `/profissional/{slug}` | **Adiada.** Viável, mas redundante; mudar agora criaria superfície de redirecionamento para todos os deep links `/p/{slug}?service=…` do fluxo de reserva. Reabrir só com evidência de produto/SEO, como novo canônico + redirect 301/308 preservando query |

Nenhuma rota é implementada por esta decisão; ela orienta as issues existentes
(#86, #89, #93, #99). O exemplo conceitual `marcou.com/@ana-beleza` é apenas
uma ilustração de rota interna da plataforma e não define domínio: o endereço
de produção vigente é `https://marcoou.netlify.app` e a escolha do domínio
definitivo não é objeto desta ADR.

## 4. Limites dos domínios

| Domínio | Fonte de verdade | Responsabilidade |
|---|---|---|
| Identidade | Supabase Auth + `profiles` | sessão, dados privados mínimos e papéis autorizados |
| Identidade profissional | evolução de `providers` | nome/handle público, publicação, bio, região aproximada e configurações do negócio |
| Catálogo | `services` e taxonomia futura | descrição, modalidade, preço, duração, sinal e elegibilidade para reserva/orçamento |
| Mídia/portfólio | Supabase Storage + metadados PostgreSQL | ownership, tipo, tamanho, variantes, alt text, ordem e estado de publicação |
| Social | posts, follows, reactions, comments e saves futuros | conteúdo, relações, visibilidade, contadores consistentes e moderação |
| Descoberta | consultas/indexes PostgreSQL | busca, filtros, ranking inicial e paginação por cursor |
| Solicitações | domínio futuro de requests/proposals | negociação auditável para serviço sem preço ou horário fechado |
| Agendamentos | `bookings`, RPCs e eventos atuais/evoluídos | disponibilidade, concorrência, snapshot, estados e histórico |
| Conversas | conversations/messages futuros | comunicação privada somente entre participantes autorizados |
| Reputação | reviews futuros + booking elegível | avaliação mútua, resposta, contestação e agregados |
| Confiança | blocks, reports, moderation cases e audit log futuros | enforcement, triagem, sanções, recurso e auditoria |
| Notificações | infraestrutura atual evoluída | inbox, agrupamento, preferências, deep links e entrega idempotente |

Os nomes físicos finais e contratos detalhados serão fechados na
[#81](https://github.com/deividjmoura/marcou/issues/81). Esta decisão define as
responsabilidades, não antecipa uma migration.

## 5. Fluxos verticais

### 5.1 Descoberta até agendamento direto

1. Profissional publica perfil e serviço agendável.
2. Publica portfólio ou post associado ao próprio serviço.
3. Cliente encontra o conteúdo por perfil, busca ou feed.
4. CTA preserva a origem e o serviço durante login/navegação.
5. O widget consulta disponibilidade real.
6. A operação segura do backend cria a reserva; feed, post ou navegador não
   informam preço, duração, prestador ou status como autoridade.
7. Notificações e métricas derivam do evento confirmado.

### 5.2 Descoberta até orçamento

1. Serviço marcado como “sob orçamento” não simula slots ou preço fechado.
2. Cliente envia solicitação com escopo e local minimizado.
3. Profissional aceita, recusa ou contrapropõe.
4. Toda transição gera histórico e é autorizada no servidor.
5. Quando proposta, data e horário forem aceitos, uma operação transacional cria
   a reserva correspondente ou informa conflito.

### 5.3 Conversa e endereço

- conversa não é DM irrestrita no beta: nasce de uma solicitação ou reserva;
- só os participantes autorizados leem, assinam o canal realtime ou enviam;
- notificações não carregam corpo de mensagem;
- endereço completo e instruções de acesso permanecem privados e só são
  liberados no estado definido pelo contrato;
- logs comuns nunca recebem mensagem, telefone, CPF ou endereço completo.

### 5.4 Avaliação

- requer contratação concluída/elegível;
- possui unicidade por autor, alvo e contratação;
- não pode ser criada, apagada ou reatribuída pelo avaliado;
- remoção e contestação preservam auditoria;
- agregados excluem conteúdo inelegível conforme regra determinística.

## 6. Integração técnica

### 6.1 Operações e RLS

- leituras públicas retornam apenas projeções explicitamente públicas;
- mutações sensíveis usam Server Actions/RPCs com validação server-side;
- RLS continua como defesa em profundidade e recebe testes multi-tenant;
- nenhum contador, papel, ownership ou estado vindo do navegador é confiável;
- operações repetíveis usam chaves de idempotência ou constraints de unicidade;
- feed, comentários, mensagens e busca usam paginação por cursor/limite.

### 6.2 Eventos

O contrato detalhado deve prever uma outbox ou mecanismo equivalente para
propagar efeitos sem transação distribuída. Eventos candidatos:

- `profile.published`;
- `post.published`, `post.moderated`;
- `profile.followed`, `post.reacted`, `comment.created`;
- `service_request.created`, `proposal.accepted`;
- eventos de booking já existentes/evoluídos;
- `conversation.message_created`;
- `review.created`, `report.created`, `moderation.action_applied`.

Cada evento precisa de identificador, versão, instante, ator, recurso,
correlation/idempotency key e payload mínimo. Dados sensíveis não entram no
payload sem necessidade e controle de acesso.

### 6.3 Mídia

Um pipeline único deve atender avatar, capa, serviços, portfólio, posts e anexos,
com políticas diferentes por finalidade. Ele deve validar tipo real, tamanho,
dimensões, ownership, visibilidade e remoção; gerar variantes otimizadas; exigir
texto alternativo quando aplicável; e reconciliar arquivos órfãos.

### 6.4 Busca e feed

- busca inicial usa recursos PostgreSQL e índices medidos antes de adicionar um
  serviço externo;
- localização pública é cidade/bairro/área aproximada, nunca endereço completo;
- ranking do beta usa sinais limitados e explicáveis;
- conteúdo bloqueado, removido, não publicado ou inelegível é filtrado no
  servidor;
- personalização avançada, anúncios e destaque pago exigem decisão posterior,
  identificação clara e controles contra discriminação/manipulação.

## 7. Migração e rollout

1. Criar contratos e testes de segurança antes das tabelas sociais.
2. Usar migrations aditivas, defaults seguros e backfills observáveis.
3. Introduzir flags server-side por módulo/coorte.
4. Manter páginas e motor de reserva atuais funcionais com todas as flags
   desligadas.
5. Ativar primeiro para equipe/contas de teste, depois para piloto limitado.
6. Medir erros, abuso, latência e conversão.
7. Preservar um kill switch que desliga superfícies sociais sem apagar dados nem
   impedir reservas.

Flags conceituais: perfil social, descoberta, posts/feed, solicitações,
mensagens, avaliações e moderação. Nomes/implementação são responsabilidade da
[#82](https://github.com/deividjmoura/marcou/issues/82).

## 8. Segurança, privacidade e operação

Antes do beta amplo são obrigatórios:

- bloqueio, denúncia e enforcement server-side;
- rate limiting e validação de uploads/conteúdo;
- fila de moderação, sanções reversíveis e audit log;
- Termos, Política de Privacidade e Diretrizes da Comunidade versionados e
  revisados para o funcionamento real;
- exportação, exclusão/anonimização e retenção definidas;
- logs redigidos, alertas, backups e restauração testada;
- testes negativos de autorização, E2E crítico, acessibilidade e budgets de
  desempenho;
- autorização explícita antes de qualquer mudança em produção.

As minutas legais da Zelora são referências internas, não textos aprovados para
publicação. A marca, os fornecedores, os fluxos reais e a pessoa operadora devem
ser confirmados e revisados juridicamente.

## 9. Consequências

### Benefícios

- preserva o ativo técnico mais maduro: motor de reservas e RLS do Marcou;
- evita duplicação de autenticação e infraestrutura;
- permite entrega vertical e rollback por módulo;
- conecta métricas sociais a valor real de serviço/agendamento;
- incorpora confiança, privacidade e moderação desde o desenho.

### Custos e riscos

- o produto completo exige vários domínios e não deve ser entregue em uma PR;
- feed/chat aumentam volume, abuso e requisitos operacionais;
- localização, mensagens e endereços elevam o risco LGPD;
- solicitações sob orçamento adicionam uma segunda jornada de contratação, que
  deve convergir ao motor de agenda sem criar fonte paralela de disponibilidade;
- o beta precisa limitar escopo/coorte até que moderação e observabilidade sejam
  operáveis.

## 10. Alternativas rejeitadas

1. **Copiar a Zelora para dentro do Marcou:** rejeitada por duplicar stack e não
   trazer módulos sociais implementados.
2. **Migrar o Marcou para Firebase/Vite/API própria:** rejeitada por alto risco e
   perda das garantias já implementadas no Supabase/PostgreSQL.
3. **Construir feed antes de identidade, RLS e moderação:** rejeitada por risco de
   vazamento, abuso e retrabalho.
4. **Abrir mensagens sem contexto:** rejeitada no beta por spam e segurança.
5. **Usar likes como reputação:** rejeitada; reputação verificável depende de
   contratação elegível.
6. **Site, subdomínio, hospedagem ou aplicação independente por profissional:**
   rejeitada; o perfil é rota interna da aplicação única (§3.3), e criar
   superfície independente por profissional duplicaria infraestrutura,
   autenticação, SEO e manutenção.
7. **Rota raiz `/{slug}` para o perfil público:** rejeitada por colidir com o
   namespace de rotas estáticas e futuras da aplicação (§3.3).

## 11. Decisões ainda necessárias

- vertical e região do piloto;
- critérios finais de completude/publicação profissional;
- estado exato em que o endereço é revelado;
- política de conclusão, cancelamento, ausência e elegibilidade de avaliação;
- retenção por categoria de dado;
- equipe, SLA e processo de recurso da moderação;
- fornecedores externos de e-mail, monitoramento, pagamentos e canais futuros.

Essas decisões possuem issues próprias na
[árvore do roadmap](ROADMAP-MARCOU-SOCIAL.md) e não bloqueiam a criação da
fundação técnica, desde que permaneçam explícitas e com defaults seguros.
