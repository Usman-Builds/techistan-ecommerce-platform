import { writeFileSync } from "fs";
import { join } from "path";

/**
 * E2E global setup. The backend must be migrated + seeded (a demo catalog + the
 * preseeded admin) BEFORE the browsers run — see e2e/README.md. Rather than
 * duplicate seeding here, we assert the storefront API is reachable and has at
 * least one ACTIVE product, then stash its slug for the specs to open. Failing
 * fast with a clear remedy beats a wall of confusing selector errors mid-run.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:3000";

async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 60_000;
  let products: { slug: string }[] = [];

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/products?limit=1`);
      if (res.ok) {
        const body = (await res.json()) as { items?: { slug: string }[] };
        products = body.items ?? [];
        if (products.length > 0) break;
      }
    } catch {
      // backend not up yet — webServer is still starting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (products.length === 0) {
    throw new Error(
      `E2E setup: no ACTIVE product found at ${API}/products. ` +
        "Seed the backend first: `npm run seed` (catalog) + `npm run seed:admin` (admin). " +
        "See e2e/README.md.",
    );
  }

  writeFileSync(
    join(__dirname, ".e2e-state.json"),
    JSON.stringify({ productSlug: products[0].slug }, null, 2),
  );
}

export default globalSetup;
