# Contrato do domínio de agendamentos

Este documento define o comportamento mínimo que qualquer implementação do Marcou deve preservar. Ele é independente de framework, banco de dados, provedor de pagamento e canal de mensagens. Não substitui as decisões de produto ainda pendentes listadas em `ESCOPO-E-ARQUITETURA.md`.

## 1. Conceitos

- **Serviço:** oferta do prestador, com duração, preço, sinal e intervalo configurados.
- **Slot:** intervalo de tempo candidato para um serviço, calculado a partir da disponibilidade e dos impedimentos conhecidos.
- **Reserva temporária:** bloqueio com prazo de expiração criado quando o cliente solicita um horário.
- **Agendamento:** compromisso associado a cliente, prestador e serviço.
- **Comprovante:** evidência enviada pelo cliente; sua recepção não aprova o pagamento.
- **Aprovação do sinal:** decisão confiável recebida por integração validada ou ação explícita do prestador.

Horários devem ser persistidos como instantes inequívocos (UTC no desenho atual) e apresentados no fuso configurado pelo prestador. Duração e intervalo são valores do serviço no momento da reserva; alterações posteriores no cadastro não devem reescrever compromissos existentes.

## 2. Estados do agendamento

| Estado | Ocupa o horário? | Significado |
|---|---:|---|
| `pending_payment` | Sim, até expirar | Reserva temporária criada; aguardando pagamento/comprovante. |
| `pending_review` | Sim, enquanto válida | Comprovante recebido ou pagamento informado; aguardando validação. |
| `confirmed` | Sim | Sinal aprovado e compromisso confirmado. |
| `cancelled` | Não | Compromisso cancelado por ação autorizada ou regra explícita. |
| `expired` | Não | Reserva temporária venceu sem aprovação. |

A duração da reserva temporária é configurável e permanece uma decisão pendente. O sistema deve guardar `expiresAt` em UTC; não deve codificar um número fixo de minutos no domínio.

## 3. Transições permitidas

| Estado atual | Evento/condição | Próximo estado | Regra |
|---|---|---|---|
| — | Cliente solicita slot livre | `pending_payment` | Criar reserva e prazo atomicamente com a verificação de conflito. |
| `pending_payment` | Comprovante recebido | `pending_review` | Registrar comprovante; não confirmar pagamento. |
| `pending_payment` | Prazo vencido sem aprovação | `expired` | Liberar o horário. |
| `pending_review` | Sinal aprovado por fonte confiável/ação autorizada | `confirmed` | Confirmar apenas se a reserva ainda for válida e não houver conflito. |
| `pending_review` | Pagamento recusado | `cancelled` ou retorno a `pending_payment` | A política exata deve ser definida; não liberar silenciosamente sem registrar a decisão. |
| `confirmed` | Cancelamento autorizado | `cancelled` | Aplicar política de cancelamento/reembolso ainda a definir e preservar auditoria. |
| `pending_payment` | Cancelamento pelo cliente/prestador | `cancelled` | Liberar o horário. |
| `cancelled`, `expired` | Evento repetido ou tardio | Sem alteração | Não reativar automaticamente. |

Nenhum evento pode transformar `cancelled` ou `expired` em `confirmed` automaticamente. Uma recuperação excepcional exige uma nova operação explícita, com nova checagem de disponibilidade e registro de auditoria.

## 4. Invariantes obrigatórios

1. **Sem dupla marcação:** não podem existir dois agendamentos ativos conflitantes para o mesmo prestador, considerando o intervalo ocupado completo.
2. **Atomicidade:** checar disponibilidade e criar a reserva são uma única operação lógica atômica no backend. Consultar slots no frontend não garante disponibilidade.
3. **Estados que ocupam horário:** `pending_payment` e `pending_review` ocupam o slot enquanto válidos; `confirmed` ocupa até cancelamento autorizado.
4. **Expiração:** uma reserva pendente com `expiresAt <= now` não pode bloquear indefinidamente nem ser confirmada por um evento tardio sem nova validação.
5. **Pagamento separado da evidência:** upload, texto ou recebimento de comprovante nunca equivalem a aprovação do sinal.
6. **Idempotência:** repetir o mesmo webhook/evento não pode duplicar comprovantes, notificações, confirmações ou efeitos financeiros.
7. **Auditoria:** mudanças de estado guardam ator/origem, instante UTC, motivo e identificador do evento quando aplicável.
8. **Disponibilidade não apaga compromissos:** editar expediente, folgas ou exceções não remove nem altera agendamentos já confirmados; conflitos resultantes devem ser sinalizados.
9. **Isolamento por prestador:** operações de leitura e escrita verificam o escopo do prestador e a autorização do ator no backend.
10. **Snapshot do serviço:** registrar no agendamento a duração, preço, sinal e intervalo aplicados no momento da criação, para que mudanças futuras no catálogo não alterem o acordo existente.

