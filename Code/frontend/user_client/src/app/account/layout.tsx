import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server";

/**
 * Authoritative gate for /account/**. `proxy.ts` already bounced cookie-less
 * requests; here we do the real server-side identity check via /auth/me so an
 * expired or forged cookie can't reach protected content.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/account");

  return <>{children}</>;
}
