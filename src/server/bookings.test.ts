import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { getProvider, listProviderBookingsForPanel, requireUser } from "./bookings";

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });

  it("sends unauthenticated users to login with the protected local route", async () => {
    await expect(requireUser("/painel")).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Fpainel",
    );
  });

  it("does not preserve an external next destination", async () => {
    await expect(requireUser("https://evil.example/steal")).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Finicio",
    );
  });

  it("returns the authenticated Supabase user", async () => {
    const user = { id: "user-1" };
    mocks.getUser.mockResolvedValue({ data: { user } });
    await expect(requireUser("/inicio")).resolves.toEqual(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("listProviderBookingsForPanel", () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  const from = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [], error: null });
    from.mockReturnValue(query);
    mocks.createClient.mockResolvedValue({ from });
  });

  it("filtra pelo prestador dono da sessão", async () => {
    await listProviderBookingsForPanel("provider-1");

    expect(from).toHaveBeenCalledWith("bookings");
    expect(query.eq).toHaveBeenCalledWith("provider_id", "provider-1");
    expect(query.order).toHaveBeenCalledWith("starts_at", { ascending: false });
  });

  it("distingue falha de consulta de agenda vazia", async () => {
    query.order.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    await expect(listProviderBookingsForPanel("provider-1")).resolves.toEqual({
      bookings: [],
      failed: true,
    });

    query.order.mockResolvedValue({ data: [], error: null });
    await expect(listProviderBookingsForPanel("provider-1")).resolves.toEqual({
      bookings: [],
      failed: false,
    });
  });

  it("devolve os agendamentos do prestador quando a consulta funciona", async () => {
    const bookings = [{ id: "booking-1", provider_id: "provider-1" }];
    query.order.mockResolvedValue({ data: bookings, error: null });

    await expect(listProviderBookingsForPanel("provider-1")).resolves.toEqual({
      bookings,
      failed: false,
    });
  });
});


describe("getProvider: avatar público", () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const from = vi.fn();
  const getPublicUrl = vi.fn();
  const storageFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: {
        id: "provider-1",
        slug: "studio-ana",
        display_name: "Ana Silva",
        avatar_path: "providers/provider-1/avatar/avatar-id.jpg",
      },
      error: null,
    });
    from.mockReturnValue(query);
    getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.test/service-images/avatar.jpg" },
    });
    storageFrom.mockReturnValue({ getPublicUrl });
    mocks.createClient.mockResolvedValue({
      from,
      storage: { from: storageFrom },
    });
  });

  it("converte avatar_path em URL pública do bucket compartilhado", async () => {
    const provider = await getProvider("studio-ana");

    expect(provider?.avatar_url).toBe(
      "https://storage.example.test/service-images/avatar.jpg",
    );
    expect(storageFrom).toHaveBeenCalledWith("service-images");
    expect(getPublicUrl).toHaveBeenCalledWith(
      "providers/provider-1/avatar/avatar-id.jpg",
    );
  });

  it("retorna null para avatar_url quando não há foto", async () => {
    query.maybeSingle.mockResolvedValueOnce({
      data: {
        id: "provider-1",
        slug: "studio-ana",
        display_name: "Ana Silva",
        avatar_path: null,
      },
      error: null,
    });

    const provider = await getProvider("studio-ana");

    expect(provider?.avatar_url).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
