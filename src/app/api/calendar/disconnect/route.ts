import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarNoticeRedirect, calendarSiteOrigin, isTrustedCalendarOrigin } from "@/server/calendar/http";
import { calendarRuntime, isCalendarServerConfigured } from "@/server/calendar/runtime";
import { cleanupProviderDisconnect } from "@/server/calendar/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desconexão em duas etapas: marca a conexão como suspensa com
 * disconnect_requested_at (tokens preservados) e tenta a limpeza na hora. O que
 * não puder ser removido agora continua com o worker; vínculos e conexão só
 * somem depois que os eventos saírem do Google ou forem marcados como órfãos.
 */
export async function POST(request: Request) {
  const origin = calendarSiteOrigin();
  if (!origin || !isTrustedCalendarOrigin(request)) {
    return NextResponse.json({ error: "origin_forbidden" }, { status: 403 });
  }
  if (!isCalendarFeatureEnabled()) return calendarNoticeRedirect("disabled", origin);
  if (!isCalendarServerConfigured()) return calendarNoticeRedirect("configuration-error", origin);

  const user = await requireUser("/painel/integracoes/calendario");
  const provider = await getOwnedProvider(user.id);
  if (!provider) return calendarNoticeRedirect("provider-required", origin);

  try {
    const deps = calendarRuntime();
    const requested = await deps.store.requestDisconnect(provider.id);
    if (requested === "none") return calendarNoticeRedirect("disconnected", origin);
    const result = await cleanupProviderDisconnect(deps, provider.id);
    if (!result.finalized) return calendarNoticeRedirect("disconnecting", origin);
    return calendarNoticeRedirect(result.orphaned > 0 ? "disconnected-orphaned" : "disconnected", origin);
  } catch {
    return calendarNoticeRedirect("disconnecting", origin);
  }
}
