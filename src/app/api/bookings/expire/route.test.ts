import { afterEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.hoisted(() => vi.fn());
const mockCreateServiceClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mockCreateServiceClient,
}));

import { POST, GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  mockRpc.mockReset();
  mockCreateServiceClient.mockReset();
});

describe("POST /api/bookings/expire (validação de ambiente)", () => {
  it("rejeita quando BOOKING_EXPIRATION_SECRET não está definido", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "");
    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
      headers: { authorization: "Bearer qualquer-coisa" },
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });

  it("rejeita quando Authorization está ausente", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "segredo-teste");
    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("rejeita quando Authorization está incorreto", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "segredo-teste");
    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
      headers: { authorization: "Bearer segredo-errado" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("rejeita quando o cliente de serviço não está disponível", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "segredo-teste");
    mockCreateServiceClient.mockRejectedValue(new Error("sem chave"));
    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
      headers: { authorization: "Bearer segredo-teste" },
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });

  it("chama expire_stale_bookings com service role e retorna contagem", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "segredo-teste");
    mockRpc.mockResolvedValue({ data: 3, error: null });
    mockCreateServiceClient.mockResolvedValue({ rpc: mockRpc });

    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
      headers: { authorization: "Bearer segredo-teste" },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expired_count).toBe(3);
    expect(mockRpc).toHaveBeenCalledWith("expire_stale_bookings");
  });

  it("retorna 500 quando o banco falha", async () => {
    vi.stubEnv("BOOKING_EXPIRATION_SECRET", "segredo-teste");
    mockRpc.mockResolvedValue({ data: null, error: new Error("bd fora") });
    mockCreateServiceClient.mockResolvedValue({ rpc: mockRpc });

    const request = new Request("http://localhost/api/bookings/expire", {
      method: "POST",
      headers: { authorization: "Bearer segredo-teste" },
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});

describe("GET /api/bookings/expire", () => {
  it("rejeita método GET", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
  });
});
