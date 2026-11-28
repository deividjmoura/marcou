# ADR: Provedor de e-mail transacional e arquitetura de fila (Issue `#26`)

- **Status:** Proposto — aguarda `OWNER_DECISION` (escolha do provedor e do domínio remetente).
- **Data:** 2026-11-28
- **Issue relacionada:** `#26` (coordenada com `#13` — preferências de notificação — e `#30` — provisionamento).
- **Estado atual na aplicação:** **Desligado por padrão.** Nenhuma credencial de provedor existe, nenhuma dependência de envio externo foi instalada e **nenhum e-mail real é enviado**.

---

## 1. Contexto

O Marcou já possui notificações internas (`public.notifications`) geradas transacionalmente a partir de `public.booking_events`, lembretes agendáveis via `GET /api/cron` → `create_booking_reminders(24)` com idempotência diária no fuso do prestador (`bookings.timezone`), e preferências por usuário (`public.notification_preferences`, PR `#161`), cujo padrão documentado é:

- canal `in_app`: **ligado** (`true`) por padrão (`booking.cancelled` e `booking.changed` obrigatórios);
- canal `email`: **desligado** (`false`) por padrão até que o responsável escolha um provedor, verifique o domínio remetente e habilite o canal explicitamente.

Precisamos preparar o desenho técnico e operacional para envio de e-mails transacionais de agendamento (solicitação, comprovante, confirmação, cancelamento, alteração, expiração e lembrete) com segurança, entregabilidade e aderência à LGPD, sem ativar envios reais antes da decisão do responsável.

---

## 2. Critérios de avaliação

### 2.1 Entregabilidade e autenticação DNS
Para evitar caixa de spam em provedores predominantes no Brasil (Gmail, Outlook/Hotmail, Yahoo, iCloud, UOL/BOL):
- **Domínio próprio dedicado** (recomendado subdomínio transacional, ex.: `avisos.<dominio-do-marcou>`, separando reputação de e-mails transacionais de eventuais campanhas futuras).
- **SPF** publicado em TXT autorizando exclusivamente o provedor escolhido (evitando exceder o limite de 10 lookups DNS).
- **DKIM** com assinatura criptográfica de 2048 bits gerenciada por chaves rotacionáveis do provedor.
- **DMARC** publicado (`v=DMARC1; p=quarantine; rua=...` na fase inicial, evoluindo para `p=reject` após validação dos relatórios), com alinhamento entre domínio `From` e `DKIM`/`Return-Path`.
- **Return-Path personalizado** no domínio do Marcou para alinhamento SPF e recebimento confiável de bounces.

### 2.2 Custo e limites operacionais
Estimativa inicial para MVP brasileiro (centenas a poucos milhares de agendamentos/mês, ~2–4 e-mails transacionais por reserva apenas para usuários com `channel = 'email'` habilitado):
- **Fase MVP:** 1.000 a 3.000 e-mails/mês.
- **Fase crescimento:** 10.000 a 50.000 e-mails/mês.
- Limites importantes: cota diária (evitar bloqueio em dias de pico), taxa por segundo (rate limit para picos de lembretes 24h) e comportamento de sandbox inicial.

### 2.3 Tratamento de *bounce* e reclamação (*complaint*)
- **Hard bounce** (endereço inexistente ou domínio inválido): **não** entrar em loop de retry; marcar job como estado terminal `dead` (`retryable = false`, `last_error_code = 'hard_bounce'`) e registrar o endereço em lista de supressão para não degradar a reputação do domínio.
- **Soft bounce / rate limit / HTTP 5xx / timeout:** erro transitório (`retryable = true`); reprocessar com *backoff* exponencial até atingir `max_attempts` (padrão `5`), quando transita para `dead`.
- **Reclamação de spam (*complaint*):** supressão imediata de envios futuros (ou desativação da preferência `email` do usuário) e alerta operacional; manter taxa de reclamação `< 0,1%` e hard bounce `< 2%`.
- **Webhooks assinados:** o provedor escolhido deve oferecer webhook com assinatura criptográfica (HMAC/Svix) para eventos `bounced`, `complained` e `delivered`.

