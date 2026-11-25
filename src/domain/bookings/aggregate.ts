/** Serviço elegível para composição, com os valores vindos do banco. */
export interface BookableService {
  name: string;
  durationMinutes: number;
  priceCents: number;
  depositCents: number;
  bufferMinutes: number;
}

/** Totais de uma reserva composta. Espelha `public.booking_service_totals`. */
export interface AggregatedBookingTotals {
  nameSnapshot: string;
  durationMinutes: number;
  bufferMinutes: number;
  occupiedMinutes: number;
  priceCents: number;
  depositCents: number;
}

/**
 * Soma pura dos valores persistidos dos serviços. No fluxo real a fonte de
 * verdade é a RPC do banco; esta função documenta e testa a regra de negócio
 * usada na validação dos totais devolvidos pela API.
 */
export function aggregateBookingServices(
  services: readonly BookableService[],
): AggregatedBookingTotals {
  if (services.length === 0) {
    throw new RangeError("Selecione ao menos um serviço.");
  }
  if (services.length > 20) {
    throw new RangeError("Uma reserva pode ter no máximo 20 serviços.");
  }

  return services.reduce<AggregatedBookingTotals>(
    (totals, service, index) => {
      if (
        !Number.isInteger(service.durationMinutes) ||
        service.durationMinutes <= 0 ||
        !Number.isInteger(service.bufferMinutes) ||
        service.bufferMinutes < 0 ||
        !Number.isInteger(service.priceCents) ||
        service.priceCents < 0 ||
        !Number.isInteger(service.depositCents) ||
        service.depositCents < 0
      ) {
        throw new RangeError("Valores de serviço inválidos para agregação.");
      }

      return {
        nameSnapshot:
          index === 0
            ? service.name
            : `${totals.nameSnapshot} + ${service.name}`,
        durationMinutes: totals.durationMinutes + service.durationMinutes,
        bufferMinutes: totals.bufferMinutes + service.bufferMinutes,
        occupiedMinutes:
          totals.occupiedMinutes +
          service.durationMinutes +
          service.bufferMinutes,
        priceCents: totals.priceCents + service.priceCents,
        depositCents: totals.depositCents + service.depositCents,
      };
    },
    {
      nameSnapshot: "",
      durationMinutes: 0,
      bufferMinutes: 0,
      occupiedMinutes: 0,
      priceCents: 0,
      depositCents: 0,
    },
  );
}
