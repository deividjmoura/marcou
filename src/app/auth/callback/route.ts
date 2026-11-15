import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/painel";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Não foi possível concluir o login.")}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
