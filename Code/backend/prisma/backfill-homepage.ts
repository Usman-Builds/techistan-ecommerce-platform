/**
 * Add the script-19 homepage blocks to a store that was already configured.
 *
 * `HomepageService.seedDefaults` is deliberately all-or-nothing: it writes the
 * whole default layout, and only for a store with no sections at all. That is
 * the right behaviour for a seed (an admin who deletes a rail must not find it
 * resurrected on the next deploy), but it leaves every existing store stuck on
 * whatever layout it was seeded with — the new block TYPES would never appear.
 *
 * So this script is the migration path, and it is deliberately conservative:
 *
 *  - it INSERTS the new blocks and nothing else is deleted;
 *  - it skips any block type the store already has a row for, so running it
 *    twice changes nothing the second time;
 *  - it inserts each new block at a chosen position and renumbers around it,
 *    so the result is the intended reading order rather than five new blocks
 *    dumped at the bottom of the page;
 *  - the one EDIT it makes is promoting an existing CATEGORY_RAIL to a
 *    CATEGORY_GRID. That is a change the builder itself supports (a section's
 *    type is patchable precisely so a rail can become a grid), it keeps the
 *    section's own heading, link and position, and it is one click to undo. The
 *    alternative — inserting a grid and leaving the rail — would give the store
 *    two category blocks saying the same thing.
 *
 * Run with `npm run backfill:homepage`. It is safe on a store that has already
 * been customised, and safe to skip entirely — a store with none of these rows
 * simply keeps the homepage it has.
 */
