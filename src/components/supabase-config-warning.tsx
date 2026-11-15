import { isSupabaseConfigured } from "@/lib/env";

/**
 * Aviso exibido quando o Supabase não está configurado no ambiente. As páginas
 * que dependam do banco devem verificar `isSupabaseConfigured` antes de
 * consultar dados para não quebrar a renderização.
 */
export function SupabaseConfigWarning() {
  if (isSupabaseConfigured()) return null;

  return (
    <p className="alert alert-warning">
      O Supabase não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no ambiente para habilitar login e
      agendamentos.
    </p>
  );
}
