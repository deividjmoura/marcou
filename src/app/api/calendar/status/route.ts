import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarRuntime } from "@/server/calendar/runtime";
import { getCalendarIntegrationView } from "@/server/calendar/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isCalendarFeatureEnabled()) return NextResponse.json({ enabled: false, connected: false }, { status: 404 });
  const user = await requireUser("/painel");
  const provider = await getOwnedProvider(user.id);
  if (!provider) return NextResponse.json({ enabled: true, connected: false, state: "not_connected" });
  try {
    const view = await getCalendarIntegrationView(calendarRuntime().store, provider.id);
    return NextResponse.json({
      enabled: true,
      connected: view.state === "connected",
      state: view.state,
      orphanedEvents: view.orphanedEvents,
    });
  } catch {
    return NextResponse.json({ enabled: true, connected: false }, { status: 503 });
  }
}
