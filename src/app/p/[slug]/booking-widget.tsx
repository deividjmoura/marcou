"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  bookSlotAction,
  fetchSlotsAction,
  type BookState,
  type SlotsState,
} from "./actions";
import { formatCents, formatInstantInZone } from "@/lib/format";
import { addDaysIsoDate, todayIsoDate } from "@/lib/time";

export interface WidgetService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  bufferMinutes: number;
}

interface BookingWidgetProps {
  slug: string;
  timeZone: string;
  services: WidgetService[];
  initialServiceId?: string;
  initialDate?: string;
  initialSlot?: string;
}

const initialSlots: SlotsState = { slots: null };
const initialBook: BookState = {};

export function BookingWidget({
  slug,
  timeZone,
  services,
  initialServiceId,
  initialDate,
  initialSlot,
}: BookingWidgetProps) {
  const today = todayIsoDate(timeZone);
  const maxDate = useMemo(() => addDaysIsoDate(today, 30), [today]);

  const [serviceId, setServiceId] = useState(
    initialServiceId ?? services[0]?.id ?? "",
  );
  const [date, setDate] = useState(initialDate ?? today);
  const [slots, setSlots] = useState<SlotsState>(initialSlots);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(
    initialSlot ?? null,
  );
  const [picked, setPicked] = useState(false);

  const [bookState, bookAction, bookingPending] = useActionState(
    bookSlotAction,
    initialBook,
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!serviceId || !date) {
        setSlots({ slots: null });
        return;
      }
      setLoading(true);
      const result = await fetchSlotsAction({ slug, serviceId, date });
      if (active) {
        setSlots(result);
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [slug, serviceId, date]);

  const service = services.find((item) => item.id === serviceId);

  return (
    <section className="booking-widget" aria-labelledby="booking-title">
      <div className="section-heading">
        <span className="eyebrow">AGENDAR</span>
        <h2 id="booking-title">Escolha o horário</h2>
      </div>

      {services.length === 0 ? (
        <p className="muted">Este estabelecimento ainda não tem serviços ativos.</p>
      ) : (
        <>
          <label className="field">
            <span>Serviço</span>
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setSelectedSlot(null);
                setPicked(false);
              }}
            >
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.durationMinutes} min ·{" "}
                  {formatCents(item.priceCents)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Data</span>
            <input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(event) => {
                setDate(event.target.value);
                setSelectedSlot(null);
                setPicked(false);
              }}
            />
          </label>

          {loading ? (
            <p className="muted">Carregando horários...</p>
          ) : slots.slots && slots.slots.length > 0 ? (
            <div className="slot-grid">
              {slots.slots.map((slot) => {
                const label = formatInstantInZone(slot.startsAt, timeZone, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const isActive = selectedSlot === slot.startsAt;
                return (
                  <button
                    type="button"
                    key={slot.startsAt}
                    className={isActive ? "slot slot-active" : "slot"}
                    aria-pressed={isActive}
                    onClick={() => {
                      setSelectedSlot(slot.startsAt);
                      setPicked(true);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted">
              Não há horários disponíveis nesta data. Escolha outra data.
            </p>
          )}

          {bookState.error ? (
            <p className="alert alert-error">{bookState.error}</p>
          ) : null}

          {picked && selectedSlot ? (
            <form action={bookAction} className="form-stack booking-confirm">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="startsAt" value={selectedSlot} />

              <p className="booking-summary">
                <strong>{service?.name}</strong> ·{" "}
                {formatInstantInZone(selectedSlot, timeZone, {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}{" "}
                às {formatInstantInZone(selectedSlot, timeZone, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              <label className="field">
                <span>Seu nome</span>
                <input
                  type="text"
                  name="customerName"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span>WhatsApp</span>
                <input
                  type="tel"
                  name="customerPhone"
                  maxLength={32}
                  autoComplete="tel"
                />
              </label>

              <button type="submit" className="btn" disabled={bookingPending}>
                {bookingPending ? "Reservando..." : "Confirmar reserva"}
              </button>
              <p className="muted small">
                A reserva fica pendente de pagamento do sinal. O prestador
                confirma após a validação.
              </p>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
