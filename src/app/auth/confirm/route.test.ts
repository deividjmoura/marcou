import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { withAuthFlowCollector, type AuthFlowTiming } from "@/server/identity";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
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
      verifyOtp: mocks.verifyOtp,
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

const ORIGIN = "https://marcoou.netlify.app";

function confirmationRequest(search: string) {
  return new NextRequest(`${ORIGIN}/auth/confirm${search}`);
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("GET /auth/confirm", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
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
  });

  it("confirma o token hash e retorna ao destino permitido sem regravar perfil existente", async () => {
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
    expectPrivateNoStore(response);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("cria o perfil e encaminha para completar perfil quando o telefone está ausente", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(
      confirmationRequest("?token_hash=token-123&type=email&next=%2Fpainel"),
    );

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/perfil?next=%2Fpainel`,
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      { id: "user-1", display_name: "Ana" },
      { onConflict: "id", ignoreDuplicates: true },
    );
    expectPrivateNoStore(response);
  });

  it("rejeita tipos de token que não são confirmação nem recuperação", async () => {
    const response = await GET(
      confirmationRequest("?token_hash=token-123&type=magiclink&next=%2Fpainel"),
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login?");
    expect(response.headers.get("location")).toContain("link+de+confirma%C3%A7%C3%A3o");
    expectPrivateNoStore(response);
  });

  it("envia qualquer recuperação válida sempre para redefinir a senha", async () => {
    const response = await GET(
      confirmationRequest(
        "?token_hash=recovery-token&type=recovery&next=https%3A%2F%2Fevil.example%2Fsteal",
      ),
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-token",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/redefinir-senha`);
    expectPrivateNoStore(response);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });


  it("usa a origem do Deploy Preview capturada no build e ignora a origem da requisição", async () => {
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv(
      "MARCOU_AUTH_DEPLOY_PRIME_URL",
      "https://deploy-preview-42--marcoou.netlify.app",
    );

    const request = new NextRequest(
      "https://attacker.example/auth/confirm?token_hash=recovery-token&type=recovery",
      { headers: { "x-forwarded-host": "forged.example" } },
    );
    const response = await GET(request);

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-token",
      type: "recovery",
    });
    expect(response.headers.get("location")).toBe(
      "https://deploy-preview-42--marcoou.netlify.app/redefinir-senha",
    );
    expectPrivateNoStore(response);
  });

  it("não permite redirecionamento para outro domínio", async () => {
    const response = await GET(
      confirmationRequest(
        "?token_hash=token-123&type=email&next=https%3A%2F%2Fevil.example%2Fsteal",
      ),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/inicio`);
    expectPrivateNoStore(response);
  });

  it("retorna ao login quando o token expirou ou já foi usado", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new Error("otp_expired"),
    });

    const response = await GET(
      confirmationRequest("?token_hash=expired&type=email&next=%2Fpainel"),
    );

    expect(response.headers.get("location")).toContain("/login?");
    expect(response.headers.get("location")).toContain("expirou");
    expectPrivateNoStore(response);
  });

  it("não sobrescreve o nome já escolhido no perfil", async () => {
    mocks.selectMaybeSingle.mockResolvedValue({
      data: { display_name: "Nome escolhido", phone: "47999991234" },
      error: null,
    });

    await GET(
      confirmationRequest("?token_hash=token-123&type=email&next=%2Fpainel"),
    );

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("mede confirmação de e-mail e recuperação sem registrar token_hash, user_id ou telefone", async () => {
    const reports: AuthFlowTiming[] = [];

    await withAuthFlowCollector(
      (report) => reports.push(report),
      async () => {
        await GET(
          confirmationRequest("?token_hash=hash-secreto-email&type=email&next=%2Fpainel"),
        );
        await GET(
          confirmationRequest("?token_hash=hash-secreto-rec&type=recovery&next=%2Fpainel"),
        );
      },
    );

    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      flow: "email_confirm",
      outcome: "redirect_next",
      steps: [
        { step: "supabase_client" },
        { step: "auth_verify_otp" },
        { step: "ensure_profile", profileWritten: false },
      ],
    });
    expect(reports[1]).toMatchObject({
      flow: "email_confirm",
      outcome: "redirect_recovery",
      steps: [{ step: "supabase_client" }, { step: "auth_verify_otp" }],
    });

    const raw = JSON.stringify(reports);
    expect(raw).not.toContain("hash-secreto");
    expect(raw).not.toContain("user-1");
    expect(raw).not.toContain("47999991234");
    expect(raw).not.toContain("/painel");
  });
});
