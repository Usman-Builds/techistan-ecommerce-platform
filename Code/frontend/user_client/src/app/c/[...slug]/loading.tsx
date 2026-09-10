import { ProductGridSkeleton } from "@/components/storefront/ProductGridSkeleton";

/** Category listing loading skeleton (breadcrumb + toolbar + grid). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
      <ProductGridSkeleton count={12} />
    </div>
  );
}
