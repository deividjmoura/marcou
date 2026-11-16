import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
        single: mocks.single,
      })),
      upsert: mocks.upsert,
    })),
  })),
}));

import { GET } from "./route";

const ORIGIN = "http://localhost:3000";

function callbackRequest(search: string) {
  return new NextRequest(`${ORIGIN}/auth/callback${search}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: null },
      error: null,
    });
    mocks.single.mockResolvedValue({ data: { phone: "47999991234" }, error: null });
    mocks.upsert.mockImplementation(() => ({
      select: () => ({ single: mocks.single }),
    }));
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", user_metadata: { name: "Ana" } } },
      error: null,
    });
  });

  it("preserva o destino quando o consentimento do Google é cancelado", async () => {
    const response = await GET(
      callbackRequest(
        "?error=access_denied&next=%2Fp%2Fstudio-ana%3Fservice%3Dabc",
      ),
    );

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expect(location).toContain("error=O+login+com+Google+foi+cancelado.");
    expect(location).toContain("next=%2Fp%2Fstudio-ana%3Fservice%3Dabc");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("preserva o destino quando a troca do code falha", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid_grant"),
    });

    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expect(location).toContain("next=%2Fp%2Fstudio-ana");
  });

  it("levam o usuário com telefone para o destino original", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/p/studio-ana`);
  });

  it("encaminha para o perfil quando o telefone ainda falta", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.single.mockResolvedValue({ data: { phone: null }, error: null });

    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fp%2Fstudio-ana`,
    );
  });

  it("envia a recuperação diretamente para redefinir a senha, sem exigir telefone", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.single.mockResolvedValue({ data: { phone: null }, error: null });

    const response = await GET(
      callbackRequest("?code=recovery-code&flow=recovery&next=%2Fredefinir-senha"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/redefinir-senha`,
    );
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("não trata um destino isolado como recuperação de senha", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.single.mockResolvedValue({ data: { phone: null }, error: null });

    const response = await GET(
      callbackRequest("?code=abc&next=%2Fredefinir-senha"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fredefinir-senha`,
    );
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("não sobrescreve um nome já escolhido pelo usuário", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: "Nome do usuário" },
      error: null,
    });

    await GET(callbackRequest("?code=abc&next=%2Fpainel"));

    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: "user-1" },
      { onConflict: "id" },
    );
  });

  it("preenche o nome do provedidor apenas quando o perfil ainda não tem nome", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: { display_name: null },
      error: null,
    });

    await GET(callbackRequest("?code=abc&next=%2Fpainel"));

    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: "user-1", display_name: "Ana" },
      { onConflict: "id" },
    );
  });
});
