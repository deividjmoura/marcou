# Atualização de estado verificada — 15/11/2026

## Delegação do terceiro agente — Issue #30 PLATFORM

**Status da delegação:** instrução preparada em 15/11/2026.  
**Issue:** https://github.com/deividjmoura/marcou/issues/30  
**Branch obrigatória:** `feat/30-platform-hardening`, criada a partir da `main` atualizada.

### Contexto e limites para trabalho paralelo
- O primeiro agente está trabalhando na Issue #21, branch `feat/21-booking-multiple-services`. Não tocar nessa branch, migration, RPCs, lógica de reservas ou arquivos que ele estiver modificando.
- O segundo agente recebeu a Issue #27, Design System, branch `feat/27-design-system`. Não alterar tokens, componentes visuais, fontes, ícones ou documentação que ele estiver modificando.
- PRs #1, #2 e #4 permanecem abertas em draft. Não alterar suas branches nem fazer merge.
- A Issue #30 está aberta e trata de infraestrutura. Esta delegação começa com auditoria e hardening seguro/documental, sem mudanças remotas.

### Objetivo do terceiro agente
Auditar e fortalecer a base operacional do Marcou: configuração de ambientes, segurança de secrets, CI, documentação de deploy/rollback, backup e observabilidade. Preparar recomendações e alterações locais seguras, sem executar operações no Supabase ou Vercel de produção.

### Instruções obrigatórias
1. Ler integralmente este documento e a Issue #30. Auditar a `main` atualizada, scripts, workflows, configuração Supabase/Vercel e documentação existente antes de alterar arquivos.
2. Criar `feat/30-platform-hardening` a partir da `main` atual. Não trabalhar na `main` nem nas branches dos outros agentes.
3. Começar com um inventário: ambientes existentes, variáveis necessárias, workflows CI, scripts de build/teste, migrations, cron/jobs, deploy e observabilidade. Distinguir claramente o que foi verificado no repositório do que depende de acesso externo.
4. Criar uma matriz de variáveis por ambiente (local, preview/staging e produção), identificando quais são públicas e quais são secrets. Documentar nomes e finalidade, nunca valores reais. Não copiar tokens, chaves, connection strings ou conteúdo de arquivos `.env` para commits, issues, logs ou PR.
5. Verificar se secrets estão sendo expostos no bundle/client, logs ou Git. Se encontrar segredo real versionado, não o reproduzir nem tentar rotacionar por conta própria: documentar o caminho/risco sem valor e orientar o responsável sobre rotação segura.
6. Revisar workflows GitHub Actions e scripts para que lint, typecheck, testes disponíveis e build sejam executados com gates claros. Corrigir apenas problemas de CI/configuração isolados e comprováveis. Não enfraquecer checks, não usar `continue-on-error` para esconder falhas e não inventar resultados.
7. Documentar o fluxo recomendado de deploy para preview/staging/produção, checklist pré-deploy, smoke tests, rollback e recuperação. Identificar quais passos são automáticos e quais exigem ação/credenciais do responsável.
8. Documentar estratégia de backup/restore e observabilidade compatível com os serviços realmente configurados. Não afirmar que backups, alertas ou monitoramento estão ativos sem evidência.
9. Coordenar dependências com #21 e #26 apenas por documentação/comentários. Não implementar jobs de expiração/lembrete nesta tarefa enquanto os contratos de domínio e notificações estiverem em desenvolvimento. Pode preparar checklist técnico e requisitos de segurança/idempotência.
10. **Proibido nesta tarefa:** aplicar migrations; executar SQL que altere dados; modificar projeto Supabase remoto; alterar configurações, domínios, secrets, variáveis ou deployments da Vercel; promover deploy; mudar Auth/RLS; alterar banco de produção. Qualquer ação externa exige autorização explícita posterior do responsável.
11. Não tocar nos arquivos de UI/Design System do agente #27, nem nos arquivos de booking/migrations do agente #21. Se precisar documentar esses pontos, fazê-lo em seção própria e sem editar os arquivos de implementação deles.
12. Executar localmente os checks pertinentes que estiverem disponíveis. Registrar comandos e resultados reais, incluindo limitações por ausência de credenciais/serviços.
13. Abrir PR em draft para `main`, vinculada à Issue #30. Usar `Closes #30` somente quando os critérios desta entrega estiverem efetivamente concluídos; caso contrário, manter aberta e listar pendências. Não fazer merge.
14. Ao concluir, atualizar o JSON de estado e esta seção com branch, commits, PR, arquivos, checks, riscos e ações que ainda dependem do responsável. Buscar a versão mais recente deste documento antes de atualizá-lo e preservar os handoffs dos outros agentes.

### Critérios de aceite
- Inventário de plataforma verificável e com lacunas explicitadas.
- Matriz de variáveis por ambiente sem valores secretos.
- CI documentado e, quando possível, com gates reproduzíveis.
- Procedimentos de deploy, smoke test, rollback e recuperação documentados.
- Backup/observabilidade descritos sem alegações não comprovadas.
- Nenhuma alteração remota ou de produção realizada.
- PR pequena, revisável e sem conflitos com #21 ou #27.