### 2.4 Templates em pt-BR e segurança de conteúdo
- **Idioma e codificação:** português do Brasil (`pt-BR`), UTF-8 completo (acentuação correta), sempre com versão **texto plano (`text`) + HTML enxuto (`html`)** sem imagens remotas de rastreamento (*tracking pixels*).
- **Fuso horário:** data e hora sempre formatadas no **fuso do prestador** (`bookings.timezone`, ex.: `America/Sao_Paulo`), consistentes com as notificações no aplicativo.
- **Sem exposição de dados de terceiros:** o corpo do e-mail contém **apenas** o nome congelado do serviço (`service_name_snapshot`), data/hora no fuso do prestador e o contexto mínimo do status — **nunca** inclui nome completo, telefone, e-mail, endereço ou observações privadas do outro participante.
- **Link exclusivo autenticado:** o único link de ação no e-mail aponta estritamente para `${NEXT_PUBLIC_SITE_URL}/reserva/${booking_id}`, rota que exige autenticação de um participante legítimo da reserva (RLS + verificação de conta). Sem tokens mágicos em query string e sem deep-links não autenticados.

### 2.5 LGPD e privacidade
- **Minimização de dados:** o payload trafegado ao provedor contém apenas endereço de e-mail do destinatário, serviço congelado, data/hora e URL `/reserva/[id]`. A tabela de fila local (`public.email_delivery_queue`) **não armazena endereço de e-mail nem texto do corpo**, apenas IDs internos (`booking_id`, `recipient_id`, `event_type`, `window_key`, `status`, `last_error_code`).
- **Preferência do titular:** o canal `email` nasce desligado por padrão (`notification_preferences`, Issue `#13`) e respeita opt-in/opt-out antes do envio.
- **Suboperador e transferência internacional:** exigir DPA (*Data Processing Agreement*) assinado com o provedor escolhido e documentá-lo na Política de Privacidade (`/privacidade`) antes de ativar o envio real.
- **Retenção e expurgo:** configurar retenção mínima de logs no provedor (ex.: 7–30 dias sem armazenamento prolongado de corpo) e rotina futura de limpeza de registros `sent`/`dead` antigos na fila local (ex.: > 90 dias).
- **Logs da aplicação:** nunca registrar endereço de e-mail, assunto ou corpo nos logs estruturados; registrar apenas `jobId`, `idempotencyKey`, `eventType`, `provider`, `status` e `errorCode`.

---

## 3. Comparativo de provedores

| Critério | Resend | Postmark | Amazon SES | Brevo (ex-Sendinblue) |
| --- | --- | --- | --- | --- |
| **Foco transacional** | Alto (API moderna REST/HTTP) | Muito alto (streams separados transacional × broadcast) | Alto (infraestrutura AWS) | Médio (plataforma mista marketing + transacional) |
| **Entregabilidade / DNS** | Excelente; setup guiado SPF/DKIM/DMARC e Return-Path | Referência de mercado em tempo de entrega e reputação | Excelente após sair do sandbox e configurar DNS/IP | Boa, mas requer disciplina para não misturar com marketing |
| **Faixa gratuita / MVP** | 3.000/mês (limite 100/dia) | 100/mês (sandbox/dev); plano inicial US$ 15/mês (10k) | ~US$ 0,10 por 1.000 e-mails (sem free tier fora EC2) | 300/dia grátis (~9.000/mês) |
| **Custo 50k/mês (aprox.)** | ~US$ 20/mês | ~US$ 55/mês | ~US$ 5/mês (+ SNS/SQS mínimo) | ~US$ 35–45/mês |
| **Rate limit e sandbox** | 2 req/s no free (escalável); sem burocracia de sandbox | Sem sandbox demorado após aprovação de domínio | Exige ticket AWS para sair do sandbox; alto throughput | Limite diário restrito no free; bom em planos pagos |
| **Bounce / Complaint webhooks** | Sim (webhooks assinados Svix + supressão) | Sim (webhooks nativos + supressão automática excelente) | Sim, mas exige configurar SNS + HTTPS endpoint/assinatura | Sim (webhooks HTTP + blacklist) |
| **Complexidade de integração no Netlify/Next.js** | **Muito baixa** (`fetch` direto na API REST com header `Idempotency-Key`, sem SDK pesado) | **Baixa** (`fetch` direto na API REST) | **Média/Alta** (assinatura AWS SigV4 ou AWS SDK + IAM + SNS) | **Baixa** (`fetch` direto na API REST) |
| **LGPD / DPA** | DPA disponível (servidores EUA/UE; permite região `sa-east-1` em planos) | DPA disponível (EUA/UE, foco forte em privacidade transacional) | DPA AWS + região `sa-east-1` (São Paulo) disponível | DPA disponível (empresa europeia, GDPR/UE) |

