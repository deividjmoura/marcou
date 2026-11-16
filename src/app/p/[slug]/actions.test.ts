import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots } from "@/server/bookings";
import { isSupabaseConfigured } from "@/lib/env";
import { fetchSlotsAction } from "./actions";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));

vi.mock("@/server/bookings", () => ({
  getAvailableSlots: vi.fn(),
  createBooking: vi.fn(),
  getCurrentUser: vi.fn(),
  BookingOperationError: class BookingOperationError extends Error {},
}));

const mockedGetAvailableSlots = vi.mocked(getAvailableSlots);
const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);

const input = {
  slug: "studio-ana",
  serviceId: "123e4567-e89b-12d3-a456-426614174000",
  date: "2026-12-01",
};

describe("fetchSlotsAction", () => {
  beforeEach(() => {
    mockedGetAvailableSlots.mockReset();
    mockedIsSupabaseConfigured.mockReturnValue(true);
  });

  it("devolve a lista de horários quando a consulta funciona", async () => {
    mockedGetAvailableSlots.mockResolvedValue([
      {
        startsAt: "2026-12-01T12:00:00.000Z",
        occupiedUntil: "2026-12-01T13:00:00.000Z",
        label: "2026-12-01T12:00:00.000Z",
      },
    ]);

    const result = await fetchSlotsAction(input);

    expect(result.error).toBeUndefined();
    expect(result.slots).toHaveLength(1);
  });

  it("trata agenda vazia como ausência de horários, não como erro", async () => {
    mockedGetAvailableSlots.mockResolvedValue([]);

    const result = await fetchSlotsAction(input);

    expect(result).toEqual({ slots: [] });
  });

  it("distingue retorno nulo de ausência de horários", async () => {
    mockedGetAvailableSlots.mockResolvedValue(null);

    const result = await fetchSlotsAction(input);

    expect(result.slots).toBeNull();
    expect(result.error).toBe(
      "Não foi possível consultar a disponibilidade deste serviço.",
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

  it("rejeita data impossível sem consultar o banco", async () => {
    const result = await fetchSlotsAction({ ...input, date: "2026-02-30" });

    expect(result).toEqual({ slots: null });
    expect(mockedGetAvailableSlots).not.toHaveBeenCalled();
  });
});