**Limite de escopo:** não implementar funcionalidades de produto, jobs de domínio ou mudanças de infraestrutura remota. A execução operacional será uma etapa separada, após revisão e autorização do responsável.

---


## Delegação do segundo agente — Issue #27 DESIGN-SYSTEM

**Status da delegação:** instrução preparada em 15/11/2026.  
**Issue:** https://github.com/deividjmoura/marcou/issues/27  
**Branch obrigatória:** `feat/27-design-system`, criada a partir da `main` atualizada.

### Contexto verificado antes da delegação
- A Issue #21 está sendo trabalhada na branch `feat/21-booking-multiple-services` (head observado: `49358e14122fe0f1d749e8dd351d110dff7aed77`), com dois commits e sem PR localizada até esta verificação.
- A comparação dessa branch com `main` mostrou somente o arquivo `supabase/migrations/202611150004_booking_multiple_services.sql` (26 linhas); a versão consultada contém um comentário indicando que o conteúdo completo viria em atualizações posteriores. Portanto, #21 continua em andamento e pertence exclusivamente ao primeiro agente. **Não editar nem validar como concluída a branch dele.**
- A branch `design/identidade-visual` está 23 commits atrás de `main`, sem commits exclusivos. Não a usar como base nem atualizá-la.
- PR #1 e PR #2 continuam abertas em draft, encadeadas sobre a branch de design/prévia. PR #4 continua aberta em draft e independente. Preservar todas.

### Objetivo do segundo agente
Concluir a fundação do Design System do Marcou: tokens visuais, tipografia, componentes reutilizáveis e documentação, seguindo a direção aprovada de bege, branco e rosé, com contraste e acessibilidade.

### Instruções obrigatórias
1. Ler integralmente este documento e a Issue #27; auditar `main`, `design/identidade-visual`, PRs #1/#2/#4 e os arquivos realmente alterados nelas antes de editar.
2. Criar `feat/27-design-system` diretamente a partir da `main` atual. Não trabalhar na `main`, na branch antiga `design/identidade-visual`, nem nas branches das PRs abertas ou do agente #21.
3. Trabalhar somente no sistema visual compartilhado: tokens CSS, tema, tipografia, primitives/componentes reutilizáveis, estados visuais e documentação/catálogo. Não reimplementar a página pública, calendário, fluxo de reservas, autenticação ou regras de negócio.
4. Antes de alterar cada arquivo, verificar se ele aparece nos diffs das PRs #1/#2/#4 ou na branch #21. Evitar esses arquivos. Se uma mudança compartilhada for inevitável, documentar o motivo e não editar arquivos de terceiros; preferir criar uma camada compatível e independente.
5. Auditar a identidade visual já existente e manter coerência com o produto: bege, branco e rosé. Definir tokens sem espalhar valores arbitrários; validar contraste WCAG, foco visível, hover, disabled, erro, sucesso e estados de carregamento.
6. Explorar fontes no Free Faces Gallery, mas só adotar fonte com licença compatível, arquivo/pacote confiável, fallback e impacto de performance aceitáveis. Registrar a licença e a decisão; não baixar assets de origem duvidosa.
7. Avaliar ícones animados da LottieFlow/LottieFiles com parcimônia. Não introduzir dependência pesada ou assets sem licença verificada. Fornecer fallback estático e respeitar `prefers-reduced-motion`; animação nunca pode ser necessária para compreender uma ação.
8. Padronizar apenas componentes realmente compartilhados e existentes/necessários (por exemplo: Button, Input, Card, Badge, Dialog/Modal, feedback e navegação). Preservar APIs existentes ou documentar migração compatível; não fazer refactor amplo de todas as telas.
9. Criar documentação visual com tokens, tipografia, exemplos de uso, estados, regras de acessibilidade e decisões de licença. Se útil, criar uma página de catálogo isolada, sem alterar rotas de produção.
10. Executar lint, typecheck, testes e build disponíveis. Incluir verificações de contraste/acessibilidade pertinentes e relatar exatamente o que foi executado; não declarar validação que não ocorreu.
11. Abrir PR em draft para `main`, vinculada à Issue #27. Usar `Closes #27` somente se todos os critérios da issue estiverem completos; caso contrário, explicar o que falta e manter aberta. Não fazer merge.
12. Não aplicar migrations, não alterar Supabase remoto, não fazer deploy de produção e não modificar variáveis/segredos.
13. Ao finalizar, registrar arquivos, commits, PR, testes, licenças/fontes/assets e pendências. Para atualizar este documento compartilhado, buscar a versão mais recente da `main` e aplicar uma alteração pequena que preserve o handoff do agente #21; nunca sobrescrever atualizações concorrentes nem forçar push.

### Critérios de aceite
- Tokens de cor, tipografia, espaçamento, raios, sombras e estados documentados e reutilizáveis.
- Componentes compartilhados consistentes, responsivos e sem regressões conhecidas.
- Contraste, foco por teclado e estados interativos verificados.
- Animações com fallback e suporte a movimento reduzido.
- Fontes e ícones com licença/impacto avaliados.
- Lint, typecheck, testes e build executados, com resultados registrados.
- PR revisável, limitada ao Design System e sem tocar no trabalho dos outros agentes.

