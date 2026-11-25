import { NextResponse } from "next/server";
import { runCalendarWorker } from "@/server/calendar/google";
import { isCalendarWorkerAuthorized } from "@/server/calendar/worker-auth";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCalendarWorkerAuthorized(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isCalendarFeatureEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
      !process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try { return NextResponse.json(await runCalendarWorker(10)); }
  catch { return NextResponse.json({ error: "worker_failed" }, { status: 500 }); }
}