---

## 4. Decisão recomendada (aguardando confirmação do responsável)

1. **Recomendação primária para o MVP: Resend**
   - Integração limpa via `fetch` nativo (zero SDK pesado), suporte nativo a cabeçalho `Idempotency-Key` no provedor, setup DNS guiado (SPF/DKIM/DMARC), webhooks assinados de bounce/complaint e custo zero até 3.000 e-mails/mês (com atenção ao teto de 100/dia no plano gratuito — migrar para o plano pago antes de ultrapassar ~70 envios/dia).
2. **Alternativa focada em entregabilidade transacional máxima: Postmark**
   - Melhor escolha caso o responsável já deseje iniciar em plano pago (US$ 15/mês) priorizando SLA de entrega transacional e gestão automática de supressões desde o dia 1.
3. **Alternativa para residência estrita no Brasil (`sa-east-1`) e menor custo em escala: Amazon SES**
   - Indicada caso o responsável já mantenha conta AWS produtiva e aceite o custo operacional adicional de sair do sandbox e configurar SNS para bounces/reclamações.

### Itens de `OWNER_DECISION` necessários antes de ativar envio real
1. Confirmar o **provedor escolhido** (Resend, Postmark, Amazon SES ou outro).
2. Definir e verificar o **domínio/subdomínio remetente** (ex.: `avisos.<dominio>` com SPF, DKIM e DMARC publicados).
3. Atualizar a Política de Privacidade (`/privacidade`) com o suboperador de e-mail e assinar o DPA.
4. Provisionar as variáveis de ambiente futuras **apenas no ambiente desejado** (nenhuma ativa hoje):
   - `EMAIL_DELIVERY_ENABLED` (`false` por padrão — fail-closed)
   - `EMAIL_PROVIDER` (`noop` por padrão)
   - `EMAIL_FROM` (ex.: `Marcou <avisos@seu-dominio.com.br>`)
   - Chave da API do provedor escolhido e segredo do webhook de bounce/complaint.

---

## 5. Fundação técnica já entregue no repositório (sem envio real)

Mesmo antes da decisão do provedor, esta entrega deixa pronta e testada a camada neutra de entrega:

- **Interface `EmailSender` e implementação padrão `NoopEmailSender`** (`src/server/email/sender.ts`):
  - Não realiza nenhuma chamada de rede nem envia mensagens reais.
  - Emite apenas log estruturado sem PII (`scope`, `mode: "noop"`, `eventType`, `recipientRole`, `idempotencyKey`).
  - `isEmailDeliveryEnabled()` é **fail-closed** (`false` por padrão).
- **Renderizador de templates pt-BR sem PII de terceiros** (`src/server/email/template.ts`):
  - Formata horários no fuso do prestador (`bookings.timezone`), escapa HTML, não inclui dados de terceiros e gera link exclusivamente para `/reserva/[id]`.
- **Persistência server-only de enfileiramento e reprocessamento (não é ainda um worker durável):**
  - Migration `supabase/migrations/20261128000700_email_delivery_queue.sql` cria `public.email_delivery_queue` com RLS ativa, `REVOKE ALL` para `PUBLIC`/`anon`/`authenticated` e `GRANT ALL` para `service_role`; a tabela não guarda endereço de e-mail nem corpo.
  - As RPCs `enqueue_email_delivery()` e `reprocess_dead_email_delivery()` persistem a criação idempotente e o reprocessamento de itens `dead`. A migration seguinte valida o vínculo entre destinatário e reserva e reafirma os grants server-only.
  - Chave de idempotência canônica: `${booking_id}:${event_type}:${window_key}:${recipient_role}`.
  - **Limitação importante:** a única implementação de `EmailQueueStore` é `InMemoryEmailQueueStore`. O processador `processEmailQueueBatch()` implementa claim/lease/backoff/retry/dead apenas nesse store em memória; não existe adaptador PostgreSQL que faça claim atômico (`SKIP LOCKED`) e transições condicionadas ao lease. Portanto, esses estados e retries ainda não são duráveis nem executados contra `email_delivery_queue`; a fila não está pronta para produção.
  - O `NoopEmailSender` não reivindica itens nem os marca como enviados. Sem provedor real, os jobs permanecem pendentes e nenhum e-mail é enviado.
- **Nenhum trigger, cron ou worker automático enfileira ou envia e-mail** até decisão do responsável, implementação de adaptador persistente e integração com o provedor escolhido.
