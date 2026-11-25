import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { calendarAdminClient } from "@/server/calendar/admin";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
export const runtime = "nodejs";
export async function GET() {
  if (!isCalendarFeatureEnabled()) return NextResponse.json({ enabled: false, connected: false }, { status: 404 });
  const user = await requireUser("/painel"), provider = await getOwnedProvider(user.id);
  if (!provider) return NextResponse.json({ enabled: true, connected: false });
  const { data, error } = await calendarAdminClient().from("provider_calendar_connections").select("connection_status,connected_at").eq("provider_id", provider.id).maybeSingle();
  if (error) return NextResponse.json({ enabled: true, connected: false }, { status: 503 });
  return NextResponse.json({ enabled: true, connected: data?.connection_status === "connected", connectedAt: data?.connected_at ?? null });
}
