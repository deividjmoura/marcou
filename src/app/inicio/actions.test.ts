import { beforeEach, describe, expect, it, vi } from "vitest";
import { withAuthFlowCollector, type AuthFlowTiming } from "@/server/identity";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwnedProvider: vi.fn(),
  rpc: vi.fn(),
  profileMaybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/server/bookings", () => ({
  requireUser: mocks.requireUser,
  getOwnedProvider: mocks.getOwnedProvider,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mocks.profileMaybeSingle,
        })),
      })),
    })),
  })),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { setPreferredModeAction } from "./actions";
import InicioPage from "./page";

function modeForm(mode: string) {
  const data = new FormData();
  data.set("mode", mode);
  return data;
}

describe("troca entre Cliente e Profissional e bootstrap pós-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    mocks.requireUser.mockResolvedValue({
      id: "user-mode-1",
      email: "ana@example.com",
      user_metadata: { display_name: "Ana" },
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana Paula" },
      error: null,
    });
  });

  it("alterna para área Cliente persistindo a preferência e redirecionando para /minha-conta", async () => {
    mocks.rpc.mockResolvedValue({ data: "customer", error: null });

    await expect(
      setPreferredModeAction(modeForm("customer")),
    ).rejects.toThrow("NEXT_REDIRECT:/minha-conta");

    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_mode", {
      p_mode: "customer",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inicio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/minha-conta");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/painel");
  });

  it("alterna para área Profissional quando a conta possui provider próprio", async () => {
    mocks.getOwnedProvider.mockResolvedValue({
      id: "prov-1",
      display_name: "Estúdio Ana",
    });
    mocks.rpc.mockResolvedValue({ data: "provider", error: null });

    await expect(
      setPreferredModeAction(modeForm("provider")),
    ).rejects.toThrow("NEXT_REDIRECT:/painel");

    expect(mocks.getOwnedProvider).toHaveBeenCalledWith("user-mode-1");
    expect(mocks.rpc).toHaveBeenCalledWith("set_preferred_mode", {
      p_mode: "provider",
    });
  });

  it("encaminha para o setup em /painel sem gravar preferência Profissional quando não há negócio", async () => {
    mocks.getOwnedProvider.mockResolvedValue(null);

    await expect(
      setPreferredModeAction(modeForm("provider")),
    ).rejects.toThrow("NEXT_REDIRECT:/painel");

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita modo inválido retornando para /inicio", async () => {
    await expect(setPreferredModeAction(modeForm("admin"))).rejects.toThrow(
      "NEXT_REDIRECT:/inicio",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("carrega /inicio em paralelo e mede o bootstrap pós-login sem registrar PII", async () => {
    mocks.getOwnedProvider.mockResolvedValue({
      id: "prov-1",
      display_name: "Estúdio Ana",
    });
    mocks.rpc.mockResolvedValue({ data: "provider", error: null });

    const reports: AuthFlowTiming[] = [];
    const rendered = await withAuthFlowCollector(
      (report) => reports.push(report),
      () => InicioPage({ searchParams: Promise.resolve({}) }),
    );

    expect(rendered).toBeTruthy();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      flow: "account_bootstrap",
      outcome: "loaded",
      steps: [
        { step: "auth_get_user" },
        { step: "supabase_client" },
        { step: "load_account_context" },
      ],
    });

    const raw = JSON.stringify(reports);
    expect(raw).not.toContain("user-mode-1");
    expect(raw).not.toContain("ana@example.com");
    expect(raw).not.toContain("Ana Paula");
    expect(raw).not.toContain("Estúdio Ana");
  });
});
