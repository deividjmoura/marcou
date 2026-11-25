import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createBooking, getAvailableSlots, getCurrentUser } from "@/server/bookings";
import { isSupabaseConfigured } from "@/lib/env";
import { bookSlotAction, fetchSlotsAction } from "./actions";

// Como no Next.js, redirect() interrompe a execução lançando uma exceção.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  }),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));

vi.mock("@/server/bookings", () => ({
  getAvailableSlots: vi.fn(),
  createBooking: vi.fn(),
  getCurrentUser: vi.fn(),
  BookingOperationError: class BookingOperationError extends Error {},
}));

const mockedGetAvailableSlots = vi.mocked(getAvailableSlots);
const mockedCreateBooking = vi.mocked(createBooking);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedRedirect = vi.mocked(redirect);
const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);

const serviceA = "123e4567-e89b-12d3-a456-426614174000";
const serviceB = "223e4567-e89b-12d3-a456-426614174001";
const input = {
  slug: "studio-ana",
  serviceIds: [serviceA, serviceB],
  date: "2026-12-01",
};

const available = {
  slots: [
    {
      startsAt: "2026-12-01T12:00:00.000Z",
      occupiedUntil: "2026-12-01T13:45:00.000Z",
      label: "2026-12-01T12:00:00.000Z",
    },
  ],
  services: [
    {
      id: serviceA,
      name: "Corte",
      durationMinutes: 60,
      priceCents: 8000,
      depositCents: 2000,
      bufferMinutes: 15,
    },
    {
      id: serviceB,
      name: "Barba",
      durationMinutes: 30,
      priceCents: 4000,
      depositCents: 0,
      bufferMinutes: 0,
    },
  ],
  totals: {
    durationMinutes: 90,
    bufferMinutes: 15,
    occupiedMinutes: 105,
    priceCents: 12000,
    depositCents: 2000,
  },
  timing: { durationMinutes: 90, bufferMinutes: 15 },
};

describe("fetchSlotsAction", () => {
  beforeEach(() => {
    mockedGetAvailableSlots.mockReset();
    mockedIsSupabaseConfigured.mockReturnValue(true);
  });

  it("devolve slots e totais calculados pelo servidor para vários serviços", async () => {
    mockedGetAvailableSlots.mockResolvedValue(available);

    const result = await fetchSlotsAction(input);

    expect(result.error).toBeUndefined();
    expect(result.slots).toHaveLength(1);
    expect(result.totals).toEqual(available.totals);
    expect(result.services.map((service) => service.name)).toEqual([
      "Corte",
      "Barba",
    ]);
    expect(mockedGetAvailableSlots).toHaveBeenCalledWith({
      slug: input.slug,
      serviceIds: [serviceA, serviceB],
      date: input.date,
    });
  });

  it("aceita o parâmetro antigo de serviço único", async () => {
    mockedGetAvailableSlots.mockResolvedValue(available);

    await fetchSlotsAction({ slug: input.slug, serviceId: serviceA, date: input.date });

    expect(mockedGetAvailableSlots).toHaveBeenCalledWith({
      slug: input.slug,
      serviceIds: [serviceA],
      date: input.date,
    });
  });

  it("trata agenda vazia como ausência de horários, não como erro", async () => {
    mockedGetAvailableSlots.mockResolvedValue({ ...available, slots: [] });

    const result = await fetchSlotsAction(input);

    expect(result.error).toBeUndefined();
    expect(result.slots).toEqual([]);
    expect(result.totals).toEqual(available.totals);
  });

  it("distingue retorno nulo de ausência de horários", async () => {
    mockedGetAvailableSlots.mockResolvedValue(null);

    const result = await fetchSlotsAction(input);

    expect(result.slots).toBeNull();
    expect(result.error).toBe(
      "Não foi possível consultar a disponibilidade destes serviços.",
    );
  });

  it("trata falha inesperada da consulta", async () => {
    mockedGetAvailableSlots.mockRejectedValue(new Error("rede indisponível"));

    const result = await fetchSlotsAction(input);

    expect(result.slots).toBeNull();
    expect(result.error).toBe(
      "Falha ao consultar os horários. Verifique sua conexão e tente novamente.",
    );
  });

  it("avisa quando o Supabase não está configurado em vez de quebrar", async () => {
    mockedIsSupabaseConfigured.mockReturnValue(false);

    const result = await fetchSlotsAction(input);

    expect(result.slots).toBeNull();
    expect(result.error).toContain("Supabase não está configurado");
    expect(mockedGetAvailableSlots).not.toHaveBeenCalled();
  });

  it("rejeita seleção vazia, IDs duplicados e data impossível sem consultar o banco", async () => {
    expect(await fetchSlotsAction({ ...input, serviceIds: [] })).toEqual({
      slots: null,
      services: [],
      totals: null,
    });
    expect(
      await fetchSlotsAction({ ...input, serviceIds: [serviceA, serviceA] }),
    ).toEqual({ slots: null, services: [], totals: null });
    expect(await fetchSlotsAction({ ...input, date: "2026-02-30" })).toEqual({
      slots: null,
      services: [],
      totals: null,
    });
    expect(mockedGetAvailableSlots).not.toHaveBeenCalled();
  });
});

describe("bookSlotAction", () => {
  const form = () => {
    const data = new FormData();
    data.set("slug", "studio-ana");
    data.set("date", "2026-12-01");
    data.set("startsAt", "2026-12-01T12:00:00.000Z");
    data.append("serviceIds", serviceA);
    data.set("customerName", "Cliente Teste");
    data.set("customerPhone", "11999999999");
    return data;
  };

  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedRedirect.mockClear();
    mockedIsSupabaseConfigured.mockReturnValue(true);
    mockedGetCurrentUser.mockResolvedValue({ id: "user-1" } as never);
  });

  it("reserva criada redireciona para a reserva em vez de mostrar erro (#22)", async () => {
    mockedCreateBooking.mockResolvedValue({ id: "booking-1" } as never);

    await expect(bookSlotAction({}, form())).rejects.toThrow("NEXT_REDIRECT");

    expect(mockedRedirect).toHaveBeenCalledWith("/reserva/booking-1");
  });

  it("falha ao criar a reserva devolve mensagem e não redireciona", async () => {
    mockedCreateBooking.mockRejectedValue(new Error("db down"));

    const result = await bookSlotAction({}, form());

    expect(result.error).toBe("Não foi possível concluir a reserva. Tente novamente.");
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
