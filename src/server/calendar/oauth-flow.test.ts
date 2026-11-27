import { beforeEach, describe, expect, it } from "vitest";
import { hashCalendarState } from "./crypto";
import { CALENDAR_EVENTS_SCOPE } from "./oauth";
import { completeCalendarOAuth, startCalendarOAuth } from "./oauth-flow";
import { FakeGoogle, FakeStore, fakeCrypto } from "./test-fakes";

const PROVIDER = "provider-1";
const USER = "user-1";
let store: FakeStore;
let google: FakeGoogle;
const deps = () => ({ store, google, encrypt: fakeCrypto.encrypt });
const callback = (state: string, overrides: Partial<Parameters<typeof completeCalendarOAuth>[1]> = {}) =>
  completeCalendarOAuth(deps(), {
    state,
    code: "auth-code",
    userId: USER,
    ownedProviderId: PROVIDER,
    redirectUri: "https://marcou.example/api/calendar/callback",
    ...overrides,
  });

async function begin(userId = USER) {
  const result = await startCalendarOAuth(deps(), { providerId: PROVIDER, userId });
  if (result.kind !== "redirect") throw new Error("expected redirect");
  return result.state;
}

beforeEach(() => {
  store = new FakeStore();
  google = new FakeGoogle();
});

describe("Calendar OAuth — conexão", () => {
  it("persiste só o hash do state, preso ao usuário", async () => {
    const state = await begin();
    const saved = store.connections.get(PROVIDER)!.state!;
    expect(saved.hash).toBe(hashCalendarState(state));
    expect(saved.hash).not.toBe(state);
    expect(saved.userId).toBe(USER);
  });

  it("conecta com escopo e refresh token válidos, gravando tokens cifrados", async () => {
    const state = await begin();
    expect(await callback(state)).toBe("connected");
    expect(store.connections.get(PROVIDER)).toMatchObject({
      connection_status: "connected",
      refresh_token_ciphertext: "enc:oauth-refresh",
      access_token_ciphertext: "enc:oauth-access",
    });
  });

  it("state é de uso único: replay falha sem nova troca de code", async () => {
    const state = await begin();
    expect(await callback(state)).toBe("connected");
    expect(await callback(state)).toBe("expired-state");
    expect(google.calls.filter((c) => c.method === "exchangeCode")).toHaveLength(1);
  });

  it("callbacks simultâneos: só um troca o code", async () => {
    const state = await begin();
    const results = await Promise.all([callback(state), callback(state)]);
    expect(results.sort()).toEqual(["connected", "expired-state"]);
    expect(google.calls.filter((c) => c.method === "exchangeCode")).toHaveLength(1);
  });

  it("state iniciado por outro usuário é recusado e queimado", async () => {
    const state = await begin("attacker");
    expect(await callback(state)).toBe("forbidden");
    expect(store.connections.get(PROVIDER)!.state).toBeUndefined();
    expect(google.calls).toHaveLength(0);
  });

  it("usuário que não é mais dono do prestador é recusado antes da troca", async () => {
    const state = await begin();
    expect(await callback(state, { ownedProviderId: "other-provider" })).toBe("forbidden");
    expect(google.calls).toHaveLength(0);
  });

  it("recusa e revoga quando o Google não devolve scope", async () => {
    google.exchangeResult = { access_token: "a", refresh_token: "r", expires_in: 3600 };
    const state = await begin();
    expect(await callback(state)).toBe("insufficient-scope");
    expect(google.revoked).toEqual(["r"]);
    expect(store.connections.get(PROVIDER)!.connection_status).toBe("pending");
  });

  it("recusa escopo diferente de calendar.events", async () => {
    google.exchangeResult = {
      access_token: "a",
      refresh_token: "r",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
    };
    const state = await begin();
    expect(await callback(state)).toBe("insufficient-scope");
  });

  it("aceita calendar.events entre outros escopos devolvidos", async () => {
    google.exchangeResult = { access_token: "a", refresh_token: "r", scope: `openid ${CALENDAR_EVENTS_SCOPE}` };
    const state = await begin();
    expect(await callback(state)).toBe("connected");
  });

  it("sem refresh token recusa e revoga o access token", async () => {
    google.exchangeResult = { access_token: "a", scope: CALENDAR_EVENTS_SCOPE };
    const state = await begin();
    expect(await callback(state)).toBe("missing-refresh-token");
    expect(google.revoked).toEqual(["a"]);
  });

  it("falha na troca do code vira connection-error", async () => {
    google.exchangeResult = new Error("network");
    const state = await begin();
    expect(await callback(state)).toBe("connection-error");
  });

  it("não inicia nova conexão enquanto a desconexão está em andamento", async () => {
    store.connect(PROVIDER);
    await store.requestDisconnect(PROVIDER);
    expect(await startCalendarOAuth(deps(), { providerId: PROVIDER, userId: USER })).toEqual({
      kind: "notice",
      notice: "disconnecting",
    });
  });
});
