# 🔴 PADRÃO OBRIGATÓRIO DO DOCUMENTO — FORMATO HÍBRIDO (15/11/2026)

## Fonte de verdade estruturada para todos os agentes

A partir desta atualização, este arquivo deve seguir um **formato híbrido: JSON válido para estado estruturado + Markdown para instruções e explicações**. O objetivo é permitir que agentes identifiquem rapidamente o estado real do projeto sem perder contexto técnico e regras em linguagem natural.

### 1. Bloco JSON de estado
- Manter no início do documento um único bloco JSON válido, sem comentários, com informações objetivas e atuais.
- Organizar nele: nome/repositório, branch principal, arquitetura adotada, funcionalidades e respectivos status, PRs/branches em andamento, entregas concluídas, pendências, bloqueios e regras críticas.
- Usar estados padronizados, por exemplo: `"concluido_verificado"`, `"implementado_nao_verificado"`, `"em_andamento"`, `"planejado"` e `"bloqueado"`.
- Registrar links, números de PR e SHAs quando conhecidos. Não inventar dados nem tratar validação em banco local como validação em Supabase remoto.
- Manter o JSON sintaticamente válido. Não inserir comentários, vírgulas finais ou texto explicativo dentro do bloco.

### 2. Seções em Markdown
Depois do JSON, manter em Markdown:
- decisões de produto e arquitetura, com justificativas;
- instruções detalhadas da tarefa prioritária;
- critérios de aceite e testes esperados;
- procedimentos de segurança, Git, revisão e passagem entre agentes;
- contexto técnico que não se encaixa bem em campos estruturados.

### 3. Atualização obrigatória por qualquer agente
- Antes de trabalhar, ler o JSON e as instruções Markdown e conferir tudo contra o repositório, branches, PRs, código e CI atuais.
- Ao alterar o projeto, atualizar o JSON e o Markdown na mesma entrega, antes de encerrar ou transferir o trabalho.
- Atualizar status, PRs, branches, commits, validações e pendências com fatos confirmados.
- Se houver divergência, corrigir o documento com base em evidências e registrar o que mudou; não copiar cegamente o estado anterior.
- Não apagar histórico útil nem duplicar relatos. O resumo estruturado deve refletir o estado atual; o histórico Git permanece como fonte dos detalhes das alterações.
- Se não for possível verificar um item, marcar como não verificado ou bloqueado e explicar a limitação.

### 4. Prioridade e segurança
- A instrução mais recente no topo prevalece sobre instruções históricas conflitantes.
- Não alterar `main` diretamente para desenvolvimento; usar branch própria e PR, salvo orientação explícita em contrário.
- Não fazer merge, deploy ou aplicar migrations em Supabase remoto sem autorização explícita.
- Não sobrescrever branches ou arquivos de outros agentes. Coordenar mudanças compartilhadas e revisar diffs.
- Nunca incluir segredos, tokens privados, senhas ou chaves privilegiadas no documento.

---

# 🔴 ESTADO ATUAL CONSOLIDADO — 15/11/2026

> **Leia esta seção primeiro.** Ela corrige divergências do histórico abaixo. Se houver conflito, este resumo atual prevalece; confirme sempre no código, Git e CI antes de considerar algo concluído.

## O que está implementado na `main`

- **Motor básico de agendamentos:** integrado pela PR #3 (merge commit `03ac75b`). Inclui fluxo básico de reservas, disponibilidade, proteção contra duplicidade, cadastro de negócio/serviços/expediente e painel. Ainda precisa ser auditado para confirmar os requisitos novos de múltiplos serviços e expiração.
- **Notificações internas:** PR #5 integrada por squash em `main` (commit `ca9b73f`). Inclui notificações para cliente/profissional, sino/contador e página `/notificacoes`. Os testes e build registrados pelo agente foram 39/39, 45/45 no banco embutido e build OK; isso não equivale a validação em Supabase remoto.
- **Supabase remoto:** projeto criado pelo responsável, mas não considerar migrations aplicadas ou integração remota validada sem evidência atual. Não aplicar migrations, alterar dados ou configurar produção nesta tarefa.
- **Google OAuth:** decisão de produto definida; configuração no Google Cloud fica para a etapa de integração do login. Não introduzir Firebase como autenticação paralela.
- **WhatsApp/Railway:** fora do escopo atual; fase futura.

