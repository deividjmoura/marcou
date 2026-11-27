import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwnedProvider: vi.fn(),
  exchangeOAuthCode: vi.fn(),
}));

type StateEntry = { providerId: string; expiresAt: number };
const stateStore = new Map<string, StateEntry>();
const updateCalls: Array<Record<string, unknown>> = [];
const order: string[] = [];
let consumeFailure: { message: string } | null = null;

/**
 * Simula a semântica da RPC `consume_calendar_oauth_state`: leitura e remoção
 * acontecem antes de qualquer await, então apenas um chamador recebe a linha.
 */
const consumeState = async (hash: string) => {
  order.push(`consume:${hash}`);
  if (consumeFailure) return { data: null, error: consumeFailure };
  const entry = stateStore.get(hash);
  if (!entry || entry.expiresAt <= Date.now()) return { data: [], error: null };
  stateStore.delete(hash);
  return { data: [{ provider_id: entry.providerId }], error: null };
};

vi.mock("@/server/bookings", () => ({
  requireUser: mocks.requireUser,
  getOwnedProvider: mocks.getOwnedProvider,
}));

vi.mock("@/server/calendar/admin", () => ({
  calendarAdminClient: () => ({
    rpc: (name: string, args: { p_state_hash: string }) => {
      if (name !== "consume_calendar_oauth_state") {
        throw new Error(`unexpected_rpc:${name}`);
      }
      return consumeState(args.p_state_hash);
    },
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updateCalls.push(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

vi.mock("@/server/calendar/google", () => ({
  exchangeOAuthCode: mocks.exchangeOAuthCode,
}));

import { GET } from "./route";
import { decryptCalendarToken, hashCalendarState } from "@/server/calendar/crypto";
import { calendarRedirectUri } from "@/server/calendar/oauth";

const SITE_URL = "https://marcou.example";
const PROVIDER_ID = "11111111-1111-1111-1111-111111111111";
const CODE = "oauth-code-single-use";

function seedState(state: string, expiresInMs = 10 * 60 * 1000) {
  const hash = hashCalendarState(state);
  stateStore.set(hash, { providerId: PROVIDER_ID, expiresAt: Date.now() + expiresInMs });
  return hash;
}

function callbackRequest(state: string, code = CODE) {
  const url = new URL("/api/calendar/callback", SITE_URL);
  url.searchParams.set("state", state);
  url.searchParams.set("code", code);
  return new Request(url);
}

async function redirectOutcome(response: Response) {
  const location = new URL(response.headers.get("location") ?? "");
  return {
    status: response.status,
    calendar: location.searchParams.get("calendar"),
    pathname: location.pathname,
  };
}

describe("GET /api/calendar/callback — consumo atômico do OAuth state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateStore.clear();
    updateCalls.length = 0;
    order.length = 0;
    consumeFailure = null;
    vi.stubEnv("GOOGLE_CALENDAR_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_URL);
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    mocks.requireUser.mockResolvedValue({ id: "owner-1" });
    mocks.getOwnedProvider.mockResolvedValue({ id: PROVIDER_ID });
    mocks.exchangeOAuthCode.mockImplementation(async (code: string) => {
      order.push(`exchange:${code}`);
      return {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.events",
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("consome o state antes de trocar o código e persiste os tokens cifrados", async () => {
    const state = "state-valido";
    const hash = seedState(state);

    const outcome = await redirectOutcome(await GET(callbackRequest(state)));

    expect(outcome).toEqual({ status: 307, calendar: "connected", pathname: "/painel" });
    expect(order).toEqual([`consume:${hash}`, `exchange:${CODE}`]);
    expect(mocks.exchangeOAuthCode).toHaveBeenCalledWith(CODE, calendarRedirectUri());
    expect(updateCalls).toHaveLength(1);
    const saved = updateCalls[0];
    expect(saved.connection_status).toBe("connected");
    expect(decryptCalendarToken(String(saved.refresh_token_ciphertext))).toBe("refresh-token");
    expect(decryptCalendarToken(String(saved.access_token_ciphertext))).toBe("access-token");
    expect(saved).not.toHaveProperty("oauth_state_hash");
    expect(saved).not.toHaveProperty("oauth_state_expires_at");
    expect(updateCalls[0]).not.toHaveProperty("provider_id");
  });

  it("rejeita state expirado sem chamar a troca do código", async () => {
    const state = "state-expirado";
    seedState(state, -1000);

    const outcome = await redirectOutcome(await GET(callbackRequest(state)));

    expect(outcome.calendar).toBe("expired-state");
    expect(mocks.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("rejeita state inexistente sem chamar a troca do código", async () => {
    const outcome = await redirectOutcome(await GET(callbackRequest("state-desconhecido")));

    expect(outcome.calendar).toBe("expired-state");
    expect(mocks.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("bloqueia replay sequencial: o segundo callback não troca o código", async () => {
    const state = "state-replay";
    seedState(state);

    const first = await redirectOutcome(await GET(callbackRequest(state)));
    const second = await redirectOutcome(await GET(callbackRequest(state)));

    expect(first.calendar).toBe("connected");
    expect(second.calendar).toBe("expired-state");
    expect(mocks.exchangeOAuthCode).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(1);
  });

  it("bloqueia callbacks concorrentes: apenas um consome o state e troca o código", async () => {
    const state = "state-corrida";
    seedState(state);

    const [first, second] = await Promise.all([
      GET(callbackRequest(state)),
      GET(callbackRequest(state)),
    ]);
    const outcomes = await Promise.all([redirectOutcome(first), redirectOutcome(second)]);
    const calendars = outcomes.map((outcome) => outcome.calendar).sort();

    expect(calendars).toEqual(["connected", "expired-state"]);
    expect(mocks.exchangeOAuthCode).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(1);
    expect(order.filter((entry) => entry.startsWith("consume:"))).toHaveLength(2);
  });

  it("exige nova autorização quando a troca falha depois do consumo", async () => {
    const state = "state-falha-troca";
    seedState(state);
    mocks.exchangeOAuthCode.mockRejectedValue(new Error("calendar_oauth_exchange_failed"));

    const failed = await redirectOutcome(await GET(callbackRequest(state)));
    const replay = await redirectOutcome(await GET(callbackRequest(state)));

    expect(failed.calendar).toBe("connection-error");
    expect(replay.calendar).toBe("expired-state");
    expect(updateCalls).toHaveLength(0);
    expect(mocks.exchangeOAuthCode).toHaveBeenCalledTimes(1);
  });

  it("exige nova autorização quando a resposta não traz refresh token", async () => {
    const state = "state-sem-refresh";
    seedState(state);
    mocks.exchangeOAuthCode.mockResolvedValue({ access_token: "access-token", expires_in: 3600 });

    const outcome = await redirectOutcome(await GET(callbackRequest(state)));

    expect(outcome.calendar).toBe("missing-refresh-token");
    expect(updateCalls).toHaveLength(0);
    expect(await consumeState(hashCalendarState(state))).toEqual({ data: [], error: null });
  });

  it("não persiste tokens quando o provider não pertence ao usuário", async () => {
    const state = "state-de-terceiro";
    seedState(state);
    mocks.getOwnedProvider.mockResolvedValue({ id: "22222222-2222-2222-2222-222222222222" });

    const outcome = await redirectOutcome(await GET(callbackRequest(state)));

    expect(outcome.calendar).toBe("forbidden");
    expect(mocks.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("falha em segurança quando a RPC de consumo retorna erro", async () => {
    const state = "state-erro-rpc";
    seedState(state);
    consumeFailure = { message: "calendar_state_consume_failed" };

    const outcome = await redirectOutcome(await GET(callbackRequest(state)));

    expect(outcome.calendar).toBe("connection-error");
    expect(mocks.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(stateStore.get(hashCalendarState(state))).toBeDefined();
  });

  it("ignora o callback quando a integração está desligada", async () => {
    vi.stubEnv("GOOGLE_CALENDAR_ENABLED", "false");
    seedState("state-desligado");

    const outcome = await redirectOutcome(await GET(callbackRequest("state-desligado")));

    expect(outcome.calendar).toBe("disabled");
    expect(order).toHaveLength(0);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
});
