import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <Link href="/" className="brand" aria-label="Marcou, início">
        marcou<span>.</span>
      </Link>
      {children}
    </main>
  );
}
