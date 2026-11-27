import { ForgotPasswordForm } from "../forms";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export default function EsqueciSenhaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <h1>Recuperar senha</h1>
        <SupabaseConfigWarning />
      </div>
    );
  }

  return <ForgotPasswordForm />;
}
