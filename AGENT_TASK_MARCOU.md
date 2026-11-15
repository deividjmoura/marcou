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