import { HomeSectionType, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Where a new block goes, relative to the blocks the store already has.
 *
 * Anchoring to a NEIGHBOUR rather than to a hard-coded sortOrder is what makes
 * this work on a store someone has rearranged: a merchant who moved their deals
 * rail still gets the spotlight beside their featured rail, not stranded in the
 * middle of an arrangement it was never designed for.
 *
 * `occurrence` matters because PRODUCT_RAIL appears several times: the
 * spotlight belongs after the FIRST rail (breaking it from the next one), while
 * the best-sellers rail belongs after the LAST (joining the run of rails).
 * An anchor whose type is absent falls through to the end of the page.
 */
type Anchor =
  | { after: HomeSectionType; occurrence: 'first' | 'last' }
  | { before: HomeSectionType }
  | 'end';

type Addition = {
  at: Anchor;
  data: Omit<
    Prisma.HomepageSectionCreateManyInput,
    'id' | 'createdAt' | 'updatedAt' | 'sortOrder'
  >;
};

const ADDITIONS: Addition[] = [
  {
    at: { after: HomeSectionType.PRODUCT_RAIL, occurrence: 'first' },
    data: {
      type: HomeSectionType.SPOTLIGHT,
      eyebrow: 'In the spotlight',
      enabled: true,
      config: { secondaryLabel: 'See all featured', secondaryHref: '/search' },
    },
  },
  {
    at: { after: HomeSectionType.PROMO_TILES, occurrence: 'last' },
    data: {
      type: HomeSectionType.BRAND_STRIP,
      eyebrow: 'Stocked here',
      title: 'The brands we carry',
      enabled: true,
      config: { limit: 12 },
    },
  },
  {
    at: { after: HomeSectionType.PRODUCT_RAIL, occurrence: 'last' },
    data: {
      type: HomeSectionType.PRODUCT_RAIL,
      eyebrow: 'Popular right now',
      title: "What everyone's buying",
      href: '/search?sort=best_selling',
      enabled: true,
      config: { source: 'BEST_SELLING', limit: 12, icon: 'Flame' },
    },
  },
  {
    // Proof, then reassurance, then the one ask. The newsletter stays last.
    at: { before: HomeSectionType.NEWSLETTER },
    data: {
      type: HomeSectionType.TESTIMONIALS,
      eyebrow: 'Owner reviews',
      title: 'What people say after living with it',
      href: '/search?sort=top_rated',
      linkLabel: 'Top rated',
      enabled: true,
      config: { limit: 6 },
    },
  },
  {
    at: { before: HomeSectionType.NEWSLETTER },
    data: {
      type: HomeSectionType.FAQ,
      eyebrow: 'Before you buy',
      title: 'Questions, answered',
      enabled: true,
    },
  },
];

type Row = { id: string; type: HomeSectionType; sortOrder: number };

async function main() {
  await promoteCategoryRail();

  const existing: Row[] = await prisma.homepageSection.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, type: true, sortOrder: true },
  });

  if (existing.length === 0) {
    console.log(
      'No homepage sections — nothing to backfill. This store gets the full ' +
        'default layout the first time the builder seeds it.',
    );
    return;
  }

  const toAdd = ADDITIONS.filter((a) =>
    a.data.type !== HomeSectionType.PRODUCT_RAIL
      ? !existing.some((row) => row.type === a.data.type)
      : true,
  );

  // A BEST_SELLING rail is a PRODUCT_RAIL like every other rail, so the type
  // alone cannot tell it from the featured one. Its source has to be checked.
  const rails = await prisma.homepageSection.findMany({
    where: { type: HomeSectionType.PRODUCT_RAIL },
    select: { config: true },
  });
  const hasBestSelling = rails.some(
    (r) => configValue(r.config, 'source') === 'BEST_SELLING',
  );

  const additions = toAdd.filter(
    (a) => a.data.type !== HomeSectionType.PRODUCT_RAIL || !hasBestSelling,
  );

  if (additions.length === 0) {
    console.log('Every script-19 block is already present. Nothing to do.');
    return;
  }

  // Build the intended order as a plain list of "keep this row" / "insert this
  // block" entries, then renumber the whole thing in one pass. Far easier to
  // reason about — and to read back — than computing fractional sort orders.
  const plan: ({ keep: Row } | { insert: Addition })[] = [];
  const placed = new Set<Addition>();

  for (const row of existing) {
    for (const addition of additions) {
      if (
        !placed.has(addition) &&
        anchorMatches(addition.at, row, existing, 'before')
      ) {
        plan.push({ insert: addition });
        placed.add(addition);
      }
    }
    plan.push({ keep: row });
    for (const addition of additions) {
      if (
        !placed.has(addition) &&
        anchorMatches(addition.at, row, existing, 'after')
      ) {
        plan.push({ insert: addition });
        placed.add(addition);
      }
    }
  }

  // Anything whose anchor type does not exist on this store goes at the end.
  for (const addition of additions) {
    if (!placed.has(addition)) plan.push({ insert: addition });
  }

  await prisma.$transaction(async (tx) => {
    let sortOrder = 0;
    for (const entry of plan) {
      if ('keep' in entry) {
        await tx.homepageSection.update({
          where: { id: entry.keep.id },
          data: { sortOrder },
        });
      } else {
        await tx.homepageSection.create({
          data: {
            ...entry.insert.data,
            sortOrder,
            config: (entry.insert.data.config ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      sortOrder += 1;
    }
  });

  console.log(
    `Added ${additions.length} block(s): ${additions
      .map((a) => a.data.title ?? a.data.type)
      .join(', ')}`,
  );
}

/** Is `row` the position this anchor names, on the given side of it? */
function anchorMatches(
  anchor: Anchor,
  row: Row,
  all: Row[],
  side: 'before' | 'after',
): boolean {
  if (anchor === 'end') return false;

  if ('before' in anchor) {
    if (side !== 'before' || row.type !== anchor.before) return false;
    // The FIRST row of that type — inserting before every one of them would
    // scatter copies through the page.
    return !all.some((o) => o.type === row.type && o.sortOrder < row.sortOrder);
  }

  if (side !== 'after' || row.type !== anchor.after) return false;
  return anchor.occurrence === 'first'
    ? !all.some((o) => o.type === row.type && o.sortOrder < row.sortOrder)
    : !all.some((o) => o.type === row.type && o.sortOrder > row.sortOrder);
}

/** Read one key out of a section's loosely-typed JSON config. */
function configValue(config: Prisma.JsonValue, key: string): unknown {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return undefined;
  }
  return (config as Record<string, unknown>)[key];
}

/**
 * Turn the store's first category rail into the mosaic, unless it already has a
 * grid (in which case the rail is a second, deliberate block and stays).
 */
async function promoteCategoryRail() {
  const hasGrid = await prisma.homepageSection.count({
    where: { type: HomeSectionType.CATEGORY_GRID },
  });
  if (hasGrid > 0) return;

  const rail = await prisma.homepageSection.findFirst({
    where: { type: HomeSectionType.CATEGORY_RAIL },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!rail) return;

  const config =
    typeof rail.config === 'object' &&
    rail.config !== null &&
    !Array.isArray(rail.config)
      ? (rail.config as Record<string, unknown>)
      : {};

  await prisma.homepageSection.update({
    where: { id: rail.id },
    data: {
      type: HomeSectionType.CATEGORY_GRID,
      subtitle:
        rail.subtitle ??
        'Every collection in the store, from flagship laptops to the cable you forgot to buy.',
      // Nine tiles is the count that fills the mosaic without a hole at 2, 3 or
      // 4 columns; a rail's twelve would leave three gaps.
      config: { ...config, limit: 9 } as Prisma.InputJsonValue,
    },
  });

  console.log('Promoted the category rail to a category grid.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
