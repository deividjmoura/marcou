# Padrão de escopo e de entrega — Marcou

Este documento define **como uma tarefa é especificada, executada e entregue**. Vale para todos os agentes e colaboradores. Ele complementa `AGENTS.md`, `CONTRIBUTING.md` e o runbook `docs/FECHAMENTO-AGENTES.md`.

Princípio central: **uma issue só começa quando o resultado esperado é verificável, e só termina quando há evidência.** Não se declara pronto o que não foi executado.

## 1. Definition of Ready (antes de começar uma issue)

Antes de escrever código, o agente confirma, e registra na PR ou na issue:

1. **Situação real na `main`.** Auditar o código atual (rotas, migrations, testes) e separar o que já existe do que falta. Issues antigas citam PRs fechadas e nomes que mudaram: reconfirme tudo.
2. **Escopo fechado.** Lista de entregas concretas, com o que fica **fora**. Se a issue é grande, dividir em PRs pequenas (uma mudança lógica por PR).
3. **Dependências resolvidas.** Se depende de outra issue/PR aberta, tratar nessa ordem ou declarar o bloqueio no `state.json`.
4. **Decisões do responsável identificadas.** Se o escopo exige escolha de produto, provedor, retenção de dados ou ação em ambiente real, parar nesse ponto, registrar como `OWNER_DECISION` e entregar o que independe da decisão.
5. **Riscos de segurança e privacidade mapeados** (seção 4).

## 2. Definition of Done (para integrar)

Além do checklist da seção 5 do runbook:

- Cada critério de aceite tem **evidência**: teste automatizado, comando executado com resultado real, ou inspeção descrita (viewport, rota, resultado). Sem evidência, o critério não está cumprido.
- **Regressão primeiro:** para cada bug, o teste que falha antes da correção.
- Casos de borda e de falha cobertos, não só o caminho feliz.
- Documentação atualizada onde o comportamento muda (`docs/`, `CHANGELOG.md`).
- Pendências reais (inclusive testes manuais que cabem ao responsável) listadas na PR como pendência, nunca escondidas.
- Issue fechada **somente** com aceite comprovado ou substituição inequívoca, com link da PR/commit.

## 3. Modelo de escopo (para escrever ou refinar uma issue)

```
## Objetivo            (1–2 frases: problema do usuário, não solução técnica)
## Situação verificada (o que já existe na main, com caminhos/PRs)
## Entregas            (lista numerada, cada item testável)
## Abordagem técnica   (decisões, contratos, migrations, com alternativas descartadas)
## Critérios de aceite (checklist verificável; inclui borda, erro e autorização)
## Testes              (quais, onde, como rodar)
## Fora de escopo
## Dependências e ordem
## Decisão do responsável (se houver)
## Riscos
```

## 4. Guardrails permanentes

**Segurança e dados**
- Identidade vem de `auth.uid()`; ownership de `providers.owner_id`. O cliente nunca informa quem ele é, preço, duração ou estado.
- RLS em toda tabela nova, com teste de isolamento entre dois usuários/prestadores.
- Funções `SECURITY DEFINER`: `search_path = pg_catalog, public`, `REVOKE EXECUTE` de `PUBLIC`/`anon`/`authenticated` na própria migration e grant mínimo (ver `docs/SECURITY-DEFINER-GRANTS.md`).
- Nunca expor telefone, e-mail ou identificadores de terceiros em listagens, URLs públicas ou payloads além do necessário.
- Nenhum segredo, token, link de recuperação ou dado pessoal em código, log, PR, comentário ou `state.json`.
- Entrada externa (upload, webhook, query string, `redirect`) é validada no servidor, com lista de permitidos, nunca só no cliente.

**Banco**
- Migration nova tem versão **maior** que a última da `main`. Migration já mergeada nunca é editada: correção vai em migration nova.
- Aditivas e reversíveis sempre que possível; descrever rollback.
- Toda migration é coberta por `npm run test:db`.

**Ambiente real**
- Agentes não aplicam migrations remotas, não alteram Netlify/Supabase/Google Cloud/OAuth/SMTP, não ativam schedulers, não enviam e-mail ou notificação real e não criam tag/Release sem autorização explícita.
- Funcionalidade que depende de ambiente real entra **desligada por padrão** (flag fail-closed) e com instrução de ativação em `docs/`.

**Qualidade de interface**
- Estados distintos: carregando, vazio, erro (com retry) e sucesso. Nunca dado fictício no fluxo real.
- Acessibilidade: teclado, foco visível, rótulos, contraste (AA) e `prefers-reduced-motion`.
- Responsivo (verificar 390 px e 1440 px, sem rolagem horizontal).
- Dependência nova só com justificativa: licença, peso, manutenção e alternativa sem dependência.

**Domínio de reservas**
- Backend e PostgreSQL são a única autoridade de disponibilidade, preço, duração e transições. A interface não simula suporte inexistente.
- Compatibilidade com reservas antigas de um serviço é requisito, não opcional.

## 5. Como priorizar

Ordem de decisão, do mais importante ao menos:

1. **Segurança e integridade de dados** (vazamento, autorização, corrida em reservas).
2. **Caminho crítico do negócio:** profissional cadastra → configura serviços → publica link → cliente reserva → ambos são notificados.
3. **Destravadores:** o que desbloqueia várias outras tarefas.
4. **Operação segura em produção** (jobs, observabilidade, rollback).
5. **Experiência e polimento** (design, temas, atalhos).
6. **Roadmap social** (#72–#112): só avança por marcos, na ordem do `docs/ROADMAP-MARCOU-SOCIAL.md`, e cada issue passa pelo refinamento da seção 6 antes de começar.

## 6. Refinamento sob demanda (roadmap social)

Issues de roadmap distantes **não** são detalhadas antecipadamente: o detalhe envelhece. Antes de iniciar uma issue `#80–#112`, o agente posta na própria issue um comentário "Escopo refinado" no modelo da seção 3, baseado no estado **atual** da `main`, e só então implementa. Cada issue folha continua planejando uma PR principal.

## 7. Registro e coordenação

- Cada agente lê `.agent-coordination/state.json` antes de agir e escreve **somente** a própria entrada.
- Registrar: SHA exato, resultado real de CI/testes, bloqueios e próxima ação. O que não foi verificado é marcado como não verificado.
- Um merge por vez; depois do merge, avisar para os demais atualizarem a branch.
- Comentário de issue com "Escopo refinado" tem prioridade sobre o corpo original quando houver divergência; o corpo original é histórico.
