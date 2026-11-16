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
import { providerBookingAction } from "./actions";

type Period = "upcoming" | "past" | "all";

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

function localDateKey(booking: Booking): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: booking.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(booking.starts_at));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function BookingAgenda({ bookings }: { bookings: Booking[] }) {
  const [period, setPeriod] = useState<Period>("upcoming");
  const [search, setSearch] = useState("");
  const now = Date.now();

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return bookings
      .filter((booking) => {
        const isUpcoming = new Date(booking.starts_at).getTime() >= now;
        if (period === "upcoming" && !isUpcoming) return false;
        if (period === "past" && isUpcoming) return false;
        if (!normalizedSearch) return true;
        return [
          booking.customer_name,
          booking.customer_phone,
          booking.service_name_snapshot,
        ].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
      })
      .sort((a, b) => {
        const difference =
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
        return period === "past" ? -difference : difference;
      });
  }, [bookings, now, period, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Booking[]>();
    for (const booking of filtered) {
      const key = localDateKey(booking);
      const current = groups.get(key) ?? [];
      current.push(booking);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <section className="card" aria-labelledby="booking-agenda-title">
      <div className="card-heading">
        <div>
          <h2 id="booking-agenda-title">Agenda de agendamentos</h2>
          <p className="muted small">
            {filtered.length} {filtered.length === 1 ? "agendamento encontrado" : "agendamentos encontrados"}
          </p>
        </div>
      </div>

      <div className="form-stack">
        <div className="item-actions" role="group" aria-label="Filtrar período da agenda">
          <button
            type="button"
            className={period === "upcoming" ? "btn btn-small" : "btn btn-small btn-ghost"}
            aria-pressed={period === "upcoming"}
            onClick={() => setPeriod("upcoming")}
          >
            Próximos
          </button>
          <button
            type="button"
            className={period === "past" ? "btn btn-small" : "btn btn-small btn-ghost"}
            aria-pressed={period === "past"}
            onClick={() => setPeriod("past")}
          >
            Anteriores
          </button>
          <button
            type="button"
            className={period === "all" ? "btn btn-small" : "btn btn-small btn-ghost"}
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            Todos
          </button>
        </div>

        <label className="field">
          <span>Buscar cliente, telefone ou serviço</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Digite para filtrar a agenda"
          />
        </label>
      </div>

      {grouped.length === 0 ? (
        <p className="muted">
          {bookings.length === 0
            ? "Nenhum agendamento por enquanto."
            : "Nenhum agendamento corresponde a esse filtro."}
        </p>
      ) : (
        <div className="form-stack">
          {grouped.map(([date, dayBookings]) => (
            <section key={date} aria-label={formatBookingDate(dayBookings[0].starts_at, dayBookings[0].timezone)}>
              <h3>{formatBookingDate(dayBookings[0].starts_at, dayBookings[0].timezone)}</h3>
              <ul className="item-list">
                {dayBookings.map((booking) => (
                  <li key={booking.id} className="item-row">
                    <div className="form-stack">
                      <strong>
                        {formatBookingTime(booking.starts_at, booking.timezone)}–{formatBookingTime(booking.ends_at, booking.timezone)}
                        {" · "}
                        {booking.customer_name}
                      </strong>
                      <span>{booking.service_name_snapshot}</span>
                      {booking.customer_phone ? (
                        <span className="muted small">{booking.customer_phone}</span>
                      ) : null}
                      <span className="muted small">
                        {formatCents(booking.price_cents_snapshot)}
                      </span>
                      <span
                        className={`status-pill ${BOOKING_STATUS_CLASSES[booking.status] ?? ""}`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </div>
                    <BookingActions booking={booking} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
