import { createClient } from "@supabase/supabase-js";
import { isCronAuthorized } from "@/server/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return response({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "cron_not_configured" }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Expiration is owned by PR #128's GitHub Actions workflow. This route
    // exclusively creates reminder events, avoiding competing expiration jobs.
    const reminders = await supabase.rpc("create_booking_reminders", {
      p_within_hours: 24,
    });

    if (reminders.error) {
      console.error("[cron] create_booking_reminders failed", {
        code: reminders.error.code,
      });
      return response({ error: "cron_job_failed" }, 500);
    }

    return response({
      ok: true,
      ranAt: new Date().toISOString(),
      jobs: {
        reminders: { status: "succeeded", created: reminders.data ?? 0 },
      },
    });
  } catch (error) {
    // Log only a safe error name; don't expose messages, query details or secrets.
    console.error("[cron] reminder scheduler threw", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return response({ error: "cron_job_failed" }, 500);
  }
}
