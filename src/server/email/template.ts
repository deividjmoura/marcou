import "server-only";

import type { NotificationEventType } from "@/domain/notifications/preferences";
import type { EmailMessage, EmailRecipientRole } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_KEY_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Monta a chave canônica de idempotência `booking_id + tipo + janela (+ papel)`.
 * Garante unicidade por agendamento, evento, janela e destinatário.
 */
export function buildEmailIdempotencyKey(input: {
  bookingId: string;
  eventType: NotificationEventType;
  windowKey: string;
  recipientRole: EmailRecipientRole;
}): string {
  const bookingId = input.bookingId.trim();
  const windowKey = input.windowKey.trim();

  if (!UUID_PATTERN.test(bookingId)) {
    throw new Error("invalid_booking_id");
  }
  if (!WINDOW_KEY_PATTERN.test(windowKey)) {
    throw new Error("invalid_email_window_key");
  }

  return `${bookingId}:${input.eventType}:${windowKey}:${input.recipientRole}`;
}

/**
 * Gera estritamente o link autenticado `/reserva/[id]`.
 * Rejeita IDs inválidos e descarta paths/queries extras da URL base para nunca
 * embutir tokens ou redirecionamentos externos no e-mail.
 */
export function buildReservationLink(siteUrl: string, bookingId: string): string {
  const cleanId = bookingId.trim();
  if (!UUID_PATTERN.test(cleanId)) {
    throw new Error("invalid_booking_id");
  }

  let origin: string;
  try {
    const parsed = new URL(siteUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid_site_url");
    }
    origin = parsed.origin;
  } catch {
    throw new Error("invalid_site_url");
  }

  return `${origin}/reserva/${cleanId}`;
}

/**
 * Formata data e hora em pt-BR no fuso do prestador (`bookings.timezone`).
 * Nunca depende do fuso do servidor/container.
 */
export function formatBookingTimeForEmail(
  startsAtIso: string,
  providerTimezone: string,
): string {
  const date = new Date(startsAtIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_booking_starts_at");
  }

  const candidateTz = providerTimezone.trim() || DEFAULT_TIMEZONE;
  const formatWithTz = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return `${byType.get("day")}/${byType.get("month")}/${byType.get("year")} às ${byType.get("hour")}:${byType.get("minute")}`;
  };

  try {
    return formatWithTz(candidateTz);
  } catch {
    return formatWithTz(DEFAULT_TIMEZONE);
  }
}

interface CopyEntry {
  subject: string;
  headline: string;
  body: string;
}

function resolveCopy(
  eventType: NotificationEventType,
  recipientRole: EmailRecipientRole,
  serviceName: string,
  formattedWhen: string,
): CopyEntry {
  const quotedService = `"${serviceName}"`;

  switch (eventType) {
    case "booking.created":
      return recipientRole === "provider"
        ? {
            subject: "Novo agendamento recebido — Marcou",
            headline: "Novo agendamento recebido",
            body: `Você recebeu uma solicitação para ${quotedService} em ${formattedWhen}.`,
          }
        : {
            subject: "Solicitação de agendamento recebida — Marcou",
            headline: "Solicitação recebida",
            body: `Recebemos sua solicitação para ${quotedService} em ${formattedWhen}.`,
          };
    case "booking.proof_received":
      return {
        subject: "Comprovante recebido — Marcou",
        headline: "Comprovante recebido",
        body: `Recebemos o comprovante da solicitação para ${quotedService} em ${formattedWhen}.`,
      };
    case "booking.confirmed":
      return recipientRole === "provider"
        ? {
            subject: "Agendamento confirmado — Marcou",
            headline: "Agendamento confirmado",
            body: `O agendamento de ${quotedService} em ${formattedWhen} foi confirmado.`,
          }
        : {
            subject: "Seu agendamento foi confirmado — Marcou",
            headline: "Agendamento confirmado",
            body: `Seu agendamento de ${quotedService} em ${formattedWhen} foi confirmado.`,
          };
    case "booking.cancelled":
      return recipientRole === "provider"
        ? {
            subject: "Agendamento cancelado — Marcou",
            headline: "Agendamento cancelado",
            body: `A solicitação para ${quotedService} em ${formattedWhen} foi cancelada.`,
          }
        : {
            subject: "Agendamento cancelado — Marcou",
            headline: "Agendamento cancelado",
            body: `Sua solicitação para ${quotedService} em ${formattedWhen} foi cancelada.`,
          };
    case "booking.expired":
      return recipientRole === "provider"
        ? {
            subject: "Reserva expirada — Marcou",
            headline: "Reserva expirada",
            body: `A reserva para ${quotedService} em ${formattedWhen} expirou e o horário foi liberado.`,
          }
        : {
            subject: "Reserva expirada — Marcou",
            headline: "Reserva expirada",
            body: `Sua reserva para ${quotedService} em ${formattedWhen} expirou por falta de confirmação do sinal.`,
          };
    case "booking.reminder":
      return recipientRole === "provider"
        ? {
            subject: "Lembrete de agendamento — Marcou",
            headline: "Lembrete de agendamento",
            body: `Você tem um agendamento de ${quotedService} em ${formattedWhen}.`,
          }
        : {
            subject: "Lembrete do seu agendamento — Marcou",
            headline: "Lembrete de agendamento",
            body: `Seu agendamento de ${quotedService} é em ${formattedWhen}.`,
          };
    case "booking.changed":
      return recipientRole === "provider"
        ? {
            subject: "Agendamento alterado — Marcou",
            headline: "Agendamento alterado",
            body: `O agendamento de ${quotedService} em ${formattedWhen} foi atualizado.`,
          }
        : {
            subject: "Seu agendamento foi alterado — Marcou",
            headline: "Agendamento alterado",
            body: `Seu agendamento de ${quotedService} em ${formattedWhen} foi atualizado.`,
          };
  }
}

