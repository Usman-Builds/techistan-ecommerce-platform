# 14 — Storefront UI (Customer-Facing Pages)

**Goal:** Build the polished, accessible, responsive customer storefront on top of the APIs from earlier scripts. All pages use the theme system (dark/light), Shadcn components, and Framer Motion for subtle transitions. SRD §8.1.

**Prerequisites:** Scripts `02` (theme), `04` (auth), `07`–`13` (catalog, search, cart, checkout, orders, reviews).

---

## Pages & components

### 1. Global storefront shell
- Header: logo (from StoreSetting), primary nav (category mega-menu), search bar (autocomplete from script `08`), cart icon (opens `CartDrawer`), account menu, **ThemeToggle**.
- Footer: links, newsletter signup, socials, payment badges.
- Mobile-first responsive (320px–2560px — NFR-506).

### 2. Home (`/`)
- Hero banner, featured products grid, category highlights, newsletter signup. Data-driven from Active products + settings.

### 3. Category / Collection (`/c/[...slug]`)
- Product grid + sidebar **faceted filters** (category, price, brand, rating, availability), sort controls, pagination or infinite scroll. SSR for SEO (NFR-701).

### 4. Product Detail (`/p/[slug]`)
- Image gallery with zoom, variant selector (respects stock), price/compare-at + sale badge, add-to-cart / wishlist, description, **Reviews tab** (script `13`), related products, JSON-LD Product (script `17`). SSR.

### 5. Search Results (`/search`)
- Query bar, result count, filters, highlighted matches, sort.

### 6. Cart (`/cart`) + `CartDrawer`
- Line items, quantity adjusters, coupon input with feedback, estimated totals, proceed-to-checkout CTA. (Wire the functional cart from script `09`.)

### 7. Checkout (`/checkout`)
- Finalize the multi-step UI from script `10` with the order-summary sidebar.

### 8. Order Confirmation (`/checkout/confirmation/[orderNumber]`)
- Thank-you, order summary, estimated delivery, continue-shopping CTA.

### 9. Account Dashboard (`/account/**`)
- Profile settings (name, email, phone, avatar via Cloudinary), addresses (max 10, default), order history + detail (script `11`), wishlist, saved payment methods (tokenized display only), in-app notifications (script `16`).

### 10. Auth pages
- Login/Register (from script `04`) styled to brand: social OAuth button, password strength meter.

---

## Cross-cutting requirements
- **Accessibility (NFR-501–506)**: semantic HTML, ARIA landmarks, full keyboard nav, visible focus, contrast ≥ 4.5:1, alt text on all images.
- **Loading/empty/error states** for every data view (skeletons, friendly empties, error boundaries — NFR-304).
- **Animations**: Framer Motion, ≤300ms, respect `prefers-reduced-motion`.
- **Performance**: `next/image` (Cloudinary loader), lazy loading, streaming/Suspense, minimal client JS (Server Components by default). Target Core Web Vitals (NFR-101–108).
- Remove the temporary `/theme-preview` page (or gate to dev).

---

## Acceptance criteria
- [ ] All SRD §8.1 pages exist, responsive from 320px to 2560px, in both dark + light.
- [ ] A shopper can browse → filter → open a product → add to cart → checkout → see confirmation.
- [ ] Keyboard-only navigation works across key flows; automated a11y check (axe) passes on major pages.
- [ ] Every list has loading, empty, and error states.
- [ ] Lighthouse Performance ≥ 90 on home + PDP (dev target; verify in script `18`).
