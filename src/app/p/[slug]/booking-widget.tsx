"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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

function startOfWeek(date: string): string {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDaysIsoDate(date, -((weekday + 6) % 7));
}

function dateAtUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-BR", {
    ...options,
    timeZone: "UTC",
  }).format(dateAtUtcNoon(date));
}

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
  const firstWeek = useMemo(() => startOfWeek(today), [today]);

  const [serviceId, setServiceId] = useState(
    initialServiceId ?? services[0]?.id ?? "",
  );
  const [date, setDate] = useState(initialDate ?? today);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(initialDate ?? today),
  );
  const [weekDirection, setWeekDirection] = useState<"next" | "previous">("next");
  const [slots, setSlots] = useState<SlotsState>(initialSlots);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(
    initialSlot ?? null,
  );
  const [picked, setPicked] = useState(false);
  const [showStickyContinue, setShowStickyContinue] = useState(false);
  const bookingFormRef = useRef<HTMLFormElement>(null);
  const slotsSectionRef = useRef<HTMLElement>(null);
  const shouldScrollToSlotsRef = useRef(false);

  const [bookState, bookAction, bookingPending] = useActionState(
    bookSlotAction,
    initialBook,
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysIsoDate(weekStart, index)),
    [weekStart],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!serviceId || !date) {
        setSlots({ slots: null });
        return;
      }
      setLoading(true);
      setSlots({ slots: null });
      try {
        const result = await fetchSlotsAction({ slug, serviceId, date });
        if (active) setSlots(result);
      } catch {
        if (active) {
          setSlots({
            slots: null,
            error: "Não foi possível carregar os horários. Tente novamente.",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [slug, serviceId, date, retryCount]);

  useEffect(() => {
    if (!shouldScrollToSlotsRef.current) return;
    shouldScrollToSlotsRef.current = false;

    const section = slotsSectionRef.current;
    if (!section) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [date]);

  const service = services.find((item) => item.id === serviceId);
  const monthLabel = formatDate(date, { month: "long", year: "numeric" });
  const canGoBack = weekStart > firstWeek;
  const canGoForward = addDaysIsoDate(weekStart, 7) <= maxDate;

  function chooseDate(nextDate: string) {
    if (nextDate < today || nextDate > maxDate || nextDate === date) return;
    shouldScrollToSlotsRef.current = true;
    setDate(nextDate);
    setSelectedSlot(null);
    setPicked(false);
    setShowStickyContinue(false);
  }

  function continueToDetails() {
    setShowStickyContinue(false);
    bookingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    bookingFormRef.current?.querySelector<HTMLInputElement>('input[name="customerName"]')?.focus({ preventScroll: true });
  }

  return (
    <section className={`booking-widget${showStickyContinue ? " has-sticky-continue" : ""}`} aria-labelledby="booking-title">
      <div className="section-heading">
        <span className="eyebrow">AGENDAR</span>
        <h2 id="booking-title">Escolha o serviço, dia e horário</h2>
      </div>

      {services.length === 0 ? (
        <p className="muted">Este estabelecimento ainda não tem serviços ativos.</p>
      ) : (
        <>
          <section className="booking-services" aria-labelledby="booking-services-title">
            <div className="booking-services-heading">
              <h3 id="booking-services-title">Escolha seu serviço</h3>
              <span>Deslize para ver as opções</span>
            </div>
            <div className="booking-service-carousel" role="group" aria-label="Serviços disponíveis">
              {services.map((item) => {
                const selected = item.id === serviceId;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={selected ? "booking-service-card is-selected" : "booking-service-card"}
                    aria-pressed={selected}
                    onClick={() => {
                      setServiceId(item.id);
                      setSelectedSlot(null);
                      setPicked(false);
                      setShowStickyContinue(false);
                    }}
                  >
                    <span className="booking-service-image" aria-hidden="true">
                      <span>✦</span>
                    </span>
                    <span className="booking-service-content">
                      <strong>{item.name}</strong>
                      {item.description ? <span className="booking-service-description">{item.description}</span> : null}
                      <span className="booking-service-meta">
                        {item.durationMinutes} min <span aria-hidden="true">·</span> {formatCents(item.priceCents)}
                      </span>
                    </span>
                    <span className="booking-service-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="booking-date-section" aria-label="Escolha uma data">
            <div className="booking-calendar-heading">
              <div>
                <p className="booking-calendar-eyebrow">DATA DO AGENDAMENTO</p>
                <h3>{monthLabel}</h3>
              </div>
              <div className="booking-week-navigation" aria-label="Navegar pelas semanas">
                <button
                  type="button"
                  className="booking-week-nav"
                  aria-label="Semana anterior"
                  disabled={!canGoBack}
                  onClick={() => {
                    setWeekDirection("previous");
                    setWeekStart((current) => addDaysIsoDate(current, -7));
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="booking-week-nav"
                  aria-label="Próxima semana"
                  disabled={!canGoForward}
                  onClick={() => {
                    setWeekDirection("next");
                    setWeekStart((current) => addDaysIsoDate(current, 7));
                  }}
                >
                  ›
                </button>
              </div>
            </div>

            <div key={weekStart} className={`booking-week is-${weekDirection}`} role="group" aria-label="Dias disponíveis">
              {weekDays.map((day) => {
                const disabled = day < today || day > maxDate;
                const selected = day === date;
                const isToday = day === today;
                return (
                  <button
                    type="button"
                    key={day}
                    className={[
                      "booking-day",
                      selected ? "is-selected" : "",
                      isToday ? "is-today" : "",
                    ].filter(Boolean).join(" ")}
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-label={`${formatDate(day, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}${isToday ? ", hoje" : ""}${selected ? ", selecionado" : ""}`}
                    onClick={() => chooseDate(day)}
                  >
                    <span className="booking-day-name">
                      {formatDate(day, { weekday: "short" }).replace(".", "")}
                    </span>
                    <span className="booking-day-number">
                      {formatDate(day, { day: "2-digit" })}
                    </span>
                    {isToday ? <span className="booking-day-today" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section ref={slotsSectionRef} key={date} className="booking-times-section" aria-labelledby="booking-times-title" tabIndex={-1}>
            <div className="booking-times-heading">
              <h3 id="booking-times-title">Horários disponíveis</h3>
              <span aria-live="polite">{formatDate(date, { weekday: "short", day: "numeric", month: "short" })}</span>
            </div>

            {loading ? (
              <p className="muted" role="status" aria-live="polite">
                Consultando disponibilidade em tempo real...
              </p>
            ) : slots.error ? (
              <div className="alert alert-error" role="alert">
                <p>{slots.error}</p>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setRetryCount((count) => count + 1)}
                >
                  Tentar novamente
                </button>
              </div>
            ) : slots.slots && slots.slots.length > 0 ? (
              <div className="booking-slot-list">
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
                      className={isActive ? "booking-time-card is-selected" : "booking-time-card"}
                      aria-pressed={isActive}
                      aria-label={`${label}, ${service?.name ?? "serviço"}, ${service?.durationMinutes ?? 0} minutos, disponível${isActive ? ", selecionado" : ""}`}
                      onClick={() => {
                        setSelectedSlot(slot.startsAt);
                        setPicked(true);
                        setShowStickyContinue(true);
                      }}
                    >
                      <span className="booking-time-value">{label}</span>
                      <span className="booking-time-divider" aria-hidden="true" />
                      <span className="booking-time-details">
                        <strong>{service?.name}</strong>
                        <small>{service?.durationMinutes} min · Disponível</small>
                      </span>
                      <span className="booking-time-check" aria-hidden="true">
                        {isActive ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="booking-empty-slots">
                Não há horários disponíveis nesta data. Escolha outro dia.
              </p>
            )}
          </section>

          {picked && selectedSlot && showStickyContinue ? (
            <div className="booking-sticky-continue">
              <div className="booking-sticky-summary" aria-live="polite">
                <span>HORÁRIO ESCOLHIDO</span>
                <strong>{formatDate(date, { weekday: "short", day: "2-digit", month: "short" })} · {formatInstantInZone(selectedSlot, timeZone, { hour: "2-digit", minute: "2-digit" })}</strong>
              </div>
              <button type="button" className="btn booking-sticky-button" onClick={continueToDetails}>
                Preencher dados <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}

          {bookState.error ? (
            <p className="alert alert-error" role="alert">{bookState.error}</p>
          ) : null}

          {picked && selectedSlot ? (
            <form ref={bookingFormRef} action={bookAction} className="form-stack booking-confirm">
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
