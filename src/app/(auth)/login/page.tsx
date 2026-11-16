import { LoginForm } from "../forms";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
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

  return <LoginForm next={params.next} errorMessage={params.error} />;
}
