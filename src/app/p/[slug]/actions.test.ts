import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { getAvailableSlots, createBooking, getCurrentUser, BookingOperationError } from "@/server/bookings";
import { bookSlotAction } from "./actions";
import { isSupabaseConfigured } from "@/lib/env";
import { fetchSlotsAction } from "./actions";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/server/bookings", () => ({
  getAvailableSlots: vi.fn(),
  createBooking: vi.fn(),
  getCurrentUser: vi.fn(),
  BookingOperationError: class BookingOperationError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "BookingOperationError";
    }
  },
}));

const mockedGetAvailableSlots = vi.mocked(getAvailableSlots);
const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockedCreateBooking = vi.mocked(createBooking);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedRedirect = vi.mocked(redirect);

const input = {
  slug: "studio-ana",
  serviceIds: ["123e4567-e89b-12d3-a456-426614174000"],
  date: "2026-12-01",
};

describe("fetchSlotsAction", () => {
  beforeEach(() => {
    mockedGetAvailableSlots.mockReset();
    mockedIsSupabaseConfigured.mockReturnValue(true);
  });

  it("devolve a lista de horários quando a consulta funciona", async () => {
    mockedGetAvailableSlots.mockResolvedValue({
      slots: [
        {
          startsAt: "2026-12-01T12:00:00.000Z",
          occupiedUntil: "2026-12-01T13:00:00.000Z",
          label: "2026-12-01T12:00:00.000Z",
        },
      ],
      services: [],
      totals: {
        durationMinutes: 60,
        bufferMinutes: 0,
        occupiedMinutes: 60,
        priceCents: 0,
        depositCents: 0,
      },
      timing: { durationMinutes: 60, bufferMinutes: 0 },
    });

    const result = await fetchSlotsAction(input);

    expect(result.error).toBeUndefined();
    expect(result.slots).toHaveLength(1);
  });

  it("trata agenda vazia como ausência de horários, não como erro", async () => {
    mockedGetAvailableSlots.mockResolvedValue({
      slots: [],
      services: [],
      totals: {
        durationMinutes: 0,
        bufferMinutes: 0,
        occupiedMinutes: 0,
        priceCents: 0,
        depositCents: 0,
      },
      timing: { durationMinutes: 60, bufferMinutes: 0 },
    });

    const result = await fetchSlotsAction(input);

    expect(result).toEqual({
      slots: [],
      services: [],
      totals: {
        durationMinutes: 0,
        bufferMinutes: 0,
        occupiedMinutes: 0,
        priceCents: 0,
        depositCents: 0,
      },
    });
  });

  it("distingue retorno nulo de ausência de horários", async () => {
    mockedGetAvailableSlots.mockResolvedValue(null);

    const result = await fetchSlotsAction(input);

    expect(result.slots).toBeNull();
    expect(result.services).toEqual([]);
    expect(result.totals).toBeNull();
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

  it("rejeita data impossível sem consultar o banco", async () => {
    const result = await fetchSlotsAction({ ...input, date: "2026-02-30" });

    expect(result).toEqual({ slots: null, services: [], totals: null });
    expect(mockedGetAvailableSlots).not.toHaveBeenCalled();
  });
});

describe("bookSlotAction", () => {
  beforeEach(() => {
    mockedCreateBooking.mockReset();
    mockedGetCurrentUser.mockReset();
    mockedRedirect.mockReset();
    mockedIsSupabaseConfigured.mockReturnValue(true);
    mockedGetCurrentUser.mockResolvedValue({ id: "user-1" } as never);
  });

  it("redireciona para a reserva após sucesso (redirect fora do try/catch)", async () => {
    mockedCreateBooking.mockResolvedValue({ id: "booking-42" } as never);
    const formData = new FormData();
    formData.set("slug", "studio-ana");
    formData.set("serviceId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("startsAt", "2026-12-01T12:00:00.000Z");
    formData.set("date", "2026-12-01");
    formData.set("customerName", "Cliente");
    formData.set("customerPhone", "");

    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(bookSlotAction({}, formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(mockedRedirect).toHaveBeenCalledWith("/reserva/booking-42");
    expect(mockedCreateBooking).toHaveBeenCalled();
  });

  it("devolve erro de domínio sem chamar redirect", async () => {
    // Usa a classe exportada pelo mock para o instanceof funcionar
    const DomainError = BookingOperationError as unknown as new (
      code: string,
      message: string,
    ) => Error;
    mockedCreateBooking.mockRejectedValue(
      new DomainError("slot_unavailable", "Este horário acabou de ser reservado. Escolha outro."),
    );
    const formData = new FormData();
    formData.set("slug", "studio-ana");
    formData.set("serviceId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("startsAt", "2026-12-01T12:00:00.000Z");
    formData.set("date", "2026-12-01");
    formData.set("customerName", "Cliente");
    formData.set("customerPhone", "");

    const result = await bookSlotAction({}, formData);
    expect(result.error).toMatch(/reservado|Invalid|serviço/i);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
