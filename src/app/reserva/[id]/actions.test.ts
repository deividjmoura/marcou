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
const bookingId = "123e4567-e89b-12d3-a456-426614174000";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("reservationTransitionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as never);
    mockedTransition.mockResolvedValue(undefined as never);
  });

  it.each(["proof_received", "payment_approved", "cancel"])(
    "delega %s ao banco e devolve o evento concluído",
    async (event) => {
      const result = await reservationTransitionAction({}, form({ bookingId, event }));

      expect(mockedTransition).toHaveBeenCalledWith({ bookingId, event });
      expect(revalidatePath).toHaveBeenCalledWith(`/reserva/${bookingId}`);
      expect(result).toEqual({ completedEvent: event });
    },
  );

  it("ignora papel forjado no formulário; o banco decide e a recusa é repassada", async () => {
    mockedTransition.mockRejectedValue(
      new BookingOperationError("forbidden", "Você não tem permissão para esta ação."),
    );

    const result = await reservationTransitionAction(
      {},
      form({ bookingId, event: "payment_approved", role: "owner" }),
    );

    // Somente bookingId e event chegam à RPC; nenhum papel é repassado.
    expect(mockedTransition).toHaveBeenCalledWith({
      bookingId,
      event: "payment_approved",
    });
    expect(result).toEqual({ error: "Você não tem permissão para esta ação." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [{ bookingId, event: "expire" }],
    [{ bookingId, event: "" }],
    [{ bookingId }],
    [{ bookingId: "", event: "cancel" }],
  ])("rejeita entrada inválida %j sem chamar o banco", async (fields) => {
    const result = await reservationTransitionAction({}, form(fields));

    expect(result.error).toBe("Ação inválida para esta reserva.");
    expect(mockedTransition).not.toHaveBeenCalled();
  });

  it("usa mensagem genérica por evento em falhas inesperadas", async () => {
    mockedTransition.mockRejectedValue(new Error("network"));

    const result = await reservationTransitionAction(
      {},
      form({ bookingId, event: "payment_approved" }),
    );

    expect(result).toEqual({ error: "Não foi possível confirmar o pagamento." });
  });

  it("exige sessão e Supabase configurado antes de chamar o banco", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null as never);
    await expect(
      reservationTransitionAction({}, form({ bookingId, event: "cancel" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");

    vi.mocked(isSupabaseConfigured).mockReturnValueOnce(false);
    const result = await reservationTransitionAction({}, form({ bookingId, event: "cancel" }));
    expect(result.error).toMatch(/Supabase não está configurado/);

    expect(mockedTransition).not.toHaveBeenCalled();
  });
});
