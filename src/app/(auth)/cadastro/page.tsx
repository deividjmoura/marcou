import { SignupForm } from "../forms";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <h1>Criar conta</h1>
        <SupabaseConfigWarning />
      </div>
    );
  }

  return <SignupForm next={params.next} />;
}
