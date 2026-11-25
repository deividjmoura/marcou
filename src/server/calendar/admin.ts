import { createServerClient } from "@supabase/ssr";

/**
 * Cliente service-role exclusivo do servidor para o Calendar. Usa
 * @supabase/ssr (padrão do repositório) sem cookies: não há sessão de usuário,
 * então as requisições saem com a chave service-role e nunca chegam ao
 * navegador.
 */
export function calendarAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("calendar_server_not_configured");
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => undefined },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export type CalendarAdminClient = ReturnType<typeof calendarAdminClient>;
