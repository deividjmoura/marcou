import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBookingDate, formatBookingTime, BOOKING_STATUS_CLASSES, BOOKING_STATUS_LABELS } from "@/lib/format";
import {
  formatCents,
  getBooking,
  getProviderById,
  requireUser,
  type BookingStatus,
} from "@/server/bookings";
import { ReservationActions } from "./reservation-actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { countUnreadNotifications } from "@/server/notifications";
import { CalendarDownloadButton } from "./calendar-download";

const RESERVATION_FEEDBACK: Record<BookingStatus, { title: string; description: string }> = {
  pending_payment: {
    title: "Seu horário está reservado!",
    description: "Agora falta concluir o pagamento do sinal. O prestador confirma o agendamento depois de validar o envio.",
  },
  pending_review: {
    title: "Comprovante enviado!",
    description: "Recebemos seu aviso. O prestador vai conferir o sinal para confirmar o agendamento.",
  },
  confirmed: {
    title: "Agendamento confirmado!",
    description: "Tudo certo. Seu horário está confirmado — esperamos você!",
  },
  cancelled: {
    title: "Agendamento cancelado",
    description: "Esta reserva foi cancelada. Se precisar, você pode escolher outro horário.",
  },
  expired: {
    title: "Esta reserva expirou",
    description: "O prazo para concluir esta reserva terminou e o horário foi liberado.",
  },
};

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

  const { id } = await params;
  const user = await requireUser(`/reserva/${id}`);

  const booking = await getBooking(id);
  if (!booking) notFound();

  const provider = await getProviderById(booking.provider_id);
  const isCustomer = booking.customer_id === user.id;
  const isOwner = provider?.owner_id === user.id;

  if (!isCustomer && !isOwner) notFound();

  const unread = await countUnreadNotifications();

  return (
    <main className="page-shell page-reservation">
      <div className="reservation-topbar">
        <Link
          href={isOwner ? "/painel" : "/meus-agendamentos"}
          className="back-link"
        >
          ← Voltar
        </Link>
        <NotificationBell unreadCount={unread} />
      </div>

      <article className={`reservation-card reservation-success-card is-${booking.status}`}>
        <section
          className={`reservation-success-hero is-${booking.status}`}
          aria-labelledby="reservation-title"
          aria-live="polite"
        >
          <div className="reservation-success-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              {booking.status === "cancelled" || booking.status === "expired" ? (
                <path className="reservation-success-symbol" d="M23 23 41 41M41 23 23 41" />
              ) : (
                <path className="reservation-success-symbol" d="m18 33 9 9 19-21" />
              )}
            </svg>
          </div>
          <span className="eyebrow">AGENDAMENTO</span>
          <h1 id="reservation-title">{RESERVATION_FEEDBACK[booking.status].title}</h1>
          <p>{RESERVATION_FEEDBACK[booking.status].description}</p>
        </section>

        <div className="reservation-success-service">
          <span className={`status-pill ${BOOKING_STATUS_CLASSES[booking.status] ?? ""}`}>
            {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
          </span>
          <h2>{booking.service_name_snapshot}</h2>
          <p className="muted">
            {provider?.display_name ?? "Estabelecimento"} ·{" "}
            {formatBookingDate(booking.starts_at, booking.timezone)}
          </p>
        </div>

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

        {booking.status !== "cancelled" && booking.status !== "expired" ? (
          <CalendarDownloadButton
            bookingId={booking.id}
            startsAt={booking.starts_at}
            endsAt={booking.ends_at}
            createdAt={booking.created_at}
            serviceName={booking.service_name_snapshot}
            providerName={provider?.display_name ?? "Estabelecimento"}
          />
        ) : null}

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

        <ReservationActions bookingId={booking.id} status={booking.status} />
      </article>
    </main>
  );
}
