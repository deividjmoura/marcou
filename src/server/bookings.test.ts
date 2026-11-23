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

import { requireUser } from "./bookings";

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
