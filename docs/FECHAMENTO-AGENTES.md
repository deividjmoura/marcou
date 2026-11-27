# Fechamento de pontas abertas — runbook dos agentes (rodada 7)

> **Fonte de verdade viva:** `.agent-coordination/state.json` na branch `coordination/agents`.
> Este documento é o runbook estável (regras, ordem, critérios). O estado volátil (SHAs, CI, status por agente) fica **somente** no `state.json`.
> Snapshot de referência: 2026-11-27, `main` = `5b4e894` (#128 e #38 já mergeadas). Sempre reconfirme a `main` atual antes de agir.

## 0. Autorização do responsável (vale para os 6 agentes, rodada 7)

O responsável (Deivid) concedeu **autonomia total para integrar**. Isso significa:

- **Você PODE e DEVE fazer squash merge** das PRs do seu escopo assim que o checklist da seção 5 estiver verde no SHA exato. Não peça confirmação, não espere teste manual: o responsável fará os testes reais em produção **depois** desta rodada, e é justamente por isso que a integração foi liberada agora.
- **Você PODE** resolver conflitos, atualizar branches com a `main` (merge, sem force-push), adicionar testes, marcar PR como Ready, fechar PRs superadas (com evidência), fechar issues com aceite comprovado e apagar branches comprovadamente integradas.
- Esta autorização **inclui a #133** (documental): resolva o conflito, rode o CI e mergeie se verde, deixando na PR um resumo curto da decisão de arquitetura para o responsável ler depois.
- **Não depende de** teste manual/real pendente. Registre-o como pendência do responsável.

O que **continua proibido** (a autonomia é sobre o repositório, não sobre o ambiente real): ver a seção 4. Em especial: nada de Supabase remoto, Netlify, Google Cloud, OAuth/SMTP, secrets, e-mails/notificações reais, deploy manual, ativação de schedulers, tag/Release sem autorização explícita, force-push ou bypass de checks.

Se algo do checklist **não** estiver verde: corrija; se não for corrigível por você, registre o bloqueio no `state.json` com a causa exata e siga para o próximo item. Não mergeie "no vermelho" sob nenhuma hipótese.

## 1. Objetivo

Levar o repositório a um estado limpo: cada PR aberta vira **mergeada**, **corrigida e em andamento com próximo passo claro** ou **fechada com justificativa**; cada branch fica **com PR**, **deletada (comprovadamente integrada)** ou **preservada com motivo**; cada issue fica **fechada com evidência**, **aberta com status/próxima ação** ou **marcada como decisão do responsável**.

## 2. Estado de partida (verificado em 2026-11-27)

| PR | Estado | Agente | Ação esperada |
|----|--------|--------|---------------|
| #127 | pronta, limpa, CI verde, 10 commits atrás da main | 2 | atualizar com main, CI, merge |
| #131 | conflito (dirty), regressão de `redirect` dentro de `try/catch`, UI ainda de 1 serviço | 1 | corrigir, testar, integrar (P0: destrava #136, #124, #68) |
| #124 | conflito, 10 atrás | 1 | após #131; parser BRL, sinal, ações por papel |
| #68 | rascunho, conflito, 34 atrás | 1 | após #124/#131; confirmação e `.ics` multi-serviço |
| #130 | rascunho, conflito, depende de #127 | 2 | reconstruir sobre main após #127, testes com mocks |
| #128 | **mergeada** (`8a5e4e7`, 20:11) | — | nada a fazer; serve de base para a #38 |
| #38 | **mergeada** (`5b4e894`) | — | nada a fazer; Agent 3 confere só a consistência com a #128 e a documentação |
| #32 | pronta, conflito, 132 atrás | 3 | triagem: reaproveitar o que falta ou fechar como superada |
| #136 | rascunho; `test:db` falha: espera migration que só existe na #131 | 4 | após decisão da migration em #131; ligar `privileges-check` ao CI |
| #41 | rascunho, conflito, 104 atrás | 4 | provável superada por #117/#135; fechar com evidência |
| #133 | pronta, conflito, **revisão do responsável exigida** | 5 | resolver conflito e preparar resumo; **não mergear sem aprovação** |
| #67 | rascunho, limpa, 34 atrás | 5 | atualizar, validar, integrar se critérios atendidos |
| #46 | conflito, 95 atrás, 1 arquivo | 5 | provável fechar como superada |
| #2 | rascunho, base `feat/pagina-publica-agendamento` | 5 | provável fechar como superada |

Já integrado e **não deve ser refeito**: #128 (scheduler de expiração), #134 (harness de concorrência no `test:db`), #135 (Calendar #29 + endurecimento de privilégios #125), #39 (agenda do prestador), #129 (lock de transição). A PR #126 está **fechada** (substituída pela #135).

## 3. Ordem de execução

1. **Onda 0 (paralelo):** Agente 2 → #127; Agente 3 → atualizar a #38 sobre a main (a #128 já foi integrada); Agente 1 → corrigir #131; Agente 5 → fechar #46/#2 (com evidência) e resolver #133; Agente 4 → auditar #41 e branches de Calendar; Agente 6 → baseline independente.
2. **Onda 1:** merge da #131 (destrava Agente 4, #124 e #68).
3. **Onda 2:** #136, #124, #130 (após #127), #38.
4. **Onda 3:** #68, #67, #32; triagem final de issues.
5. **Onda 4:** Agente 6 limpa branches comprovadamente integradas e consolida o relatório.

**Um merge por vez.** Antes de mergear: reler a `main`; depois de mergear: avisar no `state.json` para os demais atualizarem suas branches.

## 4. Regras inegociáveis

- Sem force-push, sem bypass de checks, sem desabilitar ou ocultar teste, sem alterar branch protection.
- Sem deploy manual, sem migrations no Supabase remoto, sem mexer em Netlify/Supabase/Google Cloud/OAuth/SMTP/secrets, sem e-mail/notificação real, sem conectar conta Google real.
- Nunca registrar token, senha, link de recuperação ou dado pessoal (código, comentário, PR, `state.json`).
- Os seis arquivos staged locais do Calendar não podem ser lidos, alterados, movidos ou apagados.
- Não criar tag nem GitHub Release sem autorização explícita (ver `AGENTS.md`). A pergunta ao responsável é feita pelo Agente 6 no relatório final.
- Cada agente escreve **somente** a própria entrada no `state.json` (buscar o arquivo mais recente e usar o SHA do blob atual; em conflito, rebuscar e tentar de novo).

## 5. Checklist de merge (todos obrigatórios)

- [ ] HEAD exato registrado (SHA completo) e branch atualizada com a `main` atual, sem conflito.
- [ ] PR `mergeable` e fora de rascunho.
- [ ] CI `quality` verde **no SHA exato**: `check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db`, `build`.
- [ ] Checks do Netlify (`Redirect rules`, `Header rules`) verdes; `Pages changed` neutro é aceito.
- [ ] Sem falha de segurança/autorização e sem thread de review bloqueante aberta.
- [ ] Migration nova revisada e coberta por `test:db`; versão **maior** que a última da `main` (hoje `20261127000000`); migration já aplicada nunca é editada.
- [ ] Teste de regressão para cada bug corrigido (escreva o teste que falha antes da correção).
- [ ] `CHANGELOG.md` atualizado em `## [Unreleased]` (seções: Adicionado, Alterado, Corrigido, Segurança, Removido, Depreciado).
- [ ] Squash merge com `expected_head_sha`, título em Conventional Commits.
- [ ] Depois do merge: registrar o SHA do merge, conferir o vínculo com issues e o status da branch.

Teste manual/real pendente do responsável **não** bloqueia merge se o checklist acima estiver verde e o item for documentado como pendência. A autorização da seção 0 cobre todas as PRs desta rodada; as decisões da seção 7 continuam do responsável, mas dizem respeito a ações no ambiente real, não a merges.

## 6. Convenções

**Commits (Conventional Commits 1.0):** `<tipo>(<escopo>): <resumo no imperativo, minúsculo, até 72 caracteres>`

- Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `chore`, `revert`.
- Escopos usados no projeto: `booking`, `auth`, `calendar`, `db`, `security`, `provider-admin`, `public`, `customer`, `design`, `coordination`.
- Corpo explica o **porquê**; rodapé: `Refs #N` por padrão, `Closes #N` **somente** quando o critério de aceite estiver 100% cumprido; mudança incompatível usa `!` e `BREAKING CHANGE:`.
- Um commit = uma mudança lógica. Exemplos: `fix(booking): keep redirect outside try/catch in bookSlotAction`, `test(db): wire privileges matrix check into test:db`, `chore(coordination): record agent 2 progress`.

**Pull requests:** pequenas e focadas; descrição com contexto, mudanças, evidências (comandos e resultados no SHA exato), riscos e pendências; sem alterações alheias ao escopo.

**Fechamento de issue:** só com aceite comprovado ou substituição inequívoca; comentário com links da PR/commit/teste. Roadmap não implementado permanece aberto com status e próxima ação.

**Ambiente de validação local:** `npm install --no-audit --no-fund --legacy-peer-deps` e depois, nesta ordem: `npm run check:changelog`, `lint`, `typecheck`, `audit`, `test`, `test:db`, `build`.

## 7. Decisões que dependem do responsável

1. Leitura/revisão posterior da #133 (consolidação da arquitetura social) — já autorizada para merge se o CI estiver verde (seção 0).
2. Validação real da recuperação de senha e conferência da configuração do Supabase Auth (#130/#70); rotação das credenciais OAuth/SMTP expostas anteriormente.
3. Conexão real do Google Calendar, variáveis de produção e ativação de qualquer scheduler (`BOOKING_EXPIRATION_ENABLED`, lembretes, worker do Calendar).
4. Provisionamento de Supabase/cron/ambientes/deploy (#30, #20).
5. Escopo do roadmap Marcou Social (#72–#112): manter como backlog ou priorizar.
6. Publicar (ou não) uma GitHub Release ao final.

## 8. Definição de pronto da rodada

- Nenhuma PR aberta sem classificação e próximo passo; nenhuma PR aberta dependendo de algo já resolvido.
- Branches: apenas `main`, `coordination/agents`, branches de PR aberta e branches preservadas com motivo registrado.
- Issues: fechadas com evidência, ou abertas com status/próxima ação; pendências do responsável listadas.
- Relatório final do Agente 6 no `state.json` com SHAs verificados, o que ficou pendente e a pergunta sobre release.

## 9. Instruções por agente (rodada 7)

Todos: leiam `.agent-coordination/state.json` (branch `coordination/agents`) e este runbook, assumam o slot do seu número, reconfirmem `main`/PR/CI no GitHub e escrevam **somente** a sua entrada (`agent_N_r7_*`). Autonomia de merge: seção 0. Regras: seção 4. Checklist: seção 5. Um merge por vez.

### Agent 1 — Reservas (#131, #124, #68) · entrada `agent_1_r7_booking`
- **P0 da rodada:** a #131 destrava o Agent 4 (#136), a #124 e a #68. Comece por ela.
- #131: atualizar com a `main`, resolver o conflito, corrigir a regressão do `redirect` dentro de `try/catch` (escreva primeiro o teste que falha), fazer a UI refletir múltiplos serviços, manter compatibilidade com reservas de 1 serviço (`serviceId`/`serviceIds` legados). Migration com versão **maior** que `20261127000000`. Mergear quando verde e **avisar no `state.json`** (SHA do merge e qual migration entrou) para o Agent 4.
- #124 (após #131): parser BRL com milhar (B3), sinal, ações por papel (B4); autorização continua no banco.
- #68 (após #124/#131): confirmação e `.ics` corretos com vários serviços, duração e preço totais.
- Fechar as issues cobertas (#21, #22, etc.) **somente** com aceite comprovado.

### Agent 2 — Autenticação (#127, #130) · entrada `agent_2_r7_auth`
- #127: pronta e limpa; atualizar com a `main`, rodar a suíte completa e **mergear primeiro**.
- #130: reconstruir sobre a `main` já com a #127 (origem confiável, `redirectTo`, `token_hash`/`type=recovery`, code/PKCE, sem open redirect nem loop produção/preview). Só testes com mocks; **nenhum e-mail real**, nenhuma chamada ao Supabase remoto.
- Issues #70/#23: comentar evidência; o que depende de validação real em produção fica aberto como pendência do responsável.

### Agent 3 — Schedulers e operação (#38, #32) · entrada `agent_3_r7_ops_schedulers`
- #38 e #128 já estão na `main`. Confirme que existe **um único** mecanismo canônico de expiração/lembretes (sem scheduler duplicado) e que a documentação (`docs/BOOKING-EXPIRATION-SCHEDULER.md`, `docs/NOTIFICACOES.md`) reflete o estado real. Corrija lacunas com teste.
- #32: triagem. Reaproveite apenas o que ainda falta (inventário, CI) em PR pequena sobre a `main` atual, ou feche como superada com evidência.
- **Nenhum scheduler é ativado** (`BOOKING_EXPIRATION_ENABLED` e lembretes permanecem desligados). Ativação é do responsável.

### Agent 4 — Privilégios do banco e Calendar (#136, #41) · entrada `agent_4_r7_security_calendar`
- Comece pelas tarefas independentes: auditar o Calendar já mergeado (#135) e as branches antigas dele; verificar se a #41 foi superada por #117/#135 e **fechar com evidência** se sim.
- #136: depois que o Agent 1 mergear a #131, atualizar, resolver a dependência da migration, ligar o `privileges-check` ao CI/`test:db`, mergear quando verde. Fechar a #125 se o aceite estiver cumprido.
- A #126 está fechada; **não refaça**. Os seis arquivos staged locais do Calendar são intocáveis.

### Agent 5 — Design, docs e backlog de produto (#133, #67, #46, #2) · entrada `agent_5_r7_product_backlog`
- #46 e #2: provavelmente superadas. Fechar com evidência (commit/PR que já contém o conteúdo).
- #133: resolver o conflito, rodar o CI, **mergear se verde** (seção 0) e deixar na PR um resumo curto para o responsável.
- #67: atualizar com a `main`, validar e integrar se os critérios forem atendidos.
- Triagem das issues de produto/roadmap (#72–#112 e afins): **não fechar para reduzir contagem**; cada uma fica aberta com status e próxima ação, salvo duplicata/substituída comprovada.

### Agent 6 — Auditor independente, limpeza final e relatório · entrada `agent_6_r7_coordinator`
- **Não implementa** o trabalho dos Agents 1–5. Audita cada alegação contra o GitHub (SHA exato, CI no SHA, SHA do merge, vínculo com issue, estado da branch) e mantém a ordem de merges.
- Onda 4 (só depois dos merges): apagar branches **comprovadamente integradas** (PR `MERGED` + tip remoto igual ao `headRefOid`, ou sem commits exclusivos). Preservar `main`, `coordination/agents`, branches de PR aberta e branches com trabalho exclusivo, com o motivo registrado. Autoridade para apagar branches: seção 0.
- Relatório final no `state.json`: SHAs verificados, PRs mergeadas/fechadas, issues, branches removidas/preservadas, pendências do responsável (seção 7) e a **pergunta sobre GitHub Release** (ver `AGENTS.md`; sem autorização explícita, nada de tag nem Release).
