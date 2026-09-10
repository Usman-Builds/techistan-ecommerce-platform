import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Rendered when the PDP's `getProductBySlugServer` returns null (unknown slug or
 * a non-ACTIVE product) and calls `notFound()`.
 */
export default function ProductNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="font-heading text-2xl font-bold">Product not found</h1>
      <p className="text-sm text-muted-foreground">
        The product you&apos;re looking for doesn&apos;t exist or is no longer
        available.
      </p>
      <Link
        href="/search"
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Browse products
      </Link>
    </div>
  );
}
