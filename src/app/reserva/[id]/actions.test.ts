import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import {
  BookingOperationError,
  getCurrentUser,
  transitionBooking,
} from "@/server/bookings";
import { reservationTransitionAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/server/bookings", () => ({
  BookingOperationError: class BookingOperationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  getCurrentUser: vi.fn(),
  transitionBooking: vi.fn(),
}));

const mockedTransition = vi.mocked(transitionBooking);
const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedIsConfigured = vi.mocked(isSupabaseConfigured);
const bookingId = "123e4567-e89b-12d3-a456-426614174000";

function form(event: string | null, id: string = bookingId) {
  const data = new FormData();
  data.set("bookingId", id);
  if (event !== null) data.set("event", event);
  return data;
}

describe("reservationTransitionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsConfigured.mockReturnValue(true);
    mockedGetCurrentUser.mockResolvedValue({ id: "user-1" } as never);
    mockedTransition.mockResolvedValue(undefined as never);
  });

  it.each(["proof_received", "payment_approved", "cancel"])(
    "delega %s ao banco e devolve o evento concluído",
    async (event) => {
      const result = await reservationTransitionAction({}, form(event));

      expect(mockedTransition).toHaveBeenCalledWith({ bookingId, event });
      expect(revalidatePath).toHaveBeenCalledWith(`/reserva/${bookingId}`);
      expect(result).toEqual({ completedEvent: event });
    },
  );

  it.each([["expire"], ["confirmed"], [""], [null]])(
    "rejeita evento fora da lista (%j) sem chamar o banco",
    async (event) => {
      const result = await reservationTransitionAction({}, form(event));

      expect(result.error).toBe("Ação inválida para esta reserva.");
      expect(mockedTransition).not.toHaveBeenCalled();
    },
  );

  it("rejeita reserva não informada", async () => {
    const result = await reservationTransitionAction({}, form("cancel", ""));

    expect(result.error).toBe("Ação inválida para esta reserva.");
    expect(mockedTransition).not.toHaveBeenCalled();
  });

  it("repassa a recusa do banco (ex.: cliente tentando aprovar pagamento)", async () => {
    mockedTransition.mockRejectedValue(
      new BookingOperationError("forbidden", "Você não tem permissão para esta ação."),
    );

    const result = await reservationTransitionAction({}, form("payment_approved"));

    expect(result).toEqual({ error: "Você não tem permissão para esta ação." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("usa mensagem genérica por evento em falhas inesperadas", async () => {
    mockedTransition.mockRejectedValue(new Error("network"));

    const result = await reservationTransitionAction({}, form("payment_approved"));

    expect(result).toEqual({ error: "Não foi possível confirmar o pagamento." });
  });

  it("redireciona para o login sem usuário autenticado", async () => {
    mockedGetCurrentUser.mockResolvedValue(null as never);

    await expect(reservationTransitionAction({}, form("cancel"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(mockedTransition).not.toHaveBeenCalled();
  });

  it("não chama o banco sem Supabase configurado", async () => {
    mockedIsConfigured.mockReturnValue(false);

    const result = await reservationTransitionAction({}, form("cancel"));

    expect(result.error).toMatch(/Supabase não está configurado/);
    expect(mockedTransition).not.toHaveBeenCalled();
  });
});
