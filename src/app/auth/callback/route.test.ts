import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  selectMaybeSingle: vi.fn(),
  selectSingle: vi.fn(),
  upsert: vi.fn(),
  upsertMaybeSingle: vi.fn(),
  update: vi.fn(),
  updateMaybeSingle: vi.fn(),
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
        eq: vi.fn(() => ({
          maybeSingle: mocks.selectMaybeSingle,
          single: mocks.selectSingle,
        })),
      })),
      upsert: mocks.upsert,
      update: mocks.update,
    })),
  })),
}));

import { GET } from "./route";

const ORIGIN = "http://localhost:3000";

function callbackRequest(search: string) {
  return new NextRequest(`${ORIGIN}/auth/callback${search}`);
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("GET /auth/callback", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.clearAllMocks();
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });
    mocks.selectSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });
    mocks.upsertMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: null },
      error: null,
    });
    mocks.upsert.mockImplementation(() => ({
      select: () => ({ maybeSingle: mocks.upsertMaybeSingle }),
    }));
    mocks.updateMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });
    mocks.update.mockImplementation(() => ({
      eq: () => ({
        is: () => ({
          select: () => ({ maybeSingle: mocks.updateMaybeSingle }),
        }),
        eq: () => ({
          select: () => ({ maybeSingle: mocks.updateMaybeSingle }),
        }),
      }),
    }));
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "user-1", user_metadata: { name: "Ana" } },
      },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", user_metadata: { name: "Ana" } } },
      error: null,
    });
  });

  it("não reflete uma origem de callback fornecida pelo cliente", async () => {
    const request = new NextRequest(
      "https://attacker.example/auth/callback?error=access_denied",
    );
    const response = await GET(request);

    expect(response.headers.get("location")?.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expectPrivateNoStore(response);
  });

  it("preserva o destino quando o consentimento do Google é cancelado", async () => {
    const response = await GET(
      callbackRequest(
        "?error=access_denied&error_description=%3Cscript%3Ealert%281%29%3C%2Fscript%3E&next=%2Fp%2Fstudio-ana%3Fservice%3Dabc",
      ),
    );

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expect(location).toContain("error=O+login+com+Google+foi+cancelado.");
    expect(location).toContain("next=%2Fp%2Fstudio-ana%3Fservice%3Dabc");
    expect(location).not.toContain("script");
    expectPrivateNoStore(response);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("preserva o destino quando a troca do code falha", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid_grant"),
    });

    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expect(location).toContain("next=%2Fp%2Fstudio-ana");
    expectPrivateNoStore(response);
  });

  it("leva o usuário recorrente com telefone para o destino original sem chamar getUser nem escrever no banco", async () => {
    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/p/studio-ana`);
    expectPrivateNoStore(response);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("encaminha para o perfil quando o telefone ainda falta", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: null },
      error: null,
    });

    const response = await GET(callbackRequest("?code=abc&next=%2Fp%2Fstudio-ana"));

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fp%2Fstudio-ana`,
    );
  });

  it("envia a recuperação diretamente para redefinir a senha, sem exigir telefone", async () => {
    const response = await GET(
      callbackRequest("?code=recovery-code&flow=recovery&next=%2Fpainel"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/redefinir-senha`,
    );
    expectPrivateNoStore(response);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(mocks.selectMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("não trata um destino isolado como recuperação de senha", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(
      callbackRequest("?code=abc&next=%2Fredefinir-senha"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fredefinir-senha`,
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: "user-1", display_name: "Ana" },
      { onConflict: "id", ignoreDuplicates: true },
    );
  });

  it("não sobrescreve nem regrava quando o perfil já possui nome escolhido pelo usuário", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { display_name: "Nome do usuário", phone: "47999991234" },
      error: null,
    });

    await GET(callbackRequest("?code=abc&next=%2Fpainel"));

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preenche o nome do provedor apenas quando o perfil existente ainda não tem nome", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { display_name: null, phone: "47999991234" },
      error: null,
    });

    await GET(callbackRequest("?code=abc&next=%2Fpainel"));

    expect(mocks.update).toHaveBeenCalledWith({ display_name: "Ana" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
