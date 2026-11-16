import { createClient } from "@supabase/supabase-js";
import { isCronAuthorized } from "@/server/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "cron_not_configured" },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const [expiration, reminders] = await Promise.all([
    supabase.rpc("expire_stale_bookings"),
    supabase.rpc("create_booking_reminders", { p_within_hours: 24 }),
  ]);

  if (expiration.error || reminders.error) {
    // Log only operation names and database error codes; never log credentials.
    if (expiration.error) {
      console.error("[cron] expire_stale_bookings failed", {
        code: expiration.error.code,
      });
    }
    if (reminders.error) {
      console.error("[cron] create_booking_reminders failed", {
        code: reminders.error.code,
      });
    }

    return Response.json(
      {
        error: "cron_job_failed",
        jobs: {
          expiration: expiration.error ? "failed" : "succeeded",
          reminders: reminders.error ? "failed" : "succeeded",
        },
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    jobs: {
      expiration: { status: "succeeded", expired: expiration.data ?? 0 },
      reminders: { status: "succeeded", created: reminders.data ?? 0 },
    },
  });
}
