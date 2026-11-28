import "server-only";
import { markPrivateNoStore } from "@/lib/http";
import {
  APP_VERSION,
  checkDatabaseHealth,
  getBuildCommit,
  isDeepHealthRequested,
  isHealthDeepAuthorized,
} from "@/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonNoStore(body: unknown, status = 200) {
  return markPrivateNoStore(Response.json(body, { status }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!isDeepHealthRequested(url)) {
    return jsonNoStore(
      {
        status: "ok",
        version: APP_VERSION,
        commit: getBuildCommit(),
      },
      200,
    );
  }

  if (!isHealthDeepAuthorized(request)) {
    return jsonNoStore({ status: "unauthorized" }, 401);
  }

  const database = await checkDatabaseHealth();
  const ok = database === "ok";

  return jsonNoStore(
    {
      status: ok ? "ok" : "degraded",
      version: APP_VERSION,
      commit: getBuildCommit(),
      checks: { database },
    },
    ok ? 200 : 503,
  );
}
