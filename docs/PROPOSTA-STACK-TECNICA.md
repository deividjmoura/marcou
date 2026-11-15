# Proposta técnica de stack — Marcou

**Status:** proposta para revisão; ainda não aprovada pelo proprietário do produto.  
**Branch de referência:** `design/identidade-visual`

Este documento transforma a arquitetura sugerida em uma recomendação técnica comparável. Não configura serviços externos, não cria recursos em nuvem e não escolhe políticas comerciais.

## 1. Recomendação resumida

Para o MVP, recomenda-se avaliar a seguinte base:

| Camada | Recomendação | Responsabilidade |
|---|---|---|
| Aplicação web | Next.js (App Router) + TypeScript | Catálogo público, área do cliente e painel do prestador |
| Persistência | PostgreSQL gerenciado via Supabase | Dados relacionais e integridade do agendamento |
| Autenticação | Supabase Auth | Identidade, sessão e login social/e-mail |
| Autorização | PostgreSQL Row Level Security (RLS) + validação no servidor | Isolamento entre prestadores e clientes |
| Arquivos | Supabase Storage em bucket privado | Comprovantes e anexos |
| Backend | Camada server-side do Next.js para operações do produto; funções/worker separado quando necessário | Regras de negócio, webhooks e segredos |
| Tarefas agendadas | Worker/cron gerenciado, a escolher após definir hospedagem | Expirar reservas, reconciliar eventos e reenviar notificações |
| Integrações | Adaptadores independentes | Pagamento, WhatsApp e Google Calendar |

A documentação oficial do Supabase oferece um quickstart integrado a Next.js App Router, TypeScript e autenticação por cookies. RLS deve ser habilitado e testado em todas as tabelas expostas; a chave privilegiada nunca deve ir para o navegador.

## 2. Por que PostgreSQL é a primeira opção para a agenda

O Marcou precisa impedir sobreposição de intervalos de duração variável. PostgreSQL oferece tipos de intervalo e *exclusion constraints* com GiST para impedir que duas reservas ativas do mesmo prestador ocupem períodos conflitantes.

