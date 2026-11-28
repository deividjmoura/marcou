# ADR: fluxo de pagamentos — Pix manual primeiro, integração depois (Issue #28)

- **Status:** Proposta para decisão do responsável; nenhuma política comercial ou provedor foi aprovado.
- **Data:** 2026-11-28
- **Escopo:** definir a fronteira entre Fase 1 manual e Fase 2 integrada, estados e controles. Não implementa pagamentos.

## 1. Contexto verificado na main

O motor de reservas já possui estados de booking `pending_payment`, `pending_review`, `confirmed`, `cancelled` e `expired`. A criação insere `pending_payment` com `expires_at = now() + booking_hold_minutes`. O evento `proof_received` move a reserva para `pending_review`; `payment_approved`, permitido somente ao dono do prestador, move para `confirmed`. O motor também expira reservas pendentes por `expires_at`.

Isso é uma máquina de estados da **reserva**, não uma integração financeira: não há PSP escolhido, cobrança Pix gerada por API, conciliação automática, webhook de pagamento ou registro financeiro independente. O evento/prova submetido pelo cliente não comprova que o dinheiro entrou na conta.

## 2. Decisão recomendada

### Fase 1 — Pix manual, sem PSP

Recomendo começar com Pix manual, condicionado à definição das regras comerciais pelo responsável e pelo prestador:

1. O prestador cadastra uma chave Pix (ou instruções/QR estático) e escolhe se cobra valor integral ou sinal.
2. O Marcou apresenta ao cliente o valor e o prazo aprovados para aquela reserva.
3. O cliente informa que pagou e, se o fluxo for aprovado, envia comprovante para armazenamento **privado**.
4. O comprovante apenas abre uma revisão. O prestador confere o crédito no próprio banco e confirma pelo fluxo autenticado do servidor.
5. Só a confirmação autorizada atualiza o pagamento para pago e a reserva para confirmada. Upload, nome de arquivo, imagem ou retorno do navegador nunca podem marcar pagamento como pago.

**Vantagens:** menor custo e complexidade inicial, sem credenciais de PSP, sem webhooks e sem dependência de conciliação externa.

**Limitações/riscos:** conferência humana, comprovante falso/duplicado, atraso na confirmação, necessidade de suporte, ausência de conciliação e risco de disputa. O Marcou não deve afirmar que um pagamento foi recebido apenas porque o cliente anexou um comprovante.

O comprovante exige bucket privado separado do bucket público `service-images`, leitura restrita aos participantes autorizados, URLs assinadas de curta duração, validação de tipo/tamanho e retenção definida. Não usar nome do arquivo ou caminho como autorização.

### Fase 2 — PSP integrado

Só depois de medir o uso da Fase 1 e aprovar provedor, taxas, domínio/conta recebedora, política de reembolso e modelo de operação. O servidor cria cobranças e consulta o estado no PSP; webhooks autenticados atualizam o registro interno. A tela de retorno do cliente é apenas informativa e nunca fonte de verdade.

| Candidato | Pix / API | Webhooks e idempotência | Reembolso / split | Considerações |
|---|---|---|---|---|
| **Asaas** | API de cobrança com Pix, além de boleto/cartão | Webhooks e sandbox; integração deve deduplicar eventos e consultar o objeto de cobrança | API documenta estorno Pix integral ou parcial; split disponível | Candidato prático para comparar primeiro se o Marcou precisar de cobrança, subcontas e split. Estorno exige saldo disponível; taxas da cobrança podem não ser devolvidas. |
| **Mercado Pago** | Pix via QR Code e copia-e-cola; Orders API documenta `X-Idempotency-Key` e expiração | Notificações para mudanças de estado; validar assinatura/origem e buscar o recurso no servidor | Reembolso total/parcial; split 1:1 exige OAuth/token por vendedor e tem regras próprias de reversão | Boa opção se o modelo de marketplace e onboarding OAuth forem aceitáveis; split não é um simples repasse para qualquer conta bancária. |
| **Efí** | API Pix dedicada, com cobrança, consulta e devolução | Webhooks Pix com mTLS; documentação informa retries limitados e requisitos de TLS/certificado | Split Pix disponível, mas limitado a contas Efí | Candidato Pix-first; exige operação de certificados/mTLS e que os recebedores usem contas compatíveis com o split. |

**Custos:** não fixar valores neste ADR. As tarifas variam por produto, plano, volume, prazo de recebimento, negociação e perfil da conta. Antes da escolha, solicitar proposta/condições oficiais para: Pix recebido, estorno, chargeback/disputa quando aplicável, split, saque/transferência, mensalidade e limites. Não inferir tarifa a partir de preço de marketing ou plano de outra conta.

## 3. Máquina de estados proposta

Manter separados o estado da reserva (`bookings.status`) e o estado financeiro. Não reutilizar `pending_review` ou `confirmed` como prova financeira.

