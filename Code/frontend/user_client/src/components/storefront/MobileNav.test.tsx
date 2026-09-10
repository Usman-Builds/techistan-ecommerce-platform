import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NavNode } from "@/lib/api/storefront";

// The drawer only needs to know whether someone is signed in, and the real
// provider pulls in the whole auth stack. Stubbed to keep this spec about
// layout.
//
// Mocked by RELATIVE path. The component imports this through the `@/` alias,
// but `vi.mock` does not resolve alias specifiers through vite-tsconfig-paths,
// so an aliased mock id silently never matches the module actually loaded.
vi.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: false, logout: vi.fn() }),
}));

import { MobileNav } from "./MobileNav";

const node = (id: string, label: string, href: string): NavNode => ({
  id,
  label,
  href,
  icon: null,
  badge: null,
  newTab: false,
  categorySlug: null,
  categoryImageUrl: null,
  children: [],
});

const ITEMS = [
  node("1", "Audio", "/c/audio"),
  node("2", "Gaming", "/c/gaming"),
];

/**
 * The drawer's ONE structural requirement, and the reason it regressed.
 *
 * `MobileNav` renders inside `<header>`, which carries `backdrop-blur`. An
 * ancestor with a `backdrop-filter` becomes the containing block for its
 * `position: fixed` descendants, so an in-tree drawer's `inset-0` resolved to
 * the header's ~64px band instead of the viewport — it "opened" as a sliver.
 *
 * jsdom implements no layout, so no assertion here can measure that. What it
 * CAN prove is the property that fixes it: the overlay must not be a descendant
 * of the element that rendered it. That is the invariant worth locking down,
 * because the tempting "simplification" is to inline the portal away.
 */
describe("MobileNav", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("renders no dialog until the hamburger is pressed", () => {
    render(<MobileNav items={ITEMS} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("portals the open drawer OUT of its own subtree", async () => {
    // A stand-in for the blurred <header>: whatever wrapper this component is
    // placed in must not end up containing the overlay.
    const { container } = render(
      <header data-testid="chrome">
        <MobileNav items={ITEMS} />
      </header>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toBeInTheDocument();
    // The assertion that matters: it escaped the header.
    expect(container.querySelector("header")?.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("shows the navigation it was given once open", async () => {
    render(<MobileNav items={ITEMS} />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("link", { name: /Audio/ })).toHaveAttribute(
      "href",
      "/c/audio",
    );
    expect(screen.getByRole("link", { name: /Gaming/ })).toBeInTheDocument();
  });

  it("locks the page behind the drawer and releases it on close", async () => {
    render(<MobileNav items={ITEMS} />);

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("closes when a destination is chosen", async () => {
    render(<MobileNav items={ITEMS} />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    await userEvent.click(screen.getByRole("link", { name: /Audio/ }));
    expect(document.body.style.overflow).toBe("");
  });
});
