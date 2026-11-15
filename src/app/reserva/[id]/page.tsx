import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBookingDate, formatBookingTime, BOOKING_STATUS_CLASSES, BOOKING_STATUS_LABELS } from "@/lib/format";
import {
  formatCents,
  getBooking,
  getProviderById,
  requireUser,
} from "@/server/bookings";
import { ReservationActions } from "./reservation-actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export const dynamic = "force-dynamic";

export default async function ReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-reservation">
        <SupabaseConfigWarning />
      </main>
    );
  }

  const user = await requireUser();
  const { id } = await params;

  const booking = await getBooking(id);
  if (!booking) notFound();

  const provider = await getProviderById(booking.provider_id);
  const isCustomer = booking.customer_id === user.id;
  const isOwner = provider?.owner_id === user.id;

  if (!isCustomer && !isOwner) notFound();

  return (
    <main className="page-shell page-reservation">
      <Link href={isOwner ? "/painel" : "/meus-agendamentos"} className="back-link">
        ← Voltar
      </Link>

      <article className="reservation-card">
        <span
          className={`status-pill ${BOOKING_STATUS_CLASSES[booking.status] ?? ""}`}
        >
          {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
        </span>

        <h1>{booking.service_name_snapshot}</h1>
        <p className="muted">
          {provider?.display_name ?? "Estabelecimento"} ·{" "}
          {formatBookingDate(booking.starts_at, booking.timezone)}
        </p>

        <dl className="reservation-details">
          <div>
            <dt>Início</dt>
            <dd>{formatBookingTime(booking.starts_at, booking.timezone)}</dd>
          </div>
          <div>
            <dt>Término previsto</dt>
            <dd>{formatBookingTime(booking.ends_at, booking.timezone)}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{booking.duration_minutes_snapshot} min</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatCents(booking.price_cents_snapshot)}</dd>
          </div>
          <div>
            <dt>Sinal</dt>
            <dd>{formatCents(booking.deposit_cents_snapshot)}</dd>
          </div>
        </dl>

        {booking.status === "pending_payment" && booking.expires_at ? (
          <p className="alert alert-warning">
            Esta reserva expira em{" "}
            {new Date(booking.expires_at).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: booking.timezone,
            })}
            . Após esse horário o horário é liberado automaticamente.
          </p>
        ) : null}

        {booking.status === "pending_review" ? (
          <p className="alert alert-info">
            Comprovante registrado. O prestador precisa validar o sinal para
            confirmar o agendamento.
          </p>
        ) : null}

        {booking.status === "confirmed" ? (
          <p className="alert alert-success">
            Agendamento confirmado. Apresente-se no horário marcado.
          </p>
        ) : null}

        {booking.status === "expired" ? (
          <p className="alert alert-warning">
            Esta reserva expirou e o horário foi liberado.
          </p>
        ) : null}

        <ReservationActions bookingId={booking.id} status={booking.status} />
      </article>
    </main>
  );
}