| Estado financeiro | Significado | Próximas transições permitidas |
|---|---|---|
| `pending_payment` | Valor devido; ainda sem confirmação de recebimento | `paid` após verificação; `expired` ao vencer sem pagamento |
| `paid` | Recebimento confirmado no banco pelo prestador (Fase 1) ou pelo PSP via webhook/consulta autenticada (Fase 2) | `refunded` após devolução confirmada |
| `refunded` | Valor devolvido e comprovado | Terminal na V1 |
| `expired` | Prazo venceu sem pagamento confirmado | Terminal na V1 |

Na V1, reembolso parcial fica fora de escopo; se aprovado depois, acrescentar `partially_refunded` e registrar cada devolução como evento/lançamento, sem sobrescrever o histórico. Uma reserva cancelada depois de paga não implica reembolso automático: a política comercial deve determinar elegibilidade e um ator autorizado deve iniciar/confirmar a devolução.

O `proof_received` atual pode continuar representando que o comprovante foi submetido e a reserva entrou em revisão. Ele **não** altera o estado financeiro para `paid`. A ação `payment_approved` deve ser transacional: valida dono/participante, estado atual, valor devido e prazo; grava evento de auditoria; marca pagamento como `paid`; e confirma a reserva. A expiração só pode ocorrer antes de `paid`. Transições repetidas devem ser idempotentes.

Se o prazo de pagamento for diferente do hold atual da reserva, criar um campo explícito `payment_due_at`; não reaproveitar `expires_at` com dois significados. A regra de liberação do horário continua no motor de reservas e precisa ser transacional.

## 4. Modelo de dados sugerido (não implementado)

- Registro financeiro por reserva/tentativa, com `booking_id`, `amount_cents`, `currency = BRL`, `status`, `method`, `due_at`, `paid_at`, `refunded_at`, ator de confirmação e timestamps.
- Para Fase 2: `provider`, `provider_account_id`, `provider_payment_id`, `provider_status`, `idempotency_key` e referência externa; nunca armazenar access token no registro de pagamento.
- Eventos financeiros append-only para confirmação, expiração, estorno e reconciliação; não confiar em estado recebido do cliente.
- Valores em centavos inteiros. Calcular sinal/percentual no servidor com regra de arredondamento explícita e snapshot do valor devido na criação da cobrança.
- Comprovantes em Storage privado, com path aleatório sem PII, autorização owner/participant no servidor e política de retenção definida.

## 5. Controles obrigatórios na Fase 2

1. Credenciais exclusivamente server-side, segregadas por ambiente e por conta recebedora.
2. Webhook autenticado conforme mecanismo oficial do PSP (assinatura/HMAC ou mTLS); rejeitar callback sem validação.
3. Deduplicar por ID de evento/transação e processar em transação; tolerar repetição, atraso e ordem diferente dos eventos.
4. Buscar/confirmar o pagamento no PSP antes de aceitar `paid`; comparar conta recebedora, booking, valor, moeda e status.
5. Chave de idempotência estável por tentativa; nunca criar uma nova cobrança apenas por timeout sem consultar a tentativa anterior.
6. Não aceitar valor, destinatário, taxa, split ou status enviados pelo navegador como autoridade.
7. Reembolso é operação separada, autenticada, idempotente e auditada; considerar saldo insuficiente e devoluções parciais do PSP.
8. Não armazenar dados de cartão. Usar checkout/tokenização hospedada pelo PSP se cartão for aprovado no futuro.
9. Limitar logs a IDs internos, estado e código de erro; não registrar credenciais, payload integral, comprovantes ou dados bancários.

## 6. Decisões necessárias do responsável

- Cobrança integral ou sinal? Se sinal, percentual/valor fixo e quem pode alterá-lo?
- Todo prestador é obrigado a cobrar? O cliente pode reservar sem pagamento?
- Qual prazo de pagamento e quando o horário é liberado? O prazo é o mesmo de `booking_hold_minutes`?
- Quem aprova comprovantes e qual regra de cancelamento/reembolso?
- A Fase 1 manual está aprovada?
- Quando houver evidência de uso, qual PSP e qual conta recebe os valores? Há necessidade de split/comissão do Marcou?
- Quais tarifas e condições contratuais foram confirmadas para essa conta?

Até essas decisões: manter a Issue #28 aberta como `OWNER_DECISION`; não criar migration, checkout, webhook, secret, conta PSP ou transação real.

## 7. Referências oficiais consultadas

- [Asaas — visão geral das APIs](https://docs.asaas.com/docs/visao-geral)
- [Asaas — estornar cobrança Pix (integral/parcial e saldo)](https://docs.asaas.com/reference/estornar-cobranca)
- [Asaas — split de pagamento e eventos](https://central.ajuda.asaas.com/hc/pt-br/articles/32108475474331-Split-de-Pagamento)
- [Mercado Pago — integração Pix (QR Code, copia-e-cola e idempotência)](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [Mercado Pago — notificações de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications)
- [Mercado Pago — split 1:1 para marketplace](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- [Efí — webhooks Pix e mTLS](https://dev.efipay.com.br/docs/api-pix/webhooks/)
- [Efí — split de pagamento Pix](https://dev.efipay.com.br/docs/api-pix/split-de-pagamento-pix/)
- [Efí — credenciais e escopos da API Pix](https://dev.efipay.com.br/docs/api-pix/credenciais/)
