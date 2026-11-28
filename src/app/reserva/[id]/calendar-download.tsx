interface CalendarDownloadButtonProps {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  serviceName: string;
  providerName: string;
  durationMinutes?: number;
  priceCents?: number;
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toCalendarDate(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatPrice(cents: number | undefined): string | null {
  if (cents === undefined || !Number.isFinite(cents)) return null;
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function CalendarDownloadButton({
  bookingId,
  startsAt,
  endsAt,
  createdAt,
  serviceName,
  providerName,
  durationMinutes,
  priceCents,
}: CalendarDownloadButtonProps) {
  const title = escapeCalendarText(serviceName);
  const details: string[] = [`Agendamento com ${providerName}.`];
  if (durationMinutes && durationMinutes > 0) {
    details.push(`Duração total: ${durationMinutes} min.`);
  }
  const price = formatPrice(priceCents);
  if (price) {
    details.push(`Valor: ${price}.`);
  }
  const description = escapeCalendarText(details.join(" "));

  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marcou//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${bookingId}@marcou.app`,
    `DTSTAMP:${toCalendarDate(createdAt)}`,
    `DTSTART:${toCalendarDate(startsAt)}`,
    `DTEND:${toCalendarDate(endsAt)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeCalendarText(`Lembrete: ${serviceName} em 1 hora`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`;

  return (
    <a
      className="reservation-calendar-link"
      href={href}
      download="marcou-agendamento.ics"
      aria-label="Adicionar este agendamento ao calendário com lembrete de uma hora"
    >
      <span className="reservation-calendar-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17M8 14h3M8 17h7" />
        </svg>
      </span>
      <span className="reservation-calendar-copy">
        <strong>Adicionar ao calendário</strong>
        <small>Lembrete 1 hora antes</small>
      </span>
      <span className="reservation-calendar-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