## Trabalho em andamento — respeitar branches de outros agentes

- **PR #4 — calendário resiliente:** aberta como rascunho, branch `fix/calendario-disponibilidade-resiliente`, head `109f7ad`. Não sobrescrever nem integrar sem revisar diff e CI.
- **PR #1 e #2 — prévia visual pública/calendário:** rascunhos com dados demonstrativos; não tratar como fluxo real nem substituir o fluxo funcional.
- Verificar novamente o estado das PRs e branches antes de iniciar, pois podem ter recebido commits desde esta atualização.

## Próxima tarefa delegada

Implementar/auditar **agendamento com múltiplos serviços e expiração automática de reservas pendentes**, conforme a seção específica abaixo. O agente deve trabalhar em branch própria, sem tocar na PR #4 nem em branches de terceiros; criar migrations versionadas e testes; não aplicar migrations em Supabase remoto; abrir PR em rascunho e não fazer merge. Antes de alterar, comparar a implementação atual da `main` com o código existente e relatar lacunas reais. Ao terminar, atualizar este documento com fatos e validações executadas.

---

# 🔴 INSTRUÇÕES MAIS RECENTES — LER PRIMEIRO

## ✅ Entrega registrada — notificações no aplicativo (15/11/2026)

**Status: implementado e verificado.** A estrutura de notificações descrita em
"Trabalho novo: notificações para clientes e profissionais" foi concluída no
aplicativo, com origem nos eventos de agendamento. Nada de WhatsApp, bot ou
Railway foi tocado.

**O que entrou**
- Migration `supabase/migrations/202611150003_notifications.sql`: tabela
  `public.notifications`, tipo `notification_kind`, RLS (leitura/atualização
  somente do próprio `recipient_id`), trigger `booking_events_notify` sobre
  `booking_events`, RPC `create_booking_reminders(p_within_hours)` e RPCs
  `mark_notification_read` / `mark_all_notifications_read`.
- Camada de servidor `src/server/notifications.ts` e ações
  `src/app/notificacoes/actions.ts`.
- Interface: página `/notificacoes` (lista, "Marcar como lida", "Marcar todas",
  link para a reserva) e sino `NotificationBell` com contador de não lidas no
  painel, em `/meus-agendamentos` e em `/reserva/[id]`.
- Design em `docs/NOTIFICACOES.md`.

**Validação executada (resultados reais)**
- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 39/39.
- `npm run test:db` — 45/45 (inclui a seção `[notificações]`: destinatários,
  RLS, idempotência, marcar como lida, lembretes).
- `npm run build` — OK; rota `/notificacoes` dinâmica.
- Smoke do app: `/`, `/login`, `/cadastro`, `/painel`, `/meus-agendamentos`,
  `/notificacoes`, `/p/qualquer`, `/reserva/abc` responderam HTTP 200.

**Verificado apenas em banco embutido.** Não existe projeto Supabase remoto
provisionado; as migrations não foram aplicadas em nenhum ambiente real e a
página `/notificacoes` com sessão/RLS só foi exercitada no harness
`scripts/db-check.mjs`.

**Pendências desta frente**
- Nenhum cron configurado para `create_booking_reminders()` nem para
  `expire_stale_bookings()`.
- E-mail não implementado (nenhuma infraestrutura de envio configurada; nenhuma
  credencial criada). O que seria necessário está em `docs/NOTIFICACOES.md`.
- `booking.changed` está mapeado, mas nenhuma transição atual o emite; entrará
  quando houver reagendamento/edição de reserva.

**Git:** branch `arena/68d409cd-marcou` (base `main` = `03ac75b`), commit
`5c5c7a7`. PR #5 aberta para `main`
(https://github.com/deividjmoura/marcou/pull/5); **sem merge** (aguardando
autorização). Checks da PR: `quality` e `Vercel` passaram.

