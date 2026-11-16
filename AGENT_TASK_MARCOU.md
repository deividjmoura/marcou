# Marcou — estado atual e continuidade

Última atualização: 16/11/2026

## Em andamento

### Calendário e novo fluxo de agendamento
- Branch: `feat/novo-fluxo-agendamento-calendario`.
- Base atual: `main`; a branch está 37 commits à frente e 0 atrás.
- Evolução do seletor de data/horário e do fluxo público de agendamento.
- Barra de navegação preparada com os ícones do pack em `public/icons/navigation/`.
- Campo de endereço público (slug) converte letras para minúsculas durante a digitação e normaliza no servidor antes de salvar.
- Campo de fuso horário removido da interface do painel. O fuso continua no backend, com padrão `America/Sao_Paulo`, pois é necessário para calcular disponibilidade e horários corretamente.
- Campo opcional “Frase de impacto” adicionado ao cadastro do negócio; limite de 180 caracteres. A descrição é salva e exibida na página pública.
- Migration pendente de aplicação no Supabase: `supabase/migrations/202611160001_provider_description.sql`.
- Configuração versionada específica da Vercel removida (`vercel.json`). Deploy atual: Netlify.

## Já concluído e integrado à main
- Autenticação e perfil (PR #33), incluindo callback OAuth/PKCE, recuperação de senha e dados de perfil.
- Auditoria e correções de qualidade da Issue #31.
- Melhorias de disponibilidade/calendário resiliente já integradas anteriormente.
- Infraestrutura da aplicação: Next.js, Supabase e deploy pela Netlify.

## Próximos passos
1. Abrir PR da branch de calendário para `main).
2. Aguardar o GitHub Actions executar lint, typecheck, testes unitários, testes de banco e build.
3. Corrigir qualquer falha encontrada; não declarar validação sem resultado real.
4. Se os checks passarem e a PR estiver mergeable, integrar por squash.
5. Depois do merge, aplicar a migration de descrição no Supabase e validar o deploy/fluxo real na Netlify.

## Regras para agentes
- Trabalhar na branch/issue atribuída; não sobrescrever trabalho de outras branches.
- Não alterar produção, Supabase remoto ou configurações externas sem autorização explícita.
- Não remover funcionalidades existentes fora do escopo.
- Antes de encerrar, registrar aqui apenas mudanças relevantes, testes realmente executados e pendências atuais.