**Limite de escopo:** qualquer melhoria de tela ou fluxo de negócio deve virar issue separada; não ampliar a #27 por conta própria.

---


- PR #3 (motor de reservas) e PR #5 (notificações internas): **merged em `main`**, com merge commits confirmados.
- PRs #1, #2 e #4: continuam **abertas em draft**. #1 e #2 são PRs encadeadas; #4 é independente e aguarda CI/revisão. Não fazer merge sem autorização.
- Issues antigas duplicadas foram fechadas com motivo `duplicate` e comentário de encaminhamento: #6 → #23; #7 → #21; #9 → #24; #10 → #25; #11 → #28; #12 → #25/#26; #14 → #31; #15 → #30; #16 → #22/#27/#31; #17 → #31; #18 → #29.
- Permanecem abertas por terem escopo próprio ou aguardarem definição: #8, #13, #19 e #20, além do backlog organizado #21–#31.
- A branch `docs/proxima-etapa-multisservicos-expiracao` contém apenas commits de documentação e está divergente de `main`; não foi integrada nem alterada. As branches `arena/*` correspondem a PRs já integradas e não foram apagadas.
- A auditoria de código confirmou que o fluxo público atual em `main` ainda seleciona **um serviço por reserva**. O suporte a múltiplos serviços permanece pendente na #21. A migration remota do Supabase não foi aplicada.

---

# Estado estruturado do projeto (JSON válido)

```json
{
  "project": "Marcou",
  "repository": "deividjmoura/marcou",
  "updated_at": "2026-11-15",
  "default_branch": "main",
  "architecture": {
    "frontend": "Next.js 16 / React 19 / TypeScript",
    "auth_database": "Supabase Auth / PostgreSQL",
    "hosting": "Vercel (configured/expected; verify environment)"
  },
  "areas": {
    "BOOKING": {
      "status": "backlog_open",
      "issues": [
        21
      ]
    },
    "PUBLIC-FLOW": {
      "status": "backlog_open",
      "issues": [
        22
      ]
    },
    "IDENTITY": {
      "status": "em_andamento",
      "issues": [
        23
      ],
      "branch": "feat/23-identity-auth-profile"
    },
    "PROVIDER-ADMIN": {
      "status": "backlog_open",
      "issues": [
        24
      ]
    },
    "BOOKING-OPS": {
      "status": "backlog_open",
      "issues": [
        25
      ]
    },
    "NOTIFICATIONS": {
      "status": "backlog_open",
      "issues": [
        26
      ]
    },
    "DESIGN-SYSTEM": {
      "status": "backlog_open",
      "issues": [
        27
      ]
    },
    "PAYMENTS": {
      "status": "backlog_open",
      "issues": [
        28
      ]
    },
    "CALENDAR-INTEGRATION": {
      "status": "backlog_open",
      "issues": [
        29
      ]
    },
    "PLATFORM": {
      "status": "backlog_open",
      "issues": [
        30
      ]
    },
    "QUALITY": {
      "status": "backlog_open",
      "issues": [
        31
      ]
    }
  },
  "pull_requests": [
    {
      "number": 1,
      "status": "open_status_to_verify",
      "area": [
        "PUBLIC-FLOW",
        "DESIGN-SYSTEM"
      ],
      "url": "https://github.com/deividjmoura/marcou/pull/1"
    },
    {
      "number": 2,
      "status": "open_status_to_verify",
      "area": [
        "PUBLIC-FLOW",
        "BOOKING"
      ],
      "url": "https://github.com/deividjmoura/marcou/pull/2"
    },
    {
      "number": 3,
      "status": "merged",
      "area": [
        "BOOKING"
      ],
      "url": "https://github.com/deividjmoura/marcou/pull/3"
    },
    {
      "number": 4,
      "status": "open_status_to_verify",
      "area": [
        "PUBLIC-FLOW",
        "BOOKING"
      ],
      "url": "https://github.com/deividjmoura/marcou/pull/4"
    },
    {
      "number": 5,
      "status": "merged",
      "area": [
        "NOTIFICATIONS"
      ],
      "url": "https://github.com/deividjmoura/marcou/pull/5"
    },
    {
      "number": 33,
      "status": "open_draft",
      "area": [
        "IDENTITY"
      ],
      "head": "feat/23-identity-auth-profile",
      "base": "main",
      "url": "https://github.com/deividjmoura/marcou/pull/33"
    },
    {
      "number": 32,
      "status": "open",
      "area": [
        "PLATFORM"
      ],
      "head": "feat/30-platform-hardening",
      "base": "main",
      "url": "https://github.com/deividjmoura/marcou/pull/32",
      "note": "PR do agente #30; também atualiza AGENT_TASK_MARCOU.md."
    }
  ],
  "rules": {
    "no_empty_pull_requests": true,
    "every_issue_owned_by_one_area_agent": true,
    "branch_per_issue": true,
    "link_pull_request_to_issue": true,
    "no_merge_without_owner_approval": true,
    "no_remote_supabase_migrations_without_owner_approval": true,
    "whatsapp_phase": "deferred"
  },
  "identity_delivery": {
    "status": "implementado_nao_verificado",
    "branch": "feat/23-identity-auth-profile",
    "head_commit": "b311dae6be6e9f335750edf8c856ddec57540059",
    "pull_request": 33,
    "note": "Cadastro/login existentes preservados; perfil/telefone, recuperação de senha e callback Supabase implementados. Google Cloud/Supabase provider ainda depende de configuração do responsável.",
    "tests": {
      "lint": "success — CI run #43775254043",
      "typecheck": "success — CI run #43775254043",
      "unit": "success — CI run #43775254043",
      "database": "success — CI run #43775254043",
      "build": "success — CI run #43775254043"
    },
    "ci_run": "https://github.com/deividjmoura/marcou/actions/runs/43775254043"
  }
}
```

