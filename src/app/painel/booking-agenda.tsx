"use client";

import { useMemo, useState } from "react";
import type { Booking } from "@/server/bookings";
import {
  BOOKING_STATUS_CLASSES,
  BOOKING_STATUS_LABELS,
  formatBookingDate,
  formatBookingTime,
  formatCents,
} from "@/lib/format";
import {
  filterAgendaBookings,
  groupAgendaByLocalDate,
  type AgendaPeriod,
} from "@/domain/agenda/agenda";
import { providerBookingAction } from "./actions";

const PERIOD_OPTIONS: Array<{ id: AgendaPeriod; label: string }> = [
  { id: "upcoming", label: "Próximos" },
  { id: "past", label: "Anteriores" },
  { id: "all", label: "Todos" },
];

function BookingActions({ booking }: { booking: Booking }) {
  return (
    <div className="item-actions">
      {booking.status === "pending_payment" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="proof_received" />
          <button type="submit" className="btn btn-small">
            Marcar comprovante
          </button>
        </form>
      ) : null}

      {booking.status === "pending_review" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="payment_approved" />
          <button type="submit" className="btn btn-small">
            Confirmar pagamento
          </button>
        </form>
      ) : null}

      {booking.status === "pending_payment" ||
      booking.status === "pending_review" ||
      booking.status === "confirmed" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="cancel" />
          <button type="submit" className="btn btn-small btn-ghost">
            Cancelar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function emptyMessage(options: {
  total: number;
  period: AgendaPeriod;
  searching: boolean;
}): string {
  if (options.total === 0) return "Nenhum agendamento por enquanto.";
  if (options.searching) {
    return "Nenhum agendamento corresponde a essa busca.";
  }
  if (options.period === "upcoming") {
    return "Nenhum agendamento futuro por enquanto.";
  }
  if (options.period === "past") {
    return "Nenhum agendamento anterior registrado.";
  }
  return "Nenhum agendamento para este filtro.";
}

export function BookingAgenda({
  bookings,
  failed = false,
}: {
  bookings: Booking[];
  failed?: boolean;
}) {
  const [period, setPeriod] = useState<AgendaPeriod>("all");
  const [search, setSearch] = useState("");
  // O relógio é lido apenas no clique do filtro (no cliente), nunca durante a
  // renderização, para não divergir do HTML gerado no servidor.
  const [now, setNow] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (now === null) return filterAgendaBookings(bookings, { period: "all", search, now: 0 });
    return filterAgendaBookings(bookings, { period, search, now });
  }, [bookings, now, period, search]);

  const grouped = useMemo(() => groupAgendaByLocalDate(filtered), [filtered]);

  const headingId = "booking-agenda-title";
  const countLabel =
    filtered.length === 1
      ? "1 agendamento encontrado"
      : `${filtered.length} agendamentos encontrados`;

  if (failed) {
    return (
      <section className="card" aria-labelledby={headingId}>
        <div className="card-heading">
          <h2 id={headingId}>Agenda de agendamentos</h2>
        </div>
        <p role="alert" className="muted">
          Não foi possível carregar a agenda agora. Nenhum dado foi exibido
          para não confundir falha de consulta com agenda vazia — tente
          novamente em instantes.
        </p>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-heading">
        <div>
          <h2 id={headingId}>Agenda de agendamentos</h2>
          <p className="muted small" role="status" aria-live="polite">
            {countLabel}
          </p>
        </div>
      </div>

      <div className="form-stack">
        <div
          className="item-actions"
          role="group"
          aria-label="Filtrar período da agenda"
        >
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                period === option.id ? "btn btn-small" : "btn btn-small btn-ghost"
              }
              aria-pressed={period === option.id}
              onClick={() => {
                setNow(Date.now());
                setPeriod(option.id);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Buscar por cliente, telefone ou serviço</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Digite para filtrar a agenda"
            autoComplete="off"
          />
        </label>
      </div>

      {grouped.length === 0 ? (
        <p className="muted">
          {emptyMessage({
            total: bookings.length,
            period,
            searching: search.trim().length > 0,
          })}
        </p>
      ) : (
        <div className="form-stack agenda-list">
          {grouped.map((group) => {
            const groupLabel = formatBookingDate(
              group.referenceStartsAt,
              group.timezone,
            );
            const titleId = `agenda-day-${group.date}`;
            return (
              <section key={group.date} aria-labelledby={titleId}>
                <h3 id={titleId}>
                  {groupLabel}
                  <span className="muted small">
                    {" · "}
                    {group.bookings.length === 1
                      ? "1 agendamento"
                      : `${group.bookings.length} agendamentos`}
                  </span>
                </h3>
                <ul className="item-list">
                  {group.bookings.map((booking) => (
                    <li key={booking.id} className="item-row">
                      <div className="form-stack">
                        <strong>
                          {formatBookingTime(booking.starts_at, booking.timezone)}–
                          {formatBookingTime(booking.ends_at, booking.timezone)}
                          {" · "}
                          {booking.customer_name}
                        </strong>
                        <span>{booking.service_name_snapshot}</span>
                        {booking.customer_phone ? (
                          <span className="muted small">
                            {booking.customer_phone}
                          </span>
                        ) : null}
                        <span className="muted small">
                          {formatCents(booking.price_cents_snapshot)}
                        </span>
                        <span>
                          <span
                            className={`status-pill ${
                              BOOKING_STATUS_CLASSES[booking.status] ?? ""
                            }`}
                          >
                            {BOOKING_STATUS_LABELS[booking.status] ??
                              booking.status}
                          </span>
                        </span>
                      </div>
                      <BookingActions booking={booking} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
