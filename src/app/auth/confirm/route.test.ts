import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
    },
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        if (columns === "display_name") {
          return { eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) };
        }
        return { single: mocks.single };
      }),
      upsert: mocks.upsert,
    })),
  })),
}));

import { GET } from "./route";

const ORIGIN = "https://marcoou.netlify.app";

function confirmationRequest(search: string) {
  return new NextRequest(`${ORIGIN}/auth/confirm${search}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: "Ana" },
      error: null,
    });
    mocks.single.mockResolvedValue({
      data: { phone: "47999991234" },
      error: null,
    });
    mocks.upsert.mockImplementation(() => ({
      select: () => ({ single: mocks.single }),
    }));
  });

  it("confirma o token PKCE e retorna ao destino permitido", async () => {
    const response = await GET(
      confirmationRequest(
        "?token_hash=token-123&type=email&next=https%3A%2F%2Fmarcoou.netlify.app%2Fmeus-agendamentos",
      ),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-123",
      type: "email",
    });
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/meus-agendamentos`,
    );
  });

  it("encaminha para completar perfil quando o telefone está ausente", async () => {
    mocks.single.mockResolvedValue({ data: { phone: null }, error: null });

    const response = await GET(
      confirmationRequest("?token_hash=token-123&type=email&next=%2Fpainel"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fpainel`,
    );
  });

  it("rejeita tipos diferentes de confirmação de e-mail", async () => {
    const response = await GET(
      confirmationRequest("?token_hash=token-123&type=recovery&next=%2Fpainel"),
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login?");
    expect(response.headers.get("location")).toContain("Link+de+confirma%C3%A7%C3%A3o");
  });

  it("não permite redirecionamento para outro domínio", async () => {
    const response = await GET(
      confirmationRequest(
        "?token_hash=token-123&type=email&next=https%3A%2F%2Fevil.example%2Fsteal",
      ),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/painel`);
  });

  it("retorna ao login quando o token expirou ou já foi usado", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error("otp_expired") });

    const response = await GET(
      confirmationRequest("?token_hash=expired&type=email&next=%2Fpainel"),
    );

    expect(response.headers.get("location")).toContain("/login?");
    expect(response.headers.get("location")).toContain("expirou");
  });

  it("não sobrescreve o nome já escolhido no perfil", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: "Nome escolhido" },
      error: null,
    });

    await GET(
      confirmationRequest("?token_hash=token-123&type=email&next=%2Fpainel"),
    );

    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: "user-1" },
      { onConflict: "id" },
    );
  });
});