---

```json
{
  "schema_version": "1.0.0",
  "updated_at": "2026-11-15",
  "project": {
    "name": "Marcou",
    "repository": "deividjmoura/marcou",
    "default_branch": "main"
  },
  "architecture": {
    "frontend": "Next.js 16 App Router + React 19 + TypeScript",
    "backend": "Supabase Auth + PostgreSQL + Storage",
    "hosting": "Vercel",
    "tests": [
      "Vitest",
      "embedded PostgreSQL"
    ]
  },
  "status_legend": [
    "concluido_verificado",
    "implementado_nao_verificado",
    "em_andamento",
    "planejado",
    "bloqueado"
  ],
  "integrated_features": [
    {
      "name": "Motor básico de agendamentos",
      "status": "concluido_verificado",
      "pull_request": 3,
      "merge_commit": "03ac75bc69bda0c63cc08c699cb6d49b6396fd17"
    },
    {
      "name": "Notificações internas",
      "status": "concluido_verificado",
      "pull_request": 5,
      "merge_commit": "ca9b73f7b43efeba759fafc12214fc806bfb24d0",
      "note": "Testes reportados em banco embutido; Supabase remoto não validado."
    }
  ],
  "open_pull_requests": [
    {
      "number": 1,
      "title": "Página pública de agendamento (prévia)",
      "status": "open_draft",
      "head": "feat/pagina-publica-agendamento",
      "base": "design/identidade-visual",
      "url": "https://github.com/deividjmoura/marcou/pull/1",
      "note": "Protótipo visual; validar integração real."
    },
    {
      "number": 2,
      "title": "Calendário mobile (prévia)",
      "status": "open_draft",
      "head": "feat/calendario-mobile",
      "base": "feat/pagina-publica-agendamento",
      "url": "https://github.com/deividjmoura/marcou/pull/2",
      "note": "PR encadeada na #1; conferir dependência antes de integrar."
    },
    {
      "number": 4,
      "title": "Calendário resiliente",
      "status": "open_draft",
      "head": "fix/calendario-disponibilidade-resiliente",
      "base": "main",
      "url": "https://github.com/deividjmoura/marcou/pull/4",
      "note": "Preservar branch; revisar diff/CI antes de integrar."
    },
    {
      "number": 33,
      "title": "[IDENTITY] Completar perfil, recuperação de senha e callback Supabase",
      "status": "open_draft",
      "head": "feat/23-identity-auth-profile",
      "base": "main",
      "url": "https://github.com/deividjmoura/marcou/pull/33",
      "note": "Google OAuth ponta a ponta e SMTP dependem de configuração externa; CI em execução."
    },
    {
      "number": 32,
      "title": "[PLATFORM] Hardening operacional, inventário e CI — Issue #30",
      "status": "open",
      "head": "feat/30-platform-hardening",
      "base": "main",
      "url": "https://github.com/deividjmoura/marcou/pull/32",
      "note": "PR aberta; compartilha atualização de AGENT_TASK_MARCOU.md com PR #33."
    }
  ],
  "completed_pull_requests": [
    {
      "number": 3,
      "status": "merged",
      "url": "https://github.com/deividjmoura/marcou/pull/3"
    },
    {
      "number": 5,
      "status": "merged",
      "url": "https://github.com/deividjmoura/marcou/pull/5"
    }
  ],
  "supabase": {
    "project_id": "peornypgltuueubmsucm",
    "region": "South America (São Paulo)",
    "migrations_remote_applied": false,
    "remote_validation": "not_verified"
  },
  "open_issues": [
    {
      "number": 6,
      "area": "AUTH",
      "title": "Autenticação de clientes e recuperação de senha",
      "url": "https://github.com/deividjmoura/marcou/issues/6"
    },
    {
      "number": 7,
      "area": "BOOKING",
      "title": "Seleção e agendamento de múltiplos serviços",
      "url": "https://github.com/deividjmoura/marcou/issues/7"
    },
    {
      "number": 8,
      "area": "CALENDAR",
      "title": "Calendário resiliente e disponibilidade real",
      "url": "https://github.com/deividjmoura/marcou/issues/8"
    },
    {
      "number": 9,
      "area": "PROVIDER",
      "title": "Configuração do negócio, expediente e bloqueios",
      "url": "https://github.com/deividjmoura/marcou/issues/9"
    },
    {
      "number": 10,
      "area": "BOOKING",
      "title": "Gestão de reservas e transições de status",
      "url": "https://github.com/deividjmoura/marcou/issues/10"
    },
    {
      "number": 11,
      "area": "PAYMENTS",
      "title": "Pagamento e comprovantes",
      "url": "https://github.com/deividjmoura/marcou/issues/11"
    },
    {
      "number": 12,
      "area": "NOTIFICATIONS",
      "title": "Automatizar lembretes e expiração",
      "url": "https://github.com/deividjmoura/marcou/issues/12"
    },
    {
      "number": 13,
      "area": "NOTIFICATIONS",
      "title": "Preferências e canais de notificação",
      "url": "https://github.com/deividjmoura/marcou/issues/13"
    },
    {
      "number": 14,
      "area": "SECURITY",
      "title": "Auditoria de RLS e SECURITY DEFINER",
      "url": "https://github.com/deividjmoura/marcou/issues/14"
    },
    {
      "number": 15,
      "area": "SUPABASE",
      "title": "Integração remota e validação de migrations",
      "url": "https://github.com/deividjmoura/marcou/issues/15"
    },
    {
      "number": 16,
      "area": "UX",
      "title": "Experiência mobile e acessibilidade",
      "url": "https://github.com/deividjmoura/marcou/issues/16"
    },
    {
      "number": 17,
      "area": "QUALITY",
      "title": "Testes E2E, CI e release",
      "url": "https://github.com/deividjmoura/marcou/issues/17"
    },
    {
      "number": 18,
      "area": "INTEGRATIONS",
      "title": "Google Calendar (fase posterior)",
      "url": "https://github.com/deividjmoura/marcou/issues/18"
    },
    {
      "number": 19,
      "area": "INTEGRATIONS",
      "title": "WhatsApp (fase posterior)",
      "url": "https://github.com/deividjmoura/marcou/issues/19"
    },
    {
      "number": 20,
      "area": "RELEASE",
      "title": "Deploy, observabilidade e operação",
      "url": "https://github.com/deividjmoura/marcou/issues/20"
    }
  ],
  "critical_rules": [
    "Não criar PR vazia: PR só quando existir branch com implementação revisável.",
    "Não fazer merge, deploy ou aplicar migrations remotas sem autorização explícita.",
    "Não sobrescrever branches/PRs de outros agentes.",
    "Atualizar este documento ao encerrar cada entrega.",
    "Nunca registrar segredos."
  ],
  "identity_delivery": {
    "status": "implementado_nao_verificado",
    "issue": 23,
    "branch": "feat/23-identity-auth-profile",
    "commits": [
      "46d0fda77d2028cc9ad50eb15a9853cb23b116a0",
      "2d2f6bb9565157ead8341f9bb38820d5b8d16fe0",
      "21fdcb8a89de74a65e206b12ac63d2ba0aa99e14",
      "26f5dfaca16e93c38e674a7a701ef11ffd77d8f5",
      "e80ab28796295d1de56aa6f027495326b177eb58",
      "1a600faa65834310f02bd2296340e19b2f50a53b",
      "90cf7fdf9f843d8fb9a875dc2494499cb3e1bdbe",
      "b311dae6be6e9f335750edf8c856ddec57540059"
    ],
    "pull_request": 33,
    "tests": {
      "lint": "success",
      "typecheck": "success",
      "unit": "success",
      "database": "success",
      "build": "success",
      "workflow_run": 43775254043,
      "tested_code_commit": "b311dae6be6e9f335750edf8c856ddec57540059"
    },
    "pending": [
      "Configurar credenciais e provider Google no Google Cloud/Supabase.",
      "Cadastrar Site URL e Redirect URLs por ambiente no Supabase.",
      "Validar SMTP, confirmação de e-mail e recuperação no ambiente real.",
      "Validar fluxos ponta a ponta com Supabase remoto após autorização."
    ]
  }
}
```