/**
 * Monta mensagem de e-mail pt-BR sem dados pessoais de terceiros, usando apenas
 * o nome do serviço congelado, o horário no fuso do prestador e o link único
 * autenticado `/reserva/[id]`.
 */
export function renderBookingEmailMessage(input: {
  to: string;
  bookingId: string;
  eventType: NotificationEventType;
  recipientRole: EmailRecipientRole;
  windowKey: string;
  serviceNameSnapshot: string;
  startsAtIso: string;
  providerTimezone: string;
  siteUrl: string;
}): EmailMessage {
  const recipientEmail = input.to.trim();
  if (!recipientEmail || !recipientEmail.includes("@")) {
    throw new Error("invalid_recipient_email");
  }

  const serviceName = input.serviceNameSnapshot.trim() || "Serviço agendado";
  const formattedWhen = formatBookingTimeForEmail(
    input.startsAtIso,
    input.providerTimezone,
  );
  const reservationUrl = buildReservationLink(input.siteUrl, input.bookingId);
  const idempotencyKey = buildEmailIdempotencyKey({
    bookingId: input.bookingId,
    eventType: input.eventType,
    windowKey: input.windowKey,
    recipientRole: input.recipientRole,
  });

  const copy = resolveCopy(
    input.eventType,
    input.recipientRole,
    serviceName,
    formattedWhen,
  );

  const text = [
    copy.headline,
    "",
    copy.body,
    "",
    `Acompanhe os detalhes da reserva (requer login): ${reservationUrl}`,
    "",
    "Mensagem automática do Marcou. Por segurança, nenhum dado pessoal de terceiros é incluído neste e-mail.",
  ].join("\n");

  const safeHeadline = escapeHtml(copy.headline);
  const safeBody = escapeHtml(copy.body);
  const safeUrl = escapeHtml(reservationUrl);

  const html = [
    '<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;color:#33272b;line-height:1.5;">',
    `<h1 style="font-size:20px;margin:0 0 12px;">${safeHeadline}</h1>`,
    `<p style="margin:0 0 16px;">${safeBody}</p>`,
    `<p style="margin:0 0 20px;"><a href="${safeUrl}">Ver detalhes da reserva</a></p>`,
    '<p style="font-size:12px;color:#736368;margin:0;">O acesso exige login na sua conta do Marcou. Por privacidade, nenhum dado pessoal de terceiros é exibido neste e-mail.</p>',
    "</body></html>",
  ].join("");

  return {
    to: recipientEmail,
    subject: copy.subject,
    text,
    html,
    idempotencyKey,
    tags: {
      eventType: input.eventType,
      recipientRole: input.recipientRole,
    },
  };
}