**Trabalho paralelo de outros agentes (não mexer, não sobrescrever):** existem
outras branches/PRs abertas na mesma base — `feat/calendario-mobile` (PR #2,
rascunho), `feat/pagina-publica-agendamento` (PR #1, rascunho) e
`fix/calendario-disponibilidade-resiliente` (PR #4, rascunho). A entrega de
notificações não alterou nenhum arquivo dessas frentes; antes de qualquer
integração, comparar com o estado atual de cada PR.

---

## 🔴 REGRA OBRIGATÓRIA — DOCUMENTO VIVO DE CONTINUIDADE PARA TODOS OS AGENTES

> **Prioridade máxima — válida para qualquer agente humano ou automatizado que trabalhe neste repositório.** Este arquivo é a referência compartilhada para entender o estado atual do Marcou. Todo agente deve lê-lo antes de começar e atualizá-lo antes de encerrar, entregar, pausar ou transferir qualquer trabalho.

### Atualização obrigatória a cada modificação

- **Toda alteração no projeto exige atualizar este documento na mesma tarefa/entrega**: código, interface, estilos, banco de dados, migrations, autenticação, regras de negócio, testes, documentação, configuração, dependências ou infraestrutura.
- A atualização deve acontecer antes de concluir o trabalho ou passar a tarefa para outro agente. Não deixe para uma próxima sessão.
- Não é necessário registrar um diário nem copiar o histórico completo de commits. Mantenha um **resumo curto, atual e operacional**, suficiente para o próximo agente entender o projeto sem precisar reler todo o código para descobrir decisões e andamento.
- Atualize o resumo existente, em vez de acumular relatos repetidos. Preserve decisões ainda válidas e remova do resumo apenas informações que se tornaram obsoletas; o histórico Git continua sendo a fonte para rastrear alterações detalhadas.
- Registre somente fatos confirmados. Diferencie claramente: **implementado e verificado**, **implementado mas não verificado**, **em andamento**, **planejado** e **bloqueado**.
- Se uma alteração não puder ser concluída, registre o que foi feito, o ponto exato em que parou, o motivo e o próximo passo seguro.
- Não considere a tarefa concluída enquanto a documentação não refletir o estado final real.

### Conteúdo mínimo que deve permanecer atualizado

1. **Visão atual do produto e arquitetura:** stack, serviços e integrações realmente adotados; não apresente planos como implementações.
2. **Decisões de produto confirmadas:** fluxos aprovados, regras e preferências que os próximos agentes não devem rediscutir ou contradizer sem nova orientação do responsável.
3. **Estado por funcionalidade:** o que está pronto, incompleto, em desenvolvimento, planejado ou bloqueado.
4. **Alterações da entrega atual:** resumo dos arquivos/áreas afetados e o objetivo da mudança, sem reproduzir o diff.
5. **Validação:** comandos executados e resultados reais de lint, typecheck, testes e build; indique explicitamente o que não foi executado.
6. **Git e colaboração:** branch utilizada, commit(s) relevantes e PR/link, quando existirem; identifique dependências de trabalho de outros agentes e não sobrescreva suas alterações.
7. **Próximos passos e pendências:** ordem recomendada, dependências, decisões ainda necessárias e bloqueios.

### Procedimento de passagem entre agentes

- Antes de trabalhar: leia este documento, confira o estado atual do repositório, branches, commits e PRs; compare o código com o resumo para detectar divergências.
- Durante o trabalho: preserve as decisões confirmadas e coordene alterações em áreas compartilhadas com os demais agentes.
- Ao finalizar ou transferir: atualize este documento, faça commit da documentação junto da entrega correspondente sempre que possível e informe ao próximo agente onde continuar.
- Se encontrar informação desatualizada, corrija-a com evidência do repositório. Não copie cegamente instruções antigas.
- Esta regra vale para **todos os agentes e todas as branches**. Uma branch de trabalho deve carregar a atualização documental correspondente às mudanças daquela branch; quando o trabalho for integrado, mantenha o resumo canônico coerente na branch principal.

### Estado e decisões de produto confirmadas em 15/11/2026

- **Cadastro do cliente após selecionar serviços:** oferecer cadastro/login por e-mail e senha ou autenticação com Google.
- **Cadastro por e-mail:** nome, e-mail e senha; oferecer recuperação de senha.
- **Login Google:** obter nome e e-mail pelo provedor e solicitar o telefone ao cliente após autenticar, pois o telefone não deve ser presumido como dado fornecido pelo OAuth.
- **Telefone:** obrigatório no perfil do cliente para continuidade do fluxo, a ser solicitado/completado após autenticação quando ainda não estiver cadastrado.
- **Fluxo visual aprovado até aqui:** selecionar serviços → cadastro/login do cliente e complemento do telefone → escolher data e horário → revisar e confirmar.
- **Calendário mobile:** mostrar somente horários realmente disponíveis, considerando duração combinada dos serviços, expediente, pausas, folgas, bloqueios e agendamentos existentes. Impedir conflitos também no backend/banco, inclusive solicitações simultâneas; não confiar apenas na interface.
- **Janela de agendamento:** o profissional poderá configurar a antecedência máxima das reservas; opções de referência discutidas e aprovadas: 30, 60 ou 90 dias.
- **Importante:** estas linhas registram decisões de produto, não comprovam que cadastro, OAuth, calendário ou motor de disponibilidade já estejam implementados. Audite o código antes de marcar qualquer item como concluído.
- **Página pública:** a prévia visual está em uma branch/PR de trabalho separada; conferir o estado atual da PR e da branch antes de continuar. Não assumir que foi integrada ou que já grava reservas reais.

---


> **Atualizado em 15/11/2026.** Esta seção reúne as orientações mais novas do responsável pelo produto. Leia antes do restante do documento. Ela complementa e, em caso de conflito, prevalece sobre as instruções históricas abaixo. Não repita tarefas já concluídas: confira o estado atual do código, commits, branches e issues antes de agir.

## Prioridade atual: concluir o aplicativo Marcou

O desenvolvimento deve acontecer por etapas. **Neste momento, o foco é exclusivamente o aplicativo Marcou. A integração com o bot do WhatsApp fica para uma fase futura e não deve entrar no escopo das tarefas atuais.**

### Trabalho novo: notificações para clientes e profissionais

> **Andamento em 15/11/2026:** a estrutura de notificações foi implementada no
> aplicativo e verificada (ver "Entrega registrada" no topo). E-mail e
> provisionamento do cron continuam pendentes e bloqueados por infraestrutura.

Planeje e implemente, conforme a arquitetura e o estágio real do projeto, uma estrutura de notificações que atenda aos dois públicos:

- **Cliente:** avisos relacionados aos próprios agendamentos, como criação/solicitação, confirmação, cancelamento, alteração e lembretes.
- **Profissional/prestador:** avisos de novos agendamentos, solicitações pendentes, cancelamentos, alterações e lembretes relevantes para sua agenda.

Orientações:
1. Primeiro audite o que já existe no código e nas issues. Reutilize o que estiver pronto e não crie duplicatas.
2. Defina eventos de negócio claros como origem das notificações; não espalhe disparos improvisados pela interface.
3. Garanta que cada destinatário só possa consultar suas próprias notificações. Respeite autenticação, autorização e isolamento entre negócios (RLS, quando aplicável).
4. Considere estados como não lida/lida, data de criação e destino relacionado (por exemplo, agendamento), além de uma forma de marcar como lida.
5. Comece pelos recursos internos do aplicativo e, se fizer sentido para a infraestrutura já configurada, e-mail. Não dependa de WhatsApp para concluir esta etapa.
6. Não invente integração externa nem credenciais. Documente dependências e variáveis de ambiente necessárias.
7. Inclua testes para autorização, destinatários corretos, eventos duplicados e transições de estado.
8. Atualize a documentação e as issues existentes com o que foi realmente implementado.

### Separação de fases e infraestrutura

**Fase 1 — Aplicativo:**
- Aplicação web/PWA e painéis.
- Cadastro, autenticação e configuração de profissionais/negócios.
- Serviços, preços, duração e disponibilidade.
- Página pública e fluxo completo de agendamento.
- Gestão dos agendamentos.
- Notificações para clientes e profissionais dentro do aplicativo; e-mail quando viável e configurado.
- Segurança, testes, métricas e estabilidade.

A arquitetura prevista é Vercel para a aplicação Next.js e Supabase para autenticação e banco de dados, desde que a auditoria confirme que essa continua sendo a arquitetura adotada. Login Google deve ser tratado como provedor OAuth do sistema de autenticação escolhido; não introduza Firebase como segundo sistema de autenticação sem decisão explícita.

**Fase 2 — WhatsApp (adiada):**
- Bot e integração com a API do WhatsApp.
- Webhooks e processamento em serviço separado, possivelmente hospedado no Railway.
- Consultas, agendamentos, cancelamentos, reagendamentos e notificações pelo WhatsApp.

Não desenvolver agora o bot, webhooks do WhatsApp ou infraestrutura Railway para ele. O aplicativo deve, porém, manter regras de agendamento centralizadas e reutilizáveis para que uma futura integração possa consumir os mesmos serviços/API sem duplicar a lógica nem permitir reservas conflitantes.

## Regra de continuidade para este documento

Sempre que surgir uma nova tarefa ou orientação do responsável pelo produto:
- **Acrescente a nova instrução no topo deste arquivo**, abaixo deste título e acima das instruções anteriores, com data e prioridade.
- Não coloque a tarefa nova somente no final do documento.
- Preserve as instruções anteriores como histórico/contexto; não apague nem marque como concluído algo sem verificar.
- Deixe explícito o que é prioridade atual, o que foi adiado e o que depende de decisão.
- Antes de executar, compare a instrução nova com o estado real do repositório e com o trabalho dos outros agentes. Não sobrescreva alterações em andamento.
- Ao terminar, atualize esta seção ou acrescente uma nota de andamento no topo, registrando apenas resultados confirmados, commit/PR e pendências reais.

---

# Instruções para o agente — Projeto Marcou

> **Leia este documento inteiro antes de executar qualquer alteração.** Em seguida, inspecione o repositório e siga as etapas na ordem indicada. Este documento é a fonte de instruções para esta tarefa.

## Objetivo

Retomar o desenvolvimento do **Marcou**, uma plataforma de agendamento online para profissionais e pequenos negócios. O objetivo do produto é permitir que cada profissional cadastre seu negócio, configure serviços, preços e horários, publique sua própria página de agendamento e receba reservas reais dos clientes sem depender da nossa intervenção.

Repositório: https://github.com/deividjmoura/marcou

## Regra inicial obrigatória: auditar antes de alterar

1. Leia este documento e, em seguida, examine a estrutura, o histórico, as branches, os commits, as migrations, os testes e a documentação que realmente existem neste repositório.
2. Confirme que a sessão está vinculada ao repositório **deividjmoura/marcou**. Se o ambiente estiver apontando para outro repositório, pare sem editar nada e informe o problema.
3. Não presuma que funcionalidades mencionadas em conversas anteriores já existem. Considere implementado somente o que encontrar no código e conseguir verificar.
4. Verifique todas as branches relevantes, especialmente qualquer branch de identidade visual/design já existente. Não descarte, sobrescreva, force-push ou apague trabalho de terceiros.
5. Antes de começar, informe resumidamente: branch atual, branch padrão, branches relevantes encontradas, último commit e estado da árvore de trabalho (se disponível), além das funcionalidades e pendências verificadas.

## Forma de trabalho e segurança

- Preserve o trabalho existente. Não faça reset destrutivo, não reescreva histórico e não substitua arquivos sem antes entender seu conteúdo e finalidade.
- Trabalhe em uma branch própria de desenvolvimento, criada a partir da referência correta, sem fazer alterações diretamente na `main`, salvo se o fluxo do repositório exigir explicitamente outra coisa.
- Se houver trabalho relevante em outra branch, compare e integre-o cuidadosamente; não assuma que deve ser substituído.
- Faça alterações pequenas, coerentes e revisáveis. Evite refatorações amplas que não sejam necessárias para os objetivos abaixo.
- Não exponha, registre ou invente segredos. Use variáveis de ambiente e atualize apenas exemplos seguros de configuração.
- Não afirme que algo foi testado, corrigido, enviado ou publicado sem executar a verificação correspondente.
- Não faça deploy, não altere serviços externos e não aplique migrations em produção sem autorização explícita.
- Se faltar acesso, configuração ou informação indispensável, registre exatamente o bloqueio e continue apenas com tarefas independentes que sejam seguras.

## Etapas de execução

### Etapa 1 — Diagnóstico do estado real

- Identifique stack, estrutura de pastas, scripts disponíveis e convenções do projeto.
- Confira dependências e configuração do Next.js, React, TypeScript e Supabase, caso estejam presentes.
- Revise migrations e políticas RLS existentes, verificando isolamento dos dados por profissional/negócio.
- Localize o fluxo atual de cadastro, serviços, disponibilidade e agendamentos.
- Identifique testes existentes e workflows de CI.
- Produza uma lista objetiva do que está pronto, incompleto, quebrado ou ausente, sempre baseada em evidências do repositório.

### Etapa 2 — Consolidar e corrigir a base

- Preserve e consolide implementações úteis que já estejam no repositório ou em branches relevantes.
- Corrija erros reais de TypeScript, incluindo problemas de integração com Supabase/cookies se ainda existirem.
- Execute lint, verificação de tipos, testes e build usando os scripts e comandos adequados ao projeto.
- Corrija falhas relacionadas às alterações realizadas e registre claramente qualquer falha preexistente ou bloqueio externo.
- Não remova testes ou enfraqueça regras de lint/tipagem apenas para obter uma execução verde.

### Etapa 3 — Motor confiável de agendamentos

Priorize a lógica central de reservas, se ainda não estiver implementada e validada:

- Consultar disponibilidade considerando duração do serviço, expediente, intervalos, bloqueios e reservas existentes.
- Impedir sobreposição de agendamentos.
- Proteger contra duas solicitações simultâneas para o mesmo horário, usando garantias no banco/transações ou mecanismo equivalente; não depender apenas de validação no frontend.
- Criar e confirmar reservas com estados explícitos e transições válidas.
- Tratar reservas pendentes e sua expiração de forma segura. A expiração deve liberar a disponibilidade sem apagar indevidamente o histórico.
- Garantir integridade transacional e isolamento entre negócios.
- Adicionar testes para conflitos, concorrência, limites de horário, duração dos serviços, expiração e isolamento multi-tenant.

Use migrations versionadas para mudanças no banco. Revise cuidadosamente constraints, índices, funções, triggers e políticas RLS. Não aplique alterações diretamente em produção.

### Etapa 4 — Fluxo essencial do produto

Depois de estabilizar a base e o motor de reservas, avance pelo fluxo mínimo de ponta a ponta, respeitando a arquitetura existente:

1. Cadastro/autenticação do profissional.
2. Cadastro e configuração do negócio.
3. Cadastro de serviços, duração e preço.
4. Configuração de expediente, pausas e disponibilidade.
5. Página pública do negócio com serviços disponíveis.
6. Escolha de serviço, data e horário pelo cliente.
7. Criação e confirmação de agendamento.
8. Visualização e gerenciamento dos agendamentos pelo profissional.

Não implemente funcionalidades fictícias ou botões sem ação. Se alguma etapa depender de credenciais ou serviços externos, deixe a integração preparada com configuração documentada e sinalize o que precisa ser conectado.

## Critérios de qualidade e conclusão

Antes de encerrar:

- Execute e informe os resultados de lint, typecheck, testes e build, quando houver scripts correspondentes.
- Inclua ou atualize testes para as regras de negócio alteradas.
- Revise segurança, autorização no servidor e políticas RLS; não confie apenas em proteções visuais no cliente.
- Verifique que nenhuma credencial foi adicionada ao Git.
- Faça commits com mensagens claras na branch de trabalho.
- Abra uma Pull Request para revisão, se a integração GitHub estiver disponível e o fluxo permitir. Não faça merge sem autorização.
- Informe os arquivos principais alterados, decisões técnicas, comandos executados, resultados reais, limitações e próximos passos.
- Se não conseguir concluir uma etapa, explique o motivo e deixe o trabalho em estado seguro e revisável.

## Formato da primeira resposta do agente

Comece com um diagnóstico curto do repositório **depois de realmente inspecioná-lo**. Não comece afirmando que o projeto já possui funcionalidades que ainda não foram verificadas. Depois, apresente o plano baseado no estado encontrado e execute as etapas seguras sem pedir confirmação para cada pequena alteração.

**Prioridade geral:** preservar o que existe, tornar o agendamento confiável e entregar um fluxo real que permita a um profissional configurar seu negócio e receber agendamentos.