## 5. Checagem de conflito

Dois intervalos semiabertos `[inicio, fim)` conflitam quando:

```text
A.inicio < B.fim && B.inicio < A.fim
```

Usar intervalo semiaberto permite que um compromisso termine exatamente quando o próximo começa, desde que o intervalo de preparação/limpeza configurado já esteja incorporado ao fim ocupado.

O fim ocupado deve considerar, no mínimo:

- início escolhido pelo cliente;
- duração do serviço;
- intervalo adicional configurado para o serviço, se houver.

O mecanismo de persistência deverá garantir a exclusão mútua mesmo quando duas solicitações concorrentes tentarem reservar o mesmo horário. A tecnologia concreta (transação, lock, documento de slot ou outra estratégia) será definida após a confirmação da stack.

## 6. Dados mínimos do agendamento

O modelo persistido deverá representar, sem impor ainda nomes físicos de coleção/tabela:

- identificador único do agendamento;
- identificadores do prestador, cliente e serviço;
- início e fim do compromisso em UTC;
- fuso usado na apresentação;
- snapshot de duração, preço, sinal e intervalo;
- estado atual e histórico de transições;
- `createdAt`, `updatedAt` e, para reservas temporárias, `expiresAt`;
- referência(s) de pagamento/comprovante, sem armazenar segredos de integração;
- chave(s) de idempotência para eventos externos relevantes.

Comprovantes devem ficar em armazenamento privado, com autorização e acesso temporário. O registro do agendamento guarda apenas a referência protegida e os metadados necessários.

## 7. Eventos de integração

Os nomes abaixo são sugestões de contrato interno, não endpoints ou webhooks já implementados:

- `booking.created`
- `booking.proof_received`
- `booking.payment_approved`
- `booking.payment_rejected`
- `booking.confirmed`
- `booking.cancelled`
- `booking.expired`

Cada evento deve ter identificador único, tipo, instante UTC, `bookingId`, origem e versão do payload. Consumidores devem ser idempotentes. Eventos recebidos de WhatsApp, calendário ou pagamento nunca devem poder alterar o estado sem autenticação, autorização e validação da origem.

## 8. Cenários mínimos de validação

Antes de considerar o motor de reservas pronto, testes automatizados devem cobrir:

1. duas solicitações simultâneas para o mesmo slot: no máximo uma reserva ativa é criada;
2. slots adjacentes sem sobreposição são aceitos;
3. serviço com intervalo adicional bloqueia o período completo;
4. comprovante recebido move para revisão, mas não confirma;
5. evento de aprovação repetido produz uma única confirmação;
6. aprovação após expiração não confirma a reserva antiga;
7. reserva expirada deixa de ocupar o slot;
8. edição de disponibilidade não altera agendamentos confirmados;
9. ator de outro prestador não consegue ler nem alterar a reserva;
10. mudança de preço/duração do serviço não altera o snapshot de uma reserva existente.

## 9. Decisões que continuam abertas

Este contrato não escolhe por conta própria:

- stack definitiva e mecanismo concreto de atomicidade;
- serviços, preços, durações e sinal do catálogo;
- provedor de pagamento e aprovação automática/manual;
- duração da reserva temporária;
- se Google Calendar é fonte de disponibilidade ou espelho;
- política de cancelamento, reembolso e prazos;
- canal oficial de WhatsApp e detalhes operacionais da conexão.

Essas decisões devem ser confirmadas antes de implementar os adaptadores e regras específicas correspondentes.
