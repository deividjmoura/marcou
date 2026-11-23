# Checklist antes de publicar documentos do Marcou

Uma versão só pode sair de `draft` quando todos os itens bloqueantes aplicáveis
estiverem concluídos e houver autorização explícita para o ambiente alvo.

## 1. Identidade da operação

- [ ] Confirmar nome/razão social, CNPJ ou CPF aplicável e representação.
- [ ] Confirmar endereço comercial que deve constar nos documentos.
- [ ] Confirmar canal de suporte ao consumidor.
- [ ] Confirmar canal de privacidade e avaliar/designar encarregado quando
      aplicável.
- [ ] Validar com assessoria contábil/jurídica a compatibilidade das atividades e
      do enquadramento da pessoa operadora com a plataforma.
- [ ] Definir quando o Marcou atua como controlador ou operador em cada fluxo.

## 2. Produto e relação entre as partes

- [ ] Confirmar se o Marcou apenas fornece ferramentas ou também intermedeia
      etapas específicas da contratação.
- [ ] Definir política de cancelamento, reagendamento, atraso, ausência,
      reembolso e contestação.
- [ ] Confirmar o fluxo de sinal e pagamento; não afirmar custódia ou aprovação
      automática inexistente.
- [ ] Definir o estado que revela endereço/local de serviço.
- [ ] Definir elegibilidade, edição, contestação e retenção de avaliações.
- [ ] Definir denúncia, bloqueio, sanções, recurso, equipe e SLA de moderação.
- [ ] Confirmar quais módulos do Marcou Social estarão realmente ativos na data
      de vigência.

## 3. Inventário de dados e fornecedores

- [ ] Inventariar dados atuais e planejados por finalidade, acesso e fonte.
- [ ] Definir base legal por finalidade; não usar aceite dos Termos como
      consentimento genérico.
- [ ] Definir retenção e descarte para conta, perfil, reservas, notificações,
      mídia, mensagens, avaliações, denúncias e logs.
- [ ] Mapear Supabase, Netlify, Google OAuth e qualquer fornecedor adicional.
- [ ] Confirmar entidades contratantes, regiões, suboperadores e transferências
      internacionais.
- [ ] Definir processo autenticado para direitos dos titulares.
- [ ] Definir processo e responsáveis por incidentes e comunicação aplicável.
- [ ] Confirmar cookies/analytics ativos e implementar rejeição equivalente para
      os não essenciais quando exigida.

## 4. Conteúdo e revisão

- [ ] Remover afirmações futuras que ainda não correspondam ao produto ativo.
- [ ] Substituir todas as pendências de operador, endereço e canais.
- [ ] Revisar acessibilidade e linguagem simples.
- [ ] Revisar Termos, Privacidade, Diretrizes e Política de Conteúdo em conjunto.
- [ ] Obter revisão jurídica brasileira e registrar responsável/data/evidência.
- [ ] Registrar aprovação final do responsável pelo produto/operação.
- [ ] Produzir resumo das mudanças materiais em linguagem clara.

## 5. Versionamento técnico

- [ ] Alterar o conteúdo em `src/content/legal-documents.json`.
- [ ] Trocar `0.1-draft` por uma versão inequívoca e atualizar a data.
- [ ] Remover o aviso de minuta e marcar `status: published` somente depois da
      aprovação.
- [ ] Definir `requiresAcceptance` por documento; mudança não material não deve
      bloquear por padrão.
- [ ] Recalcular e revisar o SHA-256 com os testes automatizados.
- [ ] Criar migration que, na mesma transação, retire a versão publicada anterior
      e publique a nova metadata/hash/datas.
- [ ] Validar migration, RLS, hash, aceite, repetição idempotente e novo aceite
      em banco efêmero e ambiente de desenvolvimento.
- [ ] Garantir que manifesto e banco falhem fechados quando versão/hash divergem.
- [ ] Integrar o gate de navegação à feature flag prevista no roadmap antes de
      tornar qualquer documento obrigatório.
- [ ] Validar opção “não aceitar e sair”, sem caixas pré-marcadas ou destaque
      enganoso.

## 6. Operação e release

- [ ] Preparar suporte para dúvidas, recusa, encerramento e direitos do titular.
- [ ] Confirmar logs sem corpo de documento desnecessário, mensagem ou PII.
- [ ] Definir rollback que retire o gate sem apagar recibos históricos.
- [ ] Testar preview/homologação e registrar evidências.
- [ ] Obter autorização explícita antes de migration ou ativação em produção.
- [ ] Monitorar erros de versão/hash e taxa de recusa após ativação.

## Bloqueios atuais

Na data desta minuta, permanecem abertos pelo menos: contrato de domínio,
feature flags e baseline de RLS, moderação, direitos e retenção LGPD, operação e
rollout. As minutas não devem ser tratadas como vigentes enquanto as decisões
correspondentes não forem refletidas no texto e aprovadas. A rastreabilidade
interna dessas dependências está registrada na issue desta entrega e no roadmap.
