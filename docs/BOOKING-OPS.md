# Booking operations — ciclo de vida da reserva (Issue #25)

**Status:** auditoria e documentação operacional com base no código em `main`.  
**Branch:** `feat/25-booking-ops-lifecycle`  
**Não faz:** multi-serviço (#21), payments provider (#28), cron remoto (depende de #30/#26 + autorização).

Complementa `docs/MOTOR-RESERVAS.md` e `docs/CONTRATO-DOMINIO-AGENDAMENTOS.md` com a **matriz operacional**, políticas pendentes e checklist de jobs.

---

## 1. Estados

| Status | Significado | Ocupa horário? | `expires_at` |
|--------|-------------|----------------|--------------|
| `pending_payment` | Reserva criada; aguarda comprovante/sinal | **Sim**, enquanto `expires_at > now` | Definido na criação (`now + booking_hold_minutes`) |
| `pending_review` | Comprovante recebido; aguarda prestador | **Sim**, enquanto `expires_at > now` | Mantido até confirmar ou expirar |
| `confirmed` | Confirmado pelo prestador | **Sim** até o fim do intervalo | `null` |
| `cancelled` | Cancelado por cliente ou prestador | **Não** | irrelevante |
| `expired` | Hold vencido sem confirmação | **Não** | mantido para auditoria |

Implementação de ocupação: `bookingOccupiesTime` em `src/domain/bookings/booking.ts`.

Histórico **não** é apagado: status muda; eventos em `booking_events`.

---

## 2. Matriz de transições (domínio + banco)

Eventos de domínio (`BookingEvent`): `proof_received` | `payment_approved` | `cancel` | `expire`.

| De → Evento | Para | Quem (RPC) | Notas |
|-------------|------|------------|-------|
| `pending_payment` → `proof_received` | `pending_review` | cliente ou prestador | Nunca confirma direto |
| `pending_review` → `payment_approved` | `confirmed` | **somente prestador** | Zera `expires_at` |
| `pending_payment` → `payment_approved` | *inválido* | — | Testado no domínio |
| `pending_review` → `proof_received` | *inválido* | — | Idem |
| `*` ativo → `cancel` | `cancelled` | cliente ou prestador | Libera slot |
| `pending_*` vencido → `expire` | `expired` | prestador (RPC) ou **sistema** (`expire_stale_bookings`) | Só se `expires_at <= now` |
| `confirmed` → `expire` | *inválido* | — | Confirmado não expira por hold |
| `cancelled` / `expired` → qualquer | *inválido* | — | Sem reativação automática |

Se a reserva já venceu e chega outro evento (exceto o fluxo de expiração), o banco/RPC marca expiração e a aplicação deve tratar `booking_expired` (ver motor).

**Terminal states:** `cancelled`, `expired`. Não há transição de volta sem decisão de produto futura (fora de escopo).

---

## 3. Criação e hold

1. `create_booking` (security definer) cria `pending_payment`.
2. `expires_at = now() + providers.booking_hold_minutes`.
3. Constraint: `booking_hold_minutes` entre 1 e 1440 (migration `202611150002`).
4. Default de schema: **30 minutos** (configurável por prestador).
5. Antes de inserir: advisory lock por prestador + expira conflitos vencidos no intervalo + GiST anti-overlap.
6. Idempotência por `p_idempotency_key`.

A UI **não** é a fonte da verdade: revalidação é no banco.

---

## 4. Expiração automática

### Função

`expire_stale_bookings()` (migration de operações):

- Atualiza `pending_payment` e `pending_review` com `expires_at <= now()` → `expired`.
- Insere `booking.expired` em `booking_events` de forma idempotente (`on conflict` / ausência de evento prévio).
- Retorna contagem de linhas atualizadas.
- **Grant:** `service_role` apenas (não `anon` / `authenticated`).

### Onde já roda “inline”

Na criação de nova reserva, conflitos pendentes vencidos no intervalo são expirados antes do insert (serialização + limpeza).

### O que já está versionado e o que depende de operação

| Item | Estado |
|------|--------|
| Cron / scheduler periódico | **Versionado** em `.github/workflows/booking-expiration.yml` (PR #128, mecanismo canônico único para `expire_stale_bookings()`); **desligado por padrão** (`BOOKING_EXPIRATION_ENABLED != 'true'`) |
| Isolamento de ambiente | Restrito ao GitHub Environment `booking-expiration-staging` com validação de hostname e **recusa explícita** do project ref de produção (`peornypgltuueubmsucm`) |
| Secret de autenticação do job | Provisionamento pendente pelo responsável em `booking-expiration-staging` (#30); ver `docs/BOOKING-EXPIRATION-SCHEDULER.md` |
| Observabilidade | Histórico de runs do GitHub Actions + log de `expired_count` sem PII; alertas externos pendentes (#30) |

Propostas paralelas de endpoint HTTP de expiração (ex.: `POST /api/bookings/expire`)
foram descartadas para evitar competição entre múltiplos schedulers. A rota
`GET /api/cron` (PR #38) é exclusiva de lembretes (`create_booking_reminders(24)`).

**Requisitos operacionais (ativação pelo responsável):**

1. Chamar só com `service_role` em ambiente isolado (staging primeiro).
2. Manter idempotência (já garantida pela RPC e testada em `scripts/db-check.mjs`).
3. Logs: timestamp UTC, status e `expired_count`, sem corpo de erro da API ou PII.
4. Intervalo versionado: a cada 5 minutos (best-effort no GitHub Actions; criação de reserva continua expirando conflitos inline).
5. Não apagar linhas de `bookings` / `booking_events`.

---

## 5. Cancelamento — política de produto (lacunas)

O **mecanismo** (`cancel` → `cancelled`) existe e libera o horário. A **política comercial** ainda precisa de decisão do responsável:

| Pergunta | Estado no código |
|----------|------------------|
| Antecedência mínima para o cliente cancelar | **Não** codificada (qualquer ativo pode cancelar se autorizado) |
| Prestador pode cancelar sempre? | Sim, se dono do prestador (RPC) |
| Reembolso de sinal | **Fora** — depende de #28 |
| Multa / taxa | Não implementada |
| Cancelamento após `confirmed` próximo do horário | Permitido tecnicamente; regra de negócio pendente |
| Notificação no cancelamento | Sim (pipeline de notificações internas, PR #5) |

**Recomendação documental (não implementada):** registrar no painel do prestador campos futuros `cancel_min_hours_customer` e política de reembolso *depois* de #28; até lá, manter comportamento atual e deixar explícito na UI que a política comercial ainda será definida.

---

## 6. Idempotência, concorrência e falhas

| Mecanismo | Uso |
|-----------|-----|
| `pg_advisory_xact_lock(provider)` | Serializa creates por prestador |
| GiST exclusion | Garante não sobreposição de ativos |
| Idempotency key | Create repetido devolve a mesma reserva |
| `expire_stale_bookings` + unique de eventos | Expiração repetível sem eventos duplicados |
| Domínio puro `transitionBooking` | Testado em Vitest; persistência só via RPC |

Falhas esperadas (aplicação deve mapear mensagens):

- `slot_unavailable` / overlap
- `booking_expired`
- transição ilegal (`BookingTransitionError`)
- não autenticado / não participante

---

## 7. Testes existentes vs. gaps

**Existem (não inventar %):**

- Domínio: `booking.test.ts` (transições, ocupação, overlap, adjacência).
- DB: `test:db` exercita conflito, concorrência, expiração, idempotência, isolamento (conforme `MOTOR-RESERVAS.md`).

**Gaps para #25:**

- [ ] Job de expiração em ambiente real (staging) — requer platform.
- [ ] Teste automatizado do cron (contract test com service role) quando houver harness.
- [ ] Regras de antecedência de cancelamento — após decisão de produto.
- [ ] Matriz E2E confirmação/cancelamento — issue #31.

---

## 8. Critérios de aceite #25 — progresso

| Critério | Status |
|----------|--------|
| Matriz de transições documentada e alinhada ao código | **Sim** (este doc + testes de domínio) |
| Expiração automática por mecanismo agendado documentado | **Sim** (`.github/workflows/booking-expiration.yml` + `docs/BOOKING-EXPIRATION-SCHEDULER.md`, desligado por padrão até configuração de staging pelo responsável) |
| Cancelamento respeita regras definidas e autorização | **Autorização sim**; **regras comerciais de antecedência/reembolso pendentes** |
| Horários liberados sem perder auditoria | **Sim** (status + `booking_events`) |
| Testes de integração e docs atualizados | **Docs sim**; testes já existentes no motor; sem novos testes de cron |

---

## 9. Relação com outras issues

| Issue | Relação |
|-------|---------|
| #21 multi-serviço | Não alterar aqui; duração combinada afetará create/slots depois |
| #26 notificações | Lembretes e expire job compartilham scheduler |
| #28 payments | `pending_payment` / comprovante ganham significado financeiro |
| #30 platform | Provisionar cron + secrets |
| #31 quality | E2E dos caminhos de transição |

---

## 10. Decisões que precisam do responsável

1. Antecedência mínima de cancelamento (cliente vs prestador).
2. Política de reembolso de sinal (após provedor de pagamento).
3. Frequência do cron de `expire_stale_bookings` e quem opera as credenciais.
4. Se `pending_review` deve ter hold diferente de `pending_payment` (hoje o mesmo `expires_at`).

Até lá, o sistema permanece correto com o hold único e cancelamento autorizado sem multa automatizada.
