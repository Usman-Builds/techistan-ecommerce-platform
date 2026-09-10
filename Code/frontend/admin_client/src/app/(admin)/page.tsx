import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = { title: "Dashboard · Techistan Admin" };

/**
 * Admin dashboard (script 15, FR-801). The (admin) layout already guaranteed an
 * authenticated admin; the KPIs/charts/alerts are rendered client-side against
 * the role-guarded analytics endpoints via TanStack Query.
 */
export default function DashboardPage() {
  return <DashboardView />;
}
