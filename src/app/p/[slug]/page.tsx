import { notFound } from "next/navigation";
import { getProvider, listActiveServices } from "@/server/bookings";
import { BookingWidget } from "./booking-widget";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { getPublicProviderDiscovery } from "@/server/discovery";
import { ProviderAvatar } from "@/components/provider-avatar";
import { DELIVERY_MODE_LABELS } from "@/domain/discovery/discovery";

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

  const [services, discovery] = await Promise.all([
    listActiveServices(provider.id),
    getPublicProviderDiscovery(provider.slug),
  ]);
  const discoveryByService = new Map(
    (discovery?.services ?? []).map((service) => [service.serviceId, service]),
  );

  return (
    <main className="page-shell page-provider">
      <header className="provider-header">
        <ProviderAvatar
          src={provider.avatar_url}
          name={provider.display_name}
          className="provider-avatar-public"
        />
        <div className="provider-header-copy">
          <span className="eyebrow">AGENDAMENTO ONLINE</span>
          <h1>{provider.display_name}</h1>
          <p className="muted">
            {provider.description ||
              "Escolha o serviço e o horário. A confirmação chega depois da validação do sinal."}
          </p>
          {discovery && discovery.serviceAreas.length > 0 ? (
            <section
              className="provider-service-areas"
              aria-labelledby="provider-service-areas-title"
            >
              <strong id="provider-service-areas-title">Áreas de atendimento</strong>
              <ul>
                {discovery.serviceAreas.map((area) => {
                  const place = area.neighborhood
                    ? `${area.neighborhood}, ${area.city}`
                    : area.city;
                  const radius =
                    area.precision === "radius" && area.radiusKm != null
                      ? ` · até ${area.radiusKm.toLocaleString("pt-BR")} km aproximadamente`
                      : "";
                  return (
                    <li
                      key={`${area.stateCode}:${area.city}:${area.neighborhood ?? ""}:${area.radiusKm ?? ""}`}
                    >
                      {place} — {area.stateCode}{radius}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </header>

      <div className="provider-layout">
        <BookingWidget
          slug={provider.slug}
          timeZone={provider.timezone}
          services={services.map((service) => {
            const serviceDiscovery = discoveryByService.get(service.id);
            return {
              id: service.id,
              name: service.name,
              description: service.description,
              imageUrl: service.image_url,
              durationMinutes: service.duration_minutes,
              priceCents: service.price_cents,
              bufferMinutes: service.buffer_minutes,
              categoryName: serviceDiscovery?.category.name,
              deliveryLabels: serviceDiscovery?.deliveryModes.map(
                (mode) => DELIVERY_MODE_LABELS[mode],
              ),
            };
          })}
          initialServiceId={query.service}
          initialDate={query.date}
          initialSlot={query.slot}
        />
      </div>
    </main>
  );
}