## Backlog organizado por área — GitHub Issues

As issues abaixo formam o quadro de trabalho do produto. A classificação está no prefixo do título (`[AUTH]`, `[BOOKING]` etc.) para permitir encaminhar uma área inteira a um agente. Cada issue contém escopo, critérios de aceite e dependências. Não abrir PR vazia: cada issue deve gerar PR quando houver código real, em branch própria.

### AUTH — Autenticação e contas
- [ ] [Issue #6](https://github.com/deividjmoura/marcou/issues/6)

### BOOKING — Jornada e regras de agendamento
- [ ] [Issue #7](https://github.com/deividjmoura/marcou/issues/7)
- [ ] [Issue #10](https://github.com/deividjmoura/marcou/issues/10)

### CALENDAR — Calendário e disponibilidade
- [ ] [Issue #8](https://github.com/deividjmoura/marcou/issues/8)

### PROVIDER — Painel e configuração do prestador
- [ ] [Issue #9](https://github.com/deividjmoura/marcou/issues/9)

### PAYMENTS — Pagamentos
- [ ] [Issue #11](https://github.com/deividjmoura/marcou/issues/11)

### NOTIFICATIONS — Notificações e automações
- [ ] [Issue #12](https://github.com/deividjmoura/marcou/issues/12)
- [ ] [Issue #13](https://github.com/deividjmoura/marcou/issues/13)

### SECURITY — Segurança e banco
- [ ] [Issue #14](https://github.com/deividjmoura/marcou/issues/14)

### SUPABASE — Integração Supabase
- [ ] [Issue #15](https://github.com/deividjmoura/marcou/issues/15)

### UX — Experiência do cliente
- [ ] [Issue #16](https://github.com/deividjmoura/marcou/issues/16)

### QUALITY — Qualidade e testes
- [ ] [Issue #17](https://github.com/deividjmoura/marcou/issues/17)

### RELEASE — Deploy e operação
- [ ] [Issue #20](https://github.com/deividjmoura/marcou/issues/20)

### INTEGRATIONS — Integrações futuras
- [ ] [Issue #18](https://github.com/deividjmoura/marcou/issues/18)
- [ ] [Issue #19](https://github.com/deividjmoura/marcou/issues/19)

---

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
- **Supabase remoto:** projeto criado (`peornypgltuueubmsucm`, São Paulo); migrations remotas não aplicadas e integração remota ainda não validada. Não aplicar migrations, alterar dados ou configurar produção nesta tarefa.
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

**Verificado apenas em banco embutido.** Existe projeto Supabase remoto provisionado, mas as migrations não foram aplicadas nele; a página `/notificacoes` com sessão/RLS só foi exercitada no harness `scripts/db-check.mjs`.

**Pendências desta frente**
- Nenhum cron configurado para `create_booking_reminders()` nem para
  `expire_stale_bookings()`.
- E-mail não implementado (nenhuma infraestrutura de envio configurada; nenhuma
  credencial criada). O que seria necessário está em `docs/NOTIFICACOES.md`.
- `booking.changed` está mapeado, mas nenhuma transição atual o emite; entrará
  quando houver reagendamento/edição de reserva.

**Registro histórico corrigido:** o texto original desta entrega foi escrito antes do merge. A PR #5 foi posteriormente integrada por squash à `main` (commit `ca9b73f7b43efeba759fafc12214fc806bfb24d0`). Consulte o JSON do topo para o estado atual.

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


---

# 🧭 ROADMAP CENTRAL E DIVISÃO POR ÁREAS — 15/11/2026

Este roadmap foi criado para distribuir o trabalho entre agentes por domínio. **Cada agente deve assumir uma área e trabalhar somente nas issues atribuídas àquela área**, respeitando dependências e branches existentes. Não abrir PR sem código implementado; não criar PR vazia apenas para reservar trabalho.

## Convenção de roteamento

- O prefixo entre colchetes no título da issue identifica a área responsável.
- Ao delegar, atribuir ao agente todas as issues com o mesmo prefixo/área.
- Um agente não deve alterar arquivos/branches de outra área sem coordenação.
- Cada issue deve ser executada em branch própria, com PR vinculada à issue.
- Antes de iniciar, verificar se o escopo já foi implementado em `main` ou em PR aberta; atualizar/fechar issue duplicada em vez de reimplementar.
- Atualizar esta seção e o bloco JSON do topo quando o estado real mudar. Não declarar PR integrada sem conferir estado e merge commit.
- Labels atuais: PRs existentes foram categorizadas com `enhancement` ou `bug`; as issues usam prefixos padronizados no título e label `enhancement`. Não inventar labels de área que não existam no repositório.

## Backlog criado

| Issue | Área | Responsabilidade |
|---|---|---|
| [#21 — BOOKING](https://github.com/deividjmoura/marcou/issues/21) | BOOKING | Múltiplos serviços, duração/preço combinados e disponibilidade consistente |
| [#22 — PUBLIC-FLOW](https://github.com/deividjmoura/marcou/issues/22) | PUBLIC-FLOW | Jornada pública real conectada ao backend |
| [#23 — IDENTITY](https://github.com/deividjmoura/marcou/issues/23) | IDENTITY | Cadastro, login, OAuth Google, telefone e perfil |
| [#24 — PROVIDER-ADMIN](https://github.com/deividjmoura/marcou/issues/24) | PROVIDER-ADMIN | Painel, negócio, serviços, expediente e agenda |
| [#25 — BOOKING-OPS](https://github.com/deividjmoura/marcou/issues/25) | BOOKING-OPS | Expiração, estados, cancelamento e políticas |
| [#26 — NOTIFICATIONS](https://github.com/deividjmoura/marcou/issues/26) | NOTIFICATIONS | Jobs de lembrete/expiração e e-mail |
| [#27 — DESIGN-SYSTEM](https://github.com/deividjmoura/marcou/issues/27) | DESIGN-SYSTEM | Tipografia, identidade, componentes e ícones animados |
| [#28 — PAYMENTS](https://github.com/deividjmoura/marcou/issues/28) | PAYMENTS | Sinal, pagamento, comprovantes e webhooks |
| [#29 — CALENDAR-INTEGRATION](https://github.com/deividjmoura/marcou/issues/29) | CALENDAR-INTEGRATION | Integração segura com Google Calendar |
| [#30 — PLATFORM](https://github.com/deividjmoura/marcou/issues/30) | PLATFORM | Supabase, ambientes, cron, deploy, backup e observabilidade |
| [#31 — QUALITY](https://github.com/deividjmoura/marcou/issues/31) | QUALITY | E2E, segurança, acessibilidade e performance |

## PRs existentes — não duplicar

- [PR #1](https://github.com/deividjmoura/marcou/pull/1): prévia visual da página pública; relacionada às issues #22 e #27. Dados demonstrativos.
- [PR #2](https://github.com/deividjmoura/marcou/pull/2): prévia do calendário mobile; relacionada às issues #21 e #22. Horários demonstrativos.
- [PR #4](https://github.com/deividjmoura/marcou/pull/4): resiliência do calendário; revisar diff e CI, relacionada às issues #21 e #22.
- [PR #5](https://github.com/deividjmoura/marcou/pull/5): notificações internas; pendências relacionadas à issue #26. **Há divergência entre o texto histórico deste documento/README e o estado retornado pela listagem de PRs. Confirmar no GitHub o estado real e o merge commit antes de alterar o status canônico.**
- [PR #3](https://github.com/deividjmoura/marcou/pull/3): motor básico e fluxo essencial, descrita como integrada na documentação; confirmar merge em `main` antes de qualquer reabertura de escopo.

## Ordem sugerida e dependências

1. **BOOKING (#21) + BOOKING-OPS (#25):** garantir modelo e ciclo de vida das reservas.
2. **IDENTITY (#23) + PROVIDER-ADMIN (#24):** fechar contas, perfis e operação do prestador.
3. **PUBLIC-FLOW (#22):** integrar a jornada pública aos serviços reais e ao motor validado.
4. **NOTIFICATIONS (#26) + PLATFORM (#30):** automatizar lembretes e jobs com infraestrutura segura.
5. **DESIGN-SYSTEM (#27) + QUALITY (#31):** consolidar experiência e validar qualidade transversal; podem avançar em paralelo com coordenação.
6. **PAYMENTS (#28) e CALENDAR-INTEGRATION (#29):** dependem de decisões explícitas do responsável sobre provedor, modelo de cobrança e comportamento da sincronização.

## Fase futura — fora do backlog ativo

WhatsApp, bot, webhooks e Railway permanecem adiados. Não abrir trabalho de implementação dessas integrações até nova autorização do responsável.

## Instrução de delegação

Quando o responsável disser, por exemplo, “agente A fica com BOOKING”, esse agente deve assumir #21 e coordenar dependências com #25, sem assumir automaticamente as outras áreas. Toda PR deve referenciar a issue correspondente (por exemplo, `Closes #21`) apenas quando realmente a concluir. Não atribuir pessoas/usuários sem confirmação de quem será responsável.



## Tarefa delegada ao agente externo — Issue #21 BOOKING

**Responsável:** agente externo designado pelo usuário.  
**Issue principal:** https://github.com/deividjmoura/marcou/issues/21  
**Objetivo:** implementar seleção e agendamento de múltiplos serviços em uma única reserva, com duração e preço combinados e disponibilidade validada no servidor.

### Instruções obrigatórias
1. Leia este documento inteiro e audite a `main`, as PRs abertas e as migrations antes de alterar qualquer coisa.
2. Trabalhe exclusivamente no escopo da Issue #21. Não altere autenticação, painel administrativo, notificações, pagamentos ou integrações de calendário.
3. Crie uma branch própria, por exemplo `feat/21-booking-multiple-services`, a partir da `main` atualizada. Não trabalhe diretamente em `main`.
4. Preserve compatibilidade com reservas existentes de um único serviço. Não faça mudanças destrutivas no banco.
5. Permita selecionar vários serviços ativos do mesmo estabelecimento. Calcule duração total e preço total no servidor, usando os valores persistidos dos serviços; não confie em totais enviados pelo navegador.
6. Valide disponibilidade para o intervalo combinado, expediente, bloqueios e reservas existentes. A operação de criação precisa ser segura contra duas requisições concorrentes tentando ocupar o mesmo horário.
7. Se o modelo atual do banco não suportar múltiplos serviços, proponha e implemente migration aditiva, com constraints/índices apropriados e estratégia de compatibilidade. Não aplique migration no projeto Supabase remoto; apenas versionar o arquivo e documentar como validar/aplicar.
8. Atualize UI pública apenas no necessário para seleção múltipla, resumo de serviços, duração e preço. Trate carregamento, erro, estado vazio e validação.
9. Adicione testes para cálculo agregado, disponibilidade, conflitos concorrentes/duplicidade e fluxo de criação; execute lint, typecheck, testes e build disponíveis.
10. Abra uma PR vinculada à Issue #21 com `Closes #21` somente quando todos os critérios estiverem concluídos. Descreva decisões, migration, riscos, testes executados e limitações. Não faça merge.
11. Não altere PRs #1, #2 ou #4 nem faça cherry-pick/merge de branches de terceiros sem necessidade e sem documentar.
12. Antes de encerrar, atualize o JSON de estado no início deste documento e esta seção com branch, commits, PR, arquivos alterados, testes e pendências. Não declare concluído algo que não foi validado.

### Critérios de aceite
- Usuário consegue escolher um ou mais serviços do mesmo estabelecimento.
- Preço e duração combinados são calculados no backend e exibidos corretamente.
- Horário só é oferecido/confirmado quando o intervalo completo está livre.
- Duas tentativas simultâneas para horários incompatíveis não conseguem criar reservas conflitantes.
- Reservas antigas continuam funcionando.
- Testes, lint, typecheck e build passam; qualquer falha preexistente é identificada separadamente.
- PR pequena, revisável e ligada à Issue #21.

**Limite de escopo:** se descobrir dependência real de outra área, documente e abra comentário na issue correspondente; não amplie esta implementação por conta própria.


---

## Entrega do agente — Issue #23 IDENTITY (15/11/2026)

**Status:** implementação realizada em branch própria; PR aberta em draft, sem merge. A Issue #23 permanece aberta porque a configuração externa do Google OAuth e a validação ponta a ponta ainda dependem do responsável.

- **Branch:** `feat/23-identity-auth-profile` (criada diretamente de `main` em `217823e7af67f451d5a2fd9bbd631cd2d4f4f6c5`).
- **Head:** `b311dae6be6e9f335750edf8c856ddec57540059`.
- **PR:** [#33 — IDENTITY](https://github.com/deividjmoura/marcou/pull/33), draft, base `main`, sem `Closes #23`.
- **Commits:** `46d0fda77d2028cc9ad50eb15a9853cb23b116a0`, `2d2f6bb9565157ead8341f9bb38820d5b8d16fe0`, `21fdcb8a89de74a65e206b12ac63d2ba0aa99e14`, `26f5dfaca16e93c38e674a7a701ef11ffd77d8f5`, `e80ab28796295d1de56aa6f027495326b177eb58`, `1a600faa65834310f02bd2296340e19b2f50a53b`, `90cf7fdf9f843d8fb9a875dc2494499cb3e1bdbe`, `b311dae6be6e9f335750edf8c856ddec57540059`.

### Arquivos alterados

- `src/app/(auth)/actions.ts` e `forms.tsx`: preservação do login/cadastro existentes; provisionamento do perfil, validação de telefone, logout, recuperação e redefinição de senha.
- `src/app/(auth)/perfil/page.tsx`, `esqueci-senha/page.tsx`, `redefinir-senha/page.tsx` e `login/page.tsx`: páginas de perfil e recuperação, além de feedback de callback.
- `src/app/auth/callback/route.ts`: troca PKCE, provisionamento Supabase e redirecionamento seguro para completar telefone quando ausente.
- `src/app/painel/page.tsx` e `src/app/meus-agendamentos/page.tsx`: links mínimos para editar o perfil.
- `src/lib/identity.ts` e `src/lib/identity.test.ts`: validação/normalização de telefone, redirecionamento local e testes unitários.
- `docs/IDENTITY.md`: arquitetura, RLS existente e instruções de configuração Google Cloud/Supabase.

### Banco, segurança e validação

- Nenhuma migration nova foi necessária: `public.profiles`, colunas `display_name`/`phone` e policies RLS de acesso à própria linha já existem na migration inicial.
- Nenhuma migration foi aplicada no Supabase remoto; nenhuma configuração ou variável de produção da Vercel foi alterada.
- Os fluxos de perfil usam o usuário autenticado no servidor e não recebem um ID de usuário arbitrário do cliente.
- Os comandos foram executados pelo GitHub Actions no job `quality` do run [#43775045185](https://github.com/deividjmoura/marcou/actions/runs/43775045185), no commit de código `e80ab28796295d1de56aa6f027495326b177eb58`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` e `npm run build` — todos concluídos com sucesso. A atualização posterior do documento foi apenas documental.
- **Pendências do responsável:** criar Client ID/Secret no Google Cloud, habilitar Google em Supabase Auth, configurar Site URL/Redirect URLs e validar SMTP/recuperação em ambiente real. O telefone é validado sintaticamente (10–15 dígitos), sem verificação de posse por SMS.
- **Pendência de revisão:** confirmar comportamento real com Supabase configurado e verificar regressões antes de retirar o draft. Nenhuma outra branch/PR foi alterada.


**Coordenação entre PRs:** a PR #32 da PLATFORM também modifica `AGENT_TASK_MARCOU.md`. No momento da auditoria, GitHub reporta a PR #33 como mergeable; como ambas alteram o documento compartilhado, revalidar e reconciliar esse arquivo se uma delas for integrada antes da outra. Nenhuma alteração foi feita na branch ou na PR #32.
