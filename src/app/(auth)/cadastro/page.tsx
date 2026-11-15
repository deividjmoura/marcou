import { SignupForm } from "../forms";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return <SignupForm next={params.next} />;
}
