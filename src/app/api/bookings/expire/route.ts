import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { markPrivateNoStore } from "@/lib/http";

/**
 * Endpoint de expiração automática de reservas vencidas.
 *
 * Destinado a ser invocado por um scheduler externo (cron do Netlify, GitHub
 * Actions schedule, ou outro mecanismo de platform). Não está vinculado a
 * nenhuma rota de navegação do Marcou e não renderiza UI.
 *
 * Segurança:
 * - Exige `BOOKING_EXPIRATION_SECRET` definida no ambiente. Se ausente, todas
 *   as requisições são rejeitadas (fail-safe).
 * - Valida o segredo via header `Authorization: Bearer <secret>`.
 * - Executa `expire_stale_bookings()` com `service_role`, que só aceita
 *   chamadas de serviço.
 * - Resposta sem PII, tokens ou dados de reservas: apenas a contagem de
 *   linhas expiradas.
 * - Cabeçalhos `private, no-store` para impedir cache por CDN/proxy.
 */
export async function POST(request: Request) {
  const secret = process.env.BOOKING_EXPIRATION_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "Expiração não configurada no ambiente." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (authHeader !== expected) {
    return NextResponse.json(
      { error: "Não autorizado." },
      { status: 401 },
    );
  }

  let supabase;
  try {
    supabase = await createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Cliente de serviço não disponível." },
      { status: 503 },
    );
  }

  const { data: expiredCount, error } = await supabase.rpc(
    "expire_stale_bookings",
  );

  if (error) {
    return NextResponse.json(
      { error: "Falha ao expirar reservas." },
      { status: 500 },
    );
  }

  return markPrivateNoStore(
    NextResponse.json({ expired_count: Number(expiredCount ?? 0) }),
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Método não permitido. Use POST." },
    { status: 405 },
  );
}
