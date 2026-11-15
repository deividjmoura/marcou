import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/identity";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Não%20foi%20possível%20concluir%20a%20autenticação.", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=Não%20foi%20possível%20concluir%20a%20autenticação.", origin),
    );
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const displayName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const profileRow: { id: string; display_name?: string } = { id: user.id };
  if (typeof displayName === "string" && displayName.trim()) {
    profileRow.display_name = displayName.trim().slice(0, 80);
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(profileRow, { onConflict: "id" })
    .select("phone")
    .single();

  if (profileError) {
    return NextResponse.redirect(new URL("/login?error=Não%20foi%20possível%20carregar%20seu%20perfil.", origin));
  }

  const destination = profile.phone ? next : `/perfil?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(destination, origin));
}
