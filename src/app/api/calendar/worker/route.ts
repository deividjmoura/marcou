import { NextResponse } from "next/server";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarRuntime, isCalendarServerConfigured } from "@/server/calendar/runtime";
import { runCalendarSync } from "@/server/calendar/worker";
import { isCalendarWorkerAuthorized } from "@/server/calendar/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCalendarWorkerAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isCalendarFeatureEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  if (!isCalendarServerConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    return NextResponse.json(await runCalendarSync(calendarRuntime(), { limit: 10 }));
  } catch {
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}
