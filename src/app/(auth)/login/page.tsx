import { LoginForm } from "../forms";
import { safeLoginErrorMessage } from "@/lib/identity";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; passwordUpdated?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <h1>Entrar no Marcou</h1>
        <SupabaseConfigWarning />
      </div>
    );
  }

  return (
    <LoginForm
      next={params.next}
      errorMessage={safeLoginErrorMessage(params.error)}
      successMessage={
        params.passwordUpdated === "1"
          ? "Senha atualizada com sucesso. Entre com sua nova senha."
          : undefined
      }
    />
  );
}
