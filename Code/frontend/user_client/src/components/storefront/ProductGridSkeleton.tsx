/**
 * Loading skeleton mirroring the {@link ProductGrid} layout (script 14). Used by
 * `loading.tsx` boundaries and Suspense fallbacks for catalog views.
 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="flex flex-col gap-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
