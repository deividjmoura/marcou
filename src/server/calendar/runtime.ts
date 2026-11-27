import { calendarAdminClient } from "./admin";
import { createGoogleCalendarApi } from "./google";
import { createSupabaseCalendarStore } from "./store";

/** Configuração mínima de servidor para OAuth/worker (sem expor valores). */
export function isCalendarServerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_CLIENT_ID &&
      env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SITE_URL,
  );
}

export function calendarRuntime() {
  return {
    store: createSupabaseCalendarStore(calendarAdminClient()),
    google: createGoogleCalendarApi(),
  };
}
