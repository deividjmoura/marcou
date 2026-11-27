import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com privilégios de `service_role`.
 *
 * Destinado exclusivamente a jobs de backend (ex.: expiração de reservas
 * vencidas) que precisam executar operações fora do contexto de um usuário
 * autenticado. Nunca deve ser exposto ao navegador nem usado em Server
 * Components que renderizam UI para o cliente.
 *
 * Usa `@supabase/supabase-js` diretamente (sem `@supabase/ssr`) porque não
 * lida com cookies de sessão: o service_role autentica via chave secreta, não
 * via cookie de navegador.
 *
 * Requer `SUPABASE_SERVICE_ROLE_KEY` no ambiente. Se a variável estiver
 * ausente, `createClient()` lança erro antes de qualquer operação, evitando
 * que o endpoint de expiração seja executado sem credencial de serviço.
 */
export async function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL não definida. O cliente de serviço requer a URL do Supabase.",
    );
  }

  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não definida. O cliente de serviço requer a chave de service_role.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
