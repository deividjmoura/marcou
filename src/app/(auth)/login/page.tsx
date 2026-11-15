import { LoginForm } from "../forms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return <LoginForm next={params.next} />;
}
