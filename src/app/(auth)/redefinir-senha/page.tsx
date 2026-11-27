import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { ResetPasswordForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <h1>Definir nova senha</h1>
        <SupabaseConfigWarning />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/esqueci-senha");
  }

  return <ResetPasswordForm />;
}
