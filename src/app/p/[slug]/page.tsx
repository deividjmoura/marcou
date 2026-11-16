import { notFound } from "next/navigation";
import { getProvider, listActiveServices } from "@/server/bookings";
import { BookingWidget } from "./booking-widget";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export const dynamic = "force-dynamic";

export default async function ProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    service?: string;
    date?: string;
    slot?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-provider">
        <header className="provider-header">
          <span className="eyebrow">AGENDAMENTO ONLINE</span>
          <h1>Agendamento indisponível</h1>
        </header>
        <SupabaseConfigWarning />
      </main>
    );
  }

  const provider = await getProvider(slug);
  if (!provider) notFound();

  const services = await listActiveServices(provider.id);

  return (
    <main className="page-shell page-provider">
      <header className="provider-header">
        <div>
          <span className="eyebrow">AGENDAMENTO ONLINE</span>
          <h1>{provider.display_name}</h1>
          <p className="muted">
            {provider.description ||
              "Escolha o serviço e o horário. A confirmação chega depois da validação do sinal."}
          </p>
        </div>
      </header>

      <div className="provider-layout">
        <BookingWidget
          slug={provider.slug}
          timeZone={provider.timezone}
          services={services.map((service) => ({
            id: service.id,
            name: service.name,
            description: service.description,
            durationMinutes: service.duration_minutes,
            priceCents: service.price_cents,
            bufferMinutes: service.buffer_minutes,
          }))}
          initialServiceId={query.service}
          initialDate={query.date}
          initialSlot={query.slot}
        />
      </div>
    </main>
  );
}