A proteção pode ser implementada no banco, além da validação da aplicação. Exemplo conceitual (não é uma migration pronta):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_active_bookings
EXCLUDE USING gist (
  provider_id WITH =,
  tstzrange(starts_at, occupied_until, '[)') WITH &&
)
WHERE (status IN ('pending_payment', 'pending_review', 'confirmed'));
```

Pontos que precisam ser tratados na implementação:

- `occupied_until` deve incluir duração do serviço e intervalo adicional.
- A reserva pendente vencida precisa ser marcada como `expired` antes de tentar ocupar novamente o período; não se deve depender somente de um cron que pode atrasar.
- A transição de expiração, a tentativa de reservar e a aprovação de pagamento devem ser transacionais e concorrentes com segurança.
- Uma violação da constraint deve ser convertida em resposta de horário indisponível, não em erro genérico.
- Testes concorrentes devem validar duas requisições simultâneas para intervalos iguais e parcialmente sobrepostos.

A documentação oficial do PostgreSQL descreve exclusion constraints para impor a regra de não sobreposição. Isso torna a integridade temporal uma regra do banco, não apenas uma convenção na aplicação.

## 3. Comparação com Firebase / Firestore

Firestore continua sendo uma alternativa válida: oferece operações atômicas e transações com isolamento serializável. Entretanto, para este domínio, a aplicação precisa projetar uma estratégia explícita de contenção para intervalos variáveis — por exemplo, documentos de lock/slots determinísticos ou segmentos de tempo. Essa abordagem adiciona regras próprias e deve ser testada cuidadosamente para não deixar lacunas entre segmentos.

| Critério | PostgreSQL | Firestore |
|---|---|---|
| Intervalos arbitrários | Exclusion constraint nativa | Exige modelagem/locks próprios |
| Dados relacionais | Natural | Exige referências e consultas desnormalizadas |
| Integridade por restrições | Forte suporte no banco | Mais regras na aplicação |
| Escalabilidade gerenciada | Depende do provedor/plano | Serviço gerenciado e escalável |
| Afinidade com stack Firebase existente | Menor | Maior |
| Adequação ao motor de reservas | Preferida para este domínio | Viável com estratégia de locks documentada |

Não se afirma que Firestore não possa garantir consistência. A diferença é que PostgreSQL expressa diretamente a regra central de não sobreposição, enquanto Firestore exige modelagem adicional para esse caso.

## 4. Segurança e autorização

Se Supabase for aprovado:

1. Habilitar RLS em toda tabela acessível por cliente/browser.
2. Definir políticas por papel e por vínculo com o prestador; nunca confiar em `provider_id` enviado pelo navegador sem verificar autorização.
3. Manter a chave `service_role`, segredos de pagamento, OAuth e tokens WhatsApp somente no servidor.
4. Armazenar comprovantes em bucket privado e emitir URLs temporárias após autorização.
5. Validar assinatura/origem de webhooks e aplicar idempotência no backend.
6. Criar testes positivos e negativos para cada política RLS.
7. Não armazenar tokens OAuth em tabelas legíveis pelo usuário final.

RLS é defesa adicional, não substitui a validação das regras de negócio e da autorização na camada server-side.

## 5. Limites arquiteturais recomendados

Manter o domínio independente dos fornecedores:

- `BookingRepository`: persistência e transações.
- `AvailabilityService`: cálculo de horários livres.
- `BookingService`: criação, expiração, cancelamento e confirmação.
- `PaymentProvider`: inicia/consulta pagamento e valida eventos.
- `MessagingProvider`: envia mensagens e encaminha mídias.
- `CalendarProvider`: cria/atualiza eventos mediante autorização.

A aplicação não deve chamar Baileys, APIs de pagamento ou Google Calendar diretamente de componentes de interface. O bot WhatsApp existente é uma referência, não uma dependência do núcleo de agendamentos.

## 6. Decisões que ainda precisam do proprietário

A aprovação da stack não resolve as decisões comerciais/operacionais:

| Decisão | Proposta técnica | Precisa de confirmação |
|---|---|---|
| Stack | Next.js + TypeScript + Supabase/PostgreSQL | Sim |
| Catálogo | Importar serviços reais do catálogo do prestador | Dados de serviço, preço, duração e sinal |
| Pagamento | Criar interface de provedor; iniciar com fluxo manual somente se aprovado | Provedor e aprovação manual/automática |
| Google Calendar | Adaptador opcional, sem bloquear o MVP | Fonte de disponibilidade ou espelho |
| Expiração | Campo `expires_at` configurável por prestador/sistema | Quantidade de minutos |
| Cancelamento | Estados e auditoria preparados | Prazos, reembolso e permissões |
| WhatsApp | Adapter isolado; avaliar API oficial para produção | Canal e conta autorizados |
| Hospedagem | Compatível com Next.js e tarefas server-side | Provedor, orçamento e região |

Não inserir credenciais, criar projetos Supabase ou provisionar serviços até a aprovação explícita e a disponibilização dos acessos necessários.

## 7. Sequência de implementação após aprovação

1. Criar esqueleto Next.js + TypeScript e configurar lint, testes e variáveis de ambiente de exemplo.
2. Criar migrations PostgreSQL para perfis, prestadores, serviços, disponibilidade e agendamentos.
3. Implementar RLS e testes de autorização.
4. Implementar domínio de disponibilidade e reservas, incluindo constraint anti-sobreposição e expiração síncrona/assíncrona.
5. Criar testes unitários e de integração concorrente.
6. Implementar catálogo público e painel mínimo do prestador.
7. Adicionar autenticação e onboarding.
8. Adicionar pagamento, WhatsApp e calendário somente depois das decisões e credenciais.

## 8. Fontes técnicas

- Supabase — Next.js Auth quickstart: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostgreSQL — Range Types e exclusion constraints: https://www.postgresql.org/docs/current/rangetypes.html
- Firebase — Transaction serializability and isolation: https://firebase.google.com/docs/firestore/transaction-data-contention
- Firebase — Transactions and batched writes: https://firebase.google.com/docs/firestore/manage-data/transactions
