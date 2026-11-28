import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  InMemoryEmailQueueStore,
  NoopEmailSender,
  buildEmailIdempotencyKey,
  buildReservationLink,
  calculateEmailBackoffSeconds,
  createEmailSender,
  formatBookingTimeForEmail,
  isEmailDeliveryEnabled,
  processEmailQueueBatch,
  renderBookingEmailMessage,
  type EmailDeliveryContext,
  type EmailMessage,
  type EmailSender,
} from "./index";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_OWNER_ID = "33333333-3333-4333-8333-333333333333";

function makeContext(
  overrides: Partial<EmailDeliveryContext> = {},
): EmailDeliveryContext {
  return {
    recipientEmail: "cliente@example.com",
    emailPreferenceEnabled: true,
    serviceNameSnapshot: "Corte + Barba",
    startsAtIso: "2026-12-02T01:30:00.000Z", // 01/12/2026 22:30 em America/Sao_Paulo
    providerTimezone: "America/Sao_Paulo",
    siteUrl: "https://marcoou.netlify.app/alguma/rota?token=secreto",
    ...overrides,
  };
}

describe("email templates, privacy and timezone formatting (#26)", () => {
  it("formats booking time in the provider timezone even across UTC midnight", () => {
    expect(
      formatBookingTimeForEmail("2026-12-02T01:30:00.000Z", "America/Sao_Paulo"),
    ).toBe("01/12/2026 às 22:30");

    expect(
      formatBookingTimeForEmail("2026-12-02T01:30:00.000Z", "America/Manaus"),
    ).toBe("01/12/2026 às 21:30");
  });

  it("links strictly to /reserva/[id] using origin only and rejects invalid IDs", () => {
    expect(
      buildReservationLink(
        "https://marcoou.netlify.app/painel?secret=abc#hash",
        BOOKING_ID,
      ),
    ).toBe(`https://marcoou.netlify.app/reserva/${BOOKING_ID}`);

    expect(() =>
      buildReservationLink("https://marcoou.netlify.app", "../admin"),
    ).toThrow("invalid_booking_id");
    expect(() =>
      buildReservationLink("javascript:alert(1)", BOOKING_ID),
    ).toThrow("invalid_site_url");
  });

  it("renders distinct pt-BR copy per recipient role without third-party PII and escapes HTML", () => {
    const customerMsg = renderBookingEmailMessage({
      to: "cliente@example.com",
      bookingId: BOOKING_ID,
      eventType: "booking.reminder",
      recipientRole: "customer",
      windowKey: "20261201",
      serviceNameSnapshot: 'Corte <script>alert("x")</script>',
      startsAtIso: "2026-12-02T01:30:00.000Z",
      providerTimezone: "America/Sao_Paulo",
      siteUrl: "https://marcoou.netlify.app",
    });

    expect(customerMsg.subject).toContain("Lembrete");
    expect(customerMsg.text).toContain("01/12/2026 às 22:30");
    expect(customerMsg.text).toContain(
      `https://marcoou.netlify.app/reserva/${BOOKING_ID}`,
    );
    expect(customerMsg.html).not.toContain("<script>");
    expect(customerMsg.html).toContain("&lt;script&gt;");
    // Único link permitido no HTML é /reserva/[id]
    const hrefs = [...customerMsg.html.matchAll(/href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs).toEqual([`https://marcoou.netlify.app/reserva/${BOOKING_ID}`]);

    const providerMsg = renderBookingEmailMessage({
      to: "prestador@example.com",
      bookingId: BOOKING_ID,
      eventType: "booking.reminder",
      recipientRole: "provider",
      windowKey: "20261201",
      serviceNameSnapshot: "Corte + Barba",
      startsAtIso: "2026-12-02T01:30:00.000Z",
      providerTimezone: "America/Sao_Paulo",
      siteUrl: "https://marcoou.netlify.app",
    });
    expect(providerMsg.text).toContain("Você tem um agendamento");
    expect(providerMsg.text).not.toContain("cliente@example.com");
  });
});

describe("EmailSender default noop & fail-closed configuration (#26)", () => {
  it("stays disabled (fail-closed) when env vars are absent or noop", () => {
    expect(isEmailDeliveryEnabled({})).toBe(false);
    expect(isEmailDeliveryEnabled({ EMAIL_DELIVERY_ENABLED: "false" })).toBe(
      false,
    );
    expect(
      isEmailDeliveryEnabled({
        EMAIL_DELIVERY_ENABLED: "true",
        EMAIL_PROVIDER: "noop",
      }),
    ).toBe(false);
    expect(
      isEmailDeliveryEnabled({
        EMAIL_DELIVERY_ENABLED: "true",
        EMAIL_PROVIDER: "resend",
      }),
    ).toBe(true);
  });

  it("uses NoopEmailSender by default without network calls or PII in logs", async () => {
    const logs: Array<Record<string, unknown>> = [];
    const sender = createEmailSender({
      env: {},
      log: (event) => logs.push(event),
    });

    expect(sender).toBeInstanceOf(NoopEmailSender);
    expect(sender.providerName).toBe("noop");

    const message = renderBookingEmailMessage({
      to: "segredo.titular@example.com",
      bookingId: BOOKING_ID,
      eventType: "booking.confirmed",
      recipientRole: "customer",
      windowKey: "evt-1",
      serviceNameSnapshot: "Escova",
      startsAtIso: "2026-12-10T15:00:00.000Z",
      providerTimezone: "America/Sao_Paulo",
      siteUrl: "https://marcoou.netlify.app",
    });

    const result = await sender.send(message);
    expect(result).toEqual({
      ok: true,
      provider: "noop",
      messageId: `noop:${message.idempotencyKey}`,
      skipped: true,
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("segredo.titular@example.com");
    expect(JSON.stringify(logs)).not.toContain("Escova");
  });

  it("fails closed if an unimplemented external provider is requested", () => {
    expect(() =>
      createEmailSender({
        env: { EMAIL_DELIVERY_ENABLED: "true", EMAIL_PROVIDER: "resend" },
      }),
    ).toThrow("email_provider_not_implemented");
  });
});

describe("Email delivery queue: idempotency, backoff retry, dead state & safe reprocessing (#26)", () => {
  it("enforces idempotency by booking_id + tipo + janela + papel", async () => {
    const store = new InMemoryEmailQueueStore();
    const first = await store.enqueue({
      bookingId: BOOKING_ID,
      recipientId: CUSTOMER_ID,
      recipientRole: "customer",
      eventType: "booking.reminder",
      windowKey: "20261201",
    });
    const duplicate = await store.enqueue({
      bookingId: BOOKING_ID,
      recipientId: CUSTOMER_ID,
      recipientRole: "customer",
      eventType: "booking.reminder",
      windowKey: "20261201",
    });
    const providerSameWindow = await store.enqueue({
      bookingId: BOOKING_ID,
      recipientId: PROVIDER_OWNER_ID,
      recipientRole: "provider",
      eventType: "booking.reminder",
      windowKey: "20261201",
    });
    const nextDayWindow = await store.enqueue({
      bookingId: BOOKING_ID,
      recipientId: CUSTOMER_ID,
      recipientRole: "customer",
      eventType: "booking.reminder",
      windowKey: "20261202",
    });

    expect(first.enqueued).toBe(true);
    expect(duplicate.enqueued).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);
    expect(providerSameWindow.enqueued).toBe(true);
    expect(nextDayWindow.enqueued).toBe(true);
    expect(first.job.idempotencyKey).toBe(
      buildEmailIdempotencyKey({
        bookingId: BOOKING_ID,
        eventType: "booking.reminder",
        windowKey: "20261201",
        recipientRole: "customer",
      }),
    );
  });

  it("respects recipient email preference (default off) and does not call sender", async () => {
    const store = new InMemoryEmailQueueStore();
    const sendSpy = vi.fn();
    const mockSender: EmailSender = { providerName: "mock", send: sendSpy };

    const { job } = await store.enqueue(
      {
        bookingId: BOOKING_ID,
        recipientId: CUSTOMER_ID,
        recipientRole: "customer",
        eventType: "booking.reminder",
        windowKey: "20261201",
      },
      1_000,
    );

    const summary = await processEmailQueueBatch({
      store,
      sender: mockSender,
      now: () => 1_000,
      log: () => {},
      resolveContext: async () =>
        makeContext({ emailPreferenceEnabled: false }),
    });

    expect(summary).toEqual({
      claimed: 1,
      sent: 0,
      skippedByPreference: 1,
      retried: 0,
      dead: 0,
    });
    expect(sendSpy).not.toHaveBeenCalled();

    const updated = await store.getById(job.id);
    expect(updated?.status).toBe("sent");
    expect(updated?.providerName).toBe("preference_disabled");
  });

  it("retries transient failures with exponential backoff and delivers when provider recovers", async () => {
    expect(calculateEmailBackoffSeconds(1)).toBe(60);
    expect(calculateEmailBackoffSeconds(2)).toBe(120);
    expect(calculateEmailBackoffSeconds(3)).toBe(240);
    expect(calculateEmailBackoffSeconds(10)).toBe(3600);

    const store = new InMemoryEmailQueueStore();
    let currentTime = 1_000_000;
    const deliveredMessages: EmailMessage[] = [];
    let callCount = 0;

    const flakySender: EmailSender = {
      providerName: "mock_smtp",
      async send(message) {
        callCount += 1;
        if (callCount < 3) {
          return {
            ok: false,
            provider: "mock_smtp",
            errorCode: "provider_503",
            retryable: true,
          };
        }
        deliveredMessages.push(message);
        return {
          ok: true,
          provider: "mock_smtp",
          messageId: "msg-ok-3",
        };
      },
    };

    const { job } = await store.enqueue(
      {
        bookingId: BOOKING_ID,
        recipientId: CUSTOMER_ID,
        recipientRole: "customer",
        eventType: "booking.confirmed",
        windowKey: "evt-confirm-1",
        maxAttempts: 5,
      },
      currentTime,
    );

    // Tentativa 1: falha transitória -> backoff 60s
    const batch1 = await processEmailQueueBatch({
      store,
      sender: flakySender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () => makeContext(),
    });
    expect(batch1.retried).toBe(1);
    const after1 = await store.getById(job.id);
    expect(after1?.status).toBe("pending");
    expect(after1?.attempts).toBe(1);
    expect(after1?.nextAttemptAtMs).toBe(currentTime + 60_000);

    // Antes do backoff vencer: nada elegível
    currentTime += 30_000;
    const batchTooEarly = await processEmailQueueBatch({
      store,
      sender: flakySender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () => makeContext(),
    });
    expect(batchTooEarly.claimed).toBe(0);

    // Tentativa 2 (após 60s): falha transitória -> backoff 120s
    currentTime += 30_000;
    const batch2 = await processEmailQueueBatch({
      store,
      sender: flakySender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () => makeContext(),
    });
    expect(batch2.retried).toBe(1);
    const after2 = await store.getById(job.id);
    expect(after2?.attempts).toBe(2);
    expect(after2?.nextAttemptAtMs).toBe(currentTime + 120_000);

    // Tentativa 3 (após 120s): sucesso!
    currentTime += 120_000;
    const batch3 = await processEmailQueueBatch({
      store,
      sender: flakySender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () => makeContext(),
    });
    expect(batch3.sent).toBe(1);
    expect(deliveredMessages).toHaveLength(1);
    expect(deliveredMessages[0].to).toBe("cliente@example.com");

    const after3 = await store.getById(job.id);
    expect(after3?.status).toBe("sent");
    expect(after3?.providerMessageId).toBe("msg-ok-3");
    // Item já enviado não pode ser reprocessado
    expect(await store.reprocessDead(job.id, currentTime)).toBe(false);
  });

  it("moves exhausted or permanent failures to dead and allows safe reprocessing only from dead", async () => {
    const store = new InMemoryEmailQueueStore();
    let currentTime = 5_000_000;
    let shouldFail = true;

    const sender: EmailSender = {
      providerName: "mock_provider",
      async send() {
        if (shouldFail) {
          return {
            ok: false,
            provider: "mock_provider",
            errorCode: "timeout",
            retryable: true,
          };
        }
        return {
          ok: true,
          provider: "mock_provider",
          messageId: "msg-reprocessed",
        };
      },
    };

    const { job } = await store.enqueue(
      {
        bookingId: BOOKING_ID,
        recipientId: PROVIDER_OWNER_ID,
        recipientRole: "provider",
        eventType: "booking.cancelled",
        windowKey: "evt-cancel-9",
        maxAttempts: 2,
      },
      currentTime,
    );

    // Tentativa 1 -> retry
    await processEmailQueueBatch({
      store,
      sender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () =>
        makeContext({ recipientEmail: "prestador@example.com" }),
    });
    // Enquanto está pending (não dead), reprocessDead retorna false
    expect(await store.reprocessDead(job.id, currentTime)).toBe(false);

    // Tentativa 2 -> atinge maxAttempts=2 -> dead
    currentTime += 60_000;
    const deadBatch = await processEmailQueueBatch({
      store,
      sender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () =>
        makeContext({ recipientEmail: "prestador@example.com" }),
    });
    expect(deadBatch.dead).toBe(1);
    const deadJob = await store.getById(job.id);
    expect(deadJob?.status).toBe("dead");
    expect(deadJob?.deadAtMs).toBe(currentTime);
    expect(deadJob?.lastErrorCode).toBe("timeout");

    // Reprocessamento seguro de `dead` preserva a mesma idempotencyKey e envia quando provedor volta
    shouldFail = false;
    currentTime += 10_000;
    expect(await store.reprocessDead(job.id, currentTime)).toBe(true);
    const reopened = await store.getById(job.id);
    expect(reopened?.status).toBe("pending");
    expect(reopened?.attempts).toBe(0);
    expect(reopened?.idempotencyKey).toBe(job.idempotencyKey);
    expect(reopened?.reprocessedAtMs).toBe(currentTime);

    const recoveredBatch = await processEmailQueueBatch({
      store,
      sender,
      now: () => currentTime,
      log: () => {},
      resolveContext: async () =>
        makeContext({ recipientEmail: "prestador@example.com" }),
    });
    expect(recoveredBatch.sent).toBe(1);
    const finalJob = await store.getById(job.id);
    expect(finalJob?.status).toBe("sent");
    expect(finalJob?.providerMessageId).toBe("msg-reprocessed");
    expect(await store.reprocessDead(job.id, currentTime)).toBe(false);
  });

  it("moves non-retryable errors (e.g. hard bounce) directly to dead on first attempt", async () => {
    const store = new InMemoryEmailQueueStore();
    const hardBounceSender: EmailSender = {
      providerName: "mock_provider",
      async send() {
        return {
          ok: false,
          provider: "mock_provider",
          errorCode: "hard_bounce",
          retryable: false,
        };
      },
    };

    const { job } = await store.enqueue(
      {
        bookingId: BOOKING_ID,
        recipientId: CUSTOMER_ID,
        recipientRole: "customer",
        eventType: "booking.created",
        windowKey: "evt-created-1",
        maxAttempts: 5,
      },
      10_000,
    );

    const summary = await processEmailQueueBatch({
      store,
      sender: hardBounceSender,
      now: () => 10_000,
      log: () => {},
      resolveContext: async () => makeContext(),
    });

    expect(summary.dead).toBe(1);
    expect(summary.retried).toBe(0);
    const deadJob = await store.getById(job.id);
    expect(deadJob?.status).toBe("dead");
    expect(deadJob?.attempts).toBe(1);
    expect(deadJob?.lastErrorCode).toBe("hard_bounce");
  });
});
