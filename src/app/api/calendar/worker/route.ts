import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCalendarWorker } from "@/server/calendar/google";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorized(request: Request) {
  const secret = process.env.GOOGLE_CALENDAR_WORKER_SECRET;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!secret || !match) return false;
  const expected = Buffer.from(secret), provided = Buffer.from(match[1]);
  return expected.length > 0 && expected.length === provided.length && timingSafeEqual(expected, provided);
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isCalendarFeatureEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
      !process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try { return NextResponse.json(await runCalendarWorker(10)); }
  catch { return NextResponse.json({ error: "worker_failed" }, { status: 500 }); }
}
