import { createClient } from "@/lib/supabase/server";

export type AccountMode = "customer" | "provider";

/** Reads only the caller's effective navigation preference through an RPC that
 * derives auth.uid() and provider ownership inside PostgreSQL. */
export async function getPreferredMode(): Promise<AccountMode> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_preferred_mode");
    if (error || data !== "provider") return "customer";
    return "provider";
  } catch {
    return "customer";
  }
}
