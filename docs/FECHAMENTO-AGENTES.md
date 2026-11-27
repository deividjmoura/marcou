# Fechamento de pontas abertas — runbook dos agentes (rodada 7)

> **Fonte de verdade viva:** `.agent-coordination/state.json` na branch `coordination/agents`.
> Este documento é o runbook estável (regras, ordem, critérios). O estado volátil (SHAs, CI, status por agente) fica **somente** no `state.json`.
> Snapshot de referência: 2026-11-27, `main` = `6f6f4cd`. Sempre reconfirme a `main` atual antes de agir.

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
| #128 | rascunho, limpa | 3 | reconciliar com #38 (um único mecanismo de expiração) |
| #38 | rascunho, limpa | 3 | idempotência diária por timezone, retries, documentação |
| #32 | pronta, conflito, 132 atrás | 3 | triagem: reaproveitar o que falta ou fechar como superada |
| #136 | rascunho; `test:db` falha: espera migration que só existe na #131 | 4 | após decisão da migration em #131; ligar `privileges-check` ao CI |
| #41 | rascunho, conflito, 104 atrás | 4 | provável superada por #117/#135; fechar com evidência |
| #133 | pronta, conflito, **revisão do responsável exigida** | 5 | resolver conflito e preparar resumo; **não mergear sem aprovação** |
| #67 | rascunho, limpa, 34 atrás | 5 | atualizar, validar, integrar se critérios atendidos |
| #46 | conflito, 95 atrás, 1 arquivo | 5 | provável fechar como superada |
| #2 | rascunho, base `feat/pagina-publica-agendamento` | 5 | provável fechar como superada |

Já integrado e **não deve ser refeito**: #134 (harness de concorrência no `test:db`), #135 (Calendar #29 + endurecimento de privilégios #125), #39 (agenda do prestador), #129 (lock de transição). A PR #126 está **fechada** (substituída pela #135).

## 3. Ordem de execução

1. **Onda 0 (paralelo):** Agente 2 → #127; Agente 3 → decidir canônico entre #128/#38; Agente 1 → corrigir #131; Agente 5 → fechar #46/#2 (com evidência) e resolver #133; Agente 4 → auditar #41 e branches de Calendar; Agente 6 → baseline independente.
2. **Onda 1:** merge da #131 (destrava Agente 4, #124 e #68).
3. **Onda 2:** #136, #124, #130 (após #127), #128 → #38.
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

Teste manual/real pendente do responsável **não** bloqueia merge se o checklist acima estiver verde e o item for documentado como pendência. Itens marcados `OWNER_DECISION` **não** são mergeados sem aprovação explícita.

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

1. Revisão da #133 (consolidação da arquitetura social).
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
