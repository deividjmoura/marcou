import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/identity";
import { ProfileForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect(`/login?next=${encodeURIComponent("/perfil")}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const metadataName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    "";

  return (
    <ProfileForm
      name={profile?.display_name ?? (typeof metadataName === "string" ? metadataName : "")}
      phone={profile?.phone ?? ""}
      next={next}
    />
  );
}
