import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <Link href="/" className="brand brand-logo" aria-label="Marcou, início">
        <img src="/branding/marcou-logo.svg" alt="Marcou." />
      </Link>
      {children}
    </main>
  );
}
