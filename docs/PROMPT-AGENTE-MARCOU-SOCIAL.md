# Prompt para outro agente — Marcou Social

Este arquivo contém um prompt pronto para iniciar a próxima entrega segura da
árvore: [Issue #81](https://github.com/deividjmoura/marcou/issues/81). Ela fecha
o contrato de domínio antes de qualquer migration social e reduz conflitos entre
agentes.

## Prompt pronto para copiar

```text
Você é um agente de engenharia trabalhando no repositório
https://github.com/deividjmoura/marcou.

MISSÃO
Implemente exclusivamente a Issue #81:
“[FOUNDATION] Definir contrato de domínio e eventos entre social e agendamento”.
Ela é subissue da Epic #73 e da iniciativa #72 (Marcou Social).

REGRAS DE BRANCH E GITHUB
1. Use somente a branch que o seu ambiente/sessão atribuir. Não troque, renomeie
   ou crie outra branch se o ambiente fixar a branch atual.
2. Baseie-se na main mais recente permitida pelo ambiente e verifique o estado
   real de issues/PRs antes de editar.
3. Não faça merge, não feche issues e não altere produção. Abra uma PR real
   somente depois de existir um diff revisável.
4. A PR deve ter o título sugerido na #81, conter `Closes #81` e apontar #72/#73.
5. Se a entrega da #80 ainda não estiver na main, leia a PR vinculada à #80 para
   contexto e evite duplicar ou reescrever o roadmap.

LEITURA OBRIGATÓRIA ANTES DE EDITAR
- Issue #72, Epic #73 e Issues #80, #81 e #82.
- `docs/DECISAO-ARQUITETURA-MARCOU-SOCIAL.md`.
- `docs/ROADMAP-MARCOU-SOCIAL.md`.
- `docs/CONTRATO-DOMINIO-AGENDAMENTOS.md`.
- `docs/MOTOR-RESERVAS.md`.
- `docs/ESCOPO-E-ARQUITETURA.md`.
- migrations atuais em `supabase/migrations/`.
- implementação de domínio em `src/domain/bookings/` e servidor em
  `src/server/`.
- repositório público `deividjmoura/zelora`, apenas como referência de produto,
  privacidade e marketplace; não copie sua stack Firebase/Vite/API.
- PRs abertas que toquem schema, auth, perfil, serviços, agenda ou segurança.

DECISÕES JÁ TOMADAS — NÃO REABRIR SEM EVIDÊNCIA NOVA
- O Marcou é a base canônica.
- A stack continua Next.js + TypeScript + Supabase Auth/PostgreSQL/Storage + RLS.
- O motor atual continua sendo a única autoridade de disponibilidade e reserva.
- A rede é centrada em serviços e entra por migrations aditivas/feature flags.
- O perfil público do profissional é uma rota interna da plataforma, canonicamente
  `/p/{slug}` (`providers.slug` como identificador público validado). Nunca criar
  site, subdomínio, hospedagem ou aplicação independente por profissional, nem
  rota raiz `/{slug}` — ver `docs/REVISAO-ARQUITETURA-SOCIAL.md`.
- Visitante navega conteúdo público permitido sem criar conta; ações privadas
  (seguir, salvar, comentar, solicitar, agendar) exigem a autenticação e as
  permissões existentes.
- Não será adicionada uma segunda autenticação Firebase.
- Endereço, telefone, mensagens e documentos não podem vazar em consultas
  públicas, eventos ou logs comuns.

ENTREGA ESPERADA
Crie um contrato versionado, preferencialmente
`docs/CONTRATO-DOMINIO-MARCOU-SOCIAL.md`, contendo pelo menos:

1. Glossário e bounded contexts: identidade, perfil profissional, catálogo,
   mídia/portfólio, social, descoberta, solicitações, bookings, conversas,
   reputação, trust & safety e notificações.
2. Fonte de verdade, proprietário e classificação (público, privado,
   participante, admin auditado) de cada dado.
3. Entidades conceituais, identificadores e relações. Não feche nomes físicos de
   tabela sem necessidade; quando propuser, marque como proposta para migration.
4. Invariantes entre post, perfil, serviço, request/proposal, conversation,
   booking e review.
5. Máquinas de estado para:
   - publicação/moderação de conteúdo;
   - solicitação, proposta, contraproposta, aceite, recusa, cancelamento e
     expiração;
   - elegibilidade/conclusão necessária para avaliação;
   - bloqueio/suspensão e efeito em conteúdo, conversa e contratação ativa.
6. Matriz de autorização por ator e operação, incluindo casos negativos.
7. Matriz de visibilidade e momento exato em que local/endereço pode ser
   revelado.
8. Catálogo inicial de eventos: nome, versão, emissor, consumidor, payload
   mínimo, dados proibidos e chave de idempotência/correlação.
9. Estratégia outbox/entrega ao menos uma vez e como consumidores evitam efeitos
   duplicados. Não crie uma transação distribuída.
10. Como uma proposta aceita cria uma booking sem contornar as garantias atuais
    de conflito, snapshot, autorização e idempotência.
11. Compatibilidade e migração dos dados atuais (`profiles`, `providers`,
    `services`, `bookings`, `booking_events`, `notifications`).
12. Decisões abertas com owner, default seguro e condição de desbloqueio.
13. Diagramas Mermaid para contexto e estados, mantendo o Markdown renderizável
    no GitHub.

LIMITES DESTA ISSUE
- É uma entrega de contrato/documentação. Não crie tabelas, RPCs, telas, Firebase,
  API paralela ou integração externa.
- Não altere migrations existentes já versionadas.
- Não aplique migration no Supabase remoto e não mexa em Netlify/produção.
- Não implemente feed, chat, busca ou solicitações nesta PR.
- Não enfraqueça RLS, idempotência ou a constraint contra sobreposição.

CRITÉRIOS DE QUALIDADE
- O contrato não pode ter duas fontes de verdade para preço, duração,
  disponibilidade, status ou contadores.
- Eventos não carregam PII/conteúdo sensível por conveniência.
- Toda escrita privada prevê validação server-side e autorização/RLS.
- Toda operação repetível define idempotência ou unicidade.
- Coleções crescentes preveem paginação por cursor e índices a validar.
- Endereços e mensagens possuem regras explícitas de acesso e retenção.
- A documentação deve apontar quais decisões pertencem às Issues #82–#112, sem
  aumentar silenciosamente o escopo.

VALIDAÇÃO
- Verifique todos os links e referências de issues/arquivos.
- Garanta que Mermaid e Markdown renderizem corretamente.
- Execute `npm run lint`, `npm run typecheck`, `npm run test` e
  `npm run test:db` se qualquer arquivo executável/configuração for alterado.
- Para alteração exclusivamente documental, registre que os testes de runtime
  não eram necessários; ainda assim revise `git diff --check`.
- Nunca declare CI verde antes de os checks reais concluírem.

FORMATO DA RESPOSTA FINAL
- Resumo do contrato criado.
- Arquivos alterados.
- Decisões fechadas e decisões ainda abertas.
- Validações realmente executadas e resultado.
- Riscos/pendências.
- Link da PR, sem fazer merge.
```

## Modelo genérico para qualquer leaf issue

Substitua apenas os campos entre `<...>` e preserve os guardrails.

```text
Trabalhe no repositório deividjmoura/marcou exclusivamente na Issue <#N>,
subissue da Epic <#EPIC> e da iniciativa #72.

Use apenas a branch atribuída pelo ambiente. Antes de editar, leia a issue, as
suas dependências, `docs/DECISAO-ARQUITETURA-MARCOU-SOCIAL.md`,
`docs/ROADMAP-MARCOU-SOCIAL.md`, o código atual e todas as PRs abertas que toquem
a mesma área. Não duplique trabalho em andamento.

Objetivo: <OBJETIVO DA ISSUE>.
Entregáveis: <ARQUIVOS/FLUXOS ESPERADOS>.
Fora do escopo: <LIMITES DA ISSUE>.

Guardrails:
- Marcou/Next.js/Supabase/PostgreSQL/RLS são a base canônica; não introduza
  Firebase nem uma API paralela.
- Preserve o motor de reservas e suas garantias de autorização, idempotência e
  concorrência.
- Backend/banco são autoridade para papel, ownership, preço, duração, estado,
  visibilidade e contadores.
- Proteja PII, endereços, mensagens e mídia; teste RLS/autorização negativa.
- Não aplique migrations nem altere produção/Netlify/Supabase remoto sem
  autorização explícita.
- Não remova funcionalidade existente fora do escopo.
- Não abra PR vazia e não faça merge.

Implemente a menor PR completa que satisfaça todos os critérios de aceite. Inclua
persistência/constraints, validação server-side, autorização/RLS, estados de UI,
testes, documentação, migration e rollback quando aplicáveis.

Execute as validações relevantes (`npm run lint`, `npm run typecheck`,
`npm run test`, `npm run test:db`, `npm run build`) e relate somente resultados
reais. Abra PR com `Closes <#N>`, resumo, screenshots para UI, migrations,
riscos, rollback e evidências. Ao final informe arquivos alterados, testes,
pendências e link da PR.
```

## Como distribuir trabalho entre agentes

- Dê a cada agente **uma leaf issue**, nunca uma epic inteira.
- Evite dois agentes alterando a mesma migration ou módulo de autorização.
- Só paralelize issues quando todas as dependências do corpo estiverem
  concluídas ou quando houver contrato estável explicitamente aceito.
- O primeiro agente adicional recomendado é o da #81; após #83, as frentes de
  mídia (#84), taxonomia (#87) e schema social (#90) podem ser distribuídas com
  coordenação.
