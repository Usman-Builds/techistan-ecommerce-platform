import Link from "next/link";

/**
 * Centered shell for the storefront auth pages. The `(auth)` folder is a route
 * group — it does not affect the URL (pages live at /login, /register, etc.).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 block text-center font-heading text-2xl font-bold text-foreground"
        >
          Techistan
        </Link>
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
