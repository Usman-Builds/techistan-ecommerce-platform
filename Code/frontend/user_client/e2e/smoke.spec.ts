import { test, expect, seededProductSlug } from "./fixtures";

/**
 * SSR + SEO smoke (script 17 output, validated in a real browser since async
 * Server Components can't be unit-tested). Cheap, dependency-light — a good
 * first gate that the storefront actually renders server-side.
 */
test.describe("storefront SSR + SEO", () => {
  test("home renders server-side with a title and Organization JSON-LD", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    const ld = page.locator('script[type="application/ld+json"]');
    await expect(ld.first()).toBeAttached();
    const blob = (await ld.allTextContents()).join(" ");
    expect(blob).toMatch(/"@type"\s*:\s*"Organization"/);
  });

  test("robots.txt and sitemap.xml are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toMatch(/User-Agent/i);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("a product page emits Product + BreadcrumbList JSON-LD", async ({ page }) => {
    await page.goto(`/products/${seededProductSlug()}`);
    const blob = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).join(" ");
    expect(blob).toMatch(/"@type"\s*:\s*"Product"/);
    expect(blob).toMatch(/"@type"\s*:\s*"BreadcrumbList"/);
  });
});
