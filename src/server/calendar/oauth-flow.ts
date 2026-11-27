import { encryptCalendarToken, hashCalendarState } from "./crypto";
import { CalendarSyncError } from "./errors";
import type { GoogleCalendarApi } from "./google";
import { CALENDAR_OAUTH_STATE_TTL_MS, calendarOAuthState, hasCalendarEventsScope } from "./oauth";
import type { CalendarStore } from "./store";

export type OAuthFlowDeps = {
  store: CalendarStore;
  google: GoogleCalendarApi;
  encrypt?: (value: string) => string;
  now?: () => number;
};

export type StartOAuthResult =
  | { kind: "redirect"; state: string }
  | { kind: "notice"; notice: "disconnecting" };

/** Gera state preso ao usuário que iniciou o fluxo; só o hash é persistido. */
export async function startCalendarOAuth(
  deps: OAuthFlowDeps,
  input: { providerId: string; userId: string },
): Promise<StartOAuthResult> {
  const now = deps.now ?? Date.now;
  const { state, hash } = calendarOAuthState();
  const started = await deps.store.startOAuth({
    providerId: input.providerId,
    userId: input.userId,
    stateHash: hash,
    expiresAt: new Date(now() + CALENDAR_OAUTH_STATE_TTL_MS).toISOString(),
  });
  if (started === "disconnecting") return { kind: "notice", notice: "disconnecting" };
  return { kind: "redirect", state };
}

export type CallbackNotice =
  | "connected"
  | "expired-state"
  | "forbidden"
  | "disconnecting"
  | "insufficient-scope"
  | "missing-refresh-token"
  | "connection-error";

/**
 * Callback OAuth:
 * 1. consome o state de forma atômica ANTES de trocar o code (replay e
 *    corrida entre callbacks falham);
 * 2. exige que o state tenha sido emitido para o mesmo usuário e que ele ainda
 *    seja dono do prestador;
 * 3. exige o escopo calendar.events em `tokens.scope` e um refresh token;
 *    caso contrário revoga o que foi emitido e recusa.
 */
export async function completeCalendarOAuth(
  deps: OAuthFlowDeps,
  input: {
    state: string;
    code: string;
    userId: string;
    ownedProviderId: string | null;
    redirectUri: string;
  },
): Promise<CallbackNotice> {
  const now = deps.now ?? Date.now;
  const encrypt = deps.encrypt ?? encryptCalendarToken;

  const consumed = await deps.store.consumeOAuthState(hashCalendarState(input.state), input.userId);
  if (consumed.outcome === "invalid" || consumed.outcome === "expired") return "expired-state";
  if (consumed.outcome === "forbidden") return "forbidden";
  if (consumed.outcome === "disconnecting") return "disconnecting";
  if (!consumed.providerId || consumed.providerId !== input.ownedProviderId) return "forbidden";

  let tokens;
  try {
    tokens = await deps.google.exchangeCode(input.code, input.redirectUri);
  } catch {
    return "connection-error";
  }

  if (!hasCalendarEventsScope(tokens.scope)) {
    await deps.google.revokeToken(tokens.refresh_token ?? tokens.access_token);
    return "insufficient-scope";
  }
  if (!tokens.refresh_token) {
    await deps.google.revokeToken(tokens.access_token);
    return "missing-refresh-token";
  }

  try {
    await deps.store.completeOAuth({
      providerId: consumed.providerId,
      refreshCiphertext: encrypt(tokens.refresh_token),
      accessCiphertext: encrypt(tokens.access_token),
      accessExpiresAt: new Date(now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      grantedScope: tokens.scope ?? "",
    });
  } catch (error) {
    // Não deixar token válido no Google sem registro local.
    await deps.google.revokeToken(tokens.refresh_token);
    if (error instanceof CalendarSyncError) return "connection-error";
    throw error;
  }
  return "connected";
}
