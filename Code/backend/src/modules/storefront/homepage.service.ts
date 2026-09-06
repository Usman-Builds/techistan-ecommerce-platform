import { Injectable, NotFoundException } from '@nestjs/common';
import { HomeSectionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateHeroSlideDto,
  CreateHomepageSectionDto,
  ReorderDto,
  UpdateHeroSlideDto,
  UpdateHomepageSectionDto,
} from './dto/homepage.dto';

/**
 * The homepage layout an unconfigured store gets.
 *
 * It is a SEED, not a fallback — once rows exist, this constant is never
 * consulted again, so an admin who deletes a section does not find it
 * resurrected on the next deploy. "Reset to default" is the one way back.
 *
 * The ordering is deliberate rather than a list of every block we have. A run
 * of product rails reads as one long rail, so the editorial blocks are
 * interleaved between them: the spotlight breaks the featured rail from the
 * deals rail, the promo tiles break deals from new arrivals, the brand strip
 * breaks new arrivals from best-sellers, and the page closes on proof
 * (reviews), reassurance (FAQ) and the one ask (newsletter).
 *
 * Five rails and three separators cannot alternate perfectly, so one adjacent
 * pair remains — best-sellers and the value rail, which are the two least alike
 * and the furthest down the page.
 *
 * TRUST_BAR is deliberately NOT here. The shipping/warranty/returns/support
 * strip repeated what the footer and the FAQ already say, directly under the
 * hero where the store has one chance to show product. The block type still
 * exists and can be added back from the builder — it is just not what a new
 * store should lead with.
 */
const DEFAULT_SECTIONS: Omit<
  Prisma.HomepageSectionCreateManyInput,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  { type: HomeSectionType.HERO, sortOrder: 0, enabled: true },
  {
    type: HomeSectionType.CATEGORY_GRID,
    eyebrow: 'Browse the store',
    title: 'Shop by category',
    subtitle:
      'Nineteen collections, from flagship laptops to the cable you forgot to buy.',
    href: '/search',
    linkLabel: 'All categories',
    sortOrder: 1,
    enabled: true,
    // A ceiling, not a target: nine fills the storefront's mosaic exactly, and
    // the grid re-flows for a store with fewer top-level categories.
    config: { limit: 9 },
  },
  {
    type: HomeSectionType.PRODUCT_RAIL,
    eyebrow: 'Hand-picked',
    title: 'Featured this week',
    href: '/search',
    sortOrder: 2,
    enabled: true,
    config: { source: 'FEATURED', limit: 12, icon: 'Star' },
  },
  {
    type: HomeSectionType.SPOTLIGHT,
    eyebrow: 'In the spotlight',
    sortOrder: 3,
    enabled: true,
    config: { secondaryLabel: 'See all featured', secondaryHref: '/search' },
  },
  {
    type: HomeSectionType.PRODUCT_RAIL,
    eyebrow: 'Limited time',
    title: 'Deals worth grabbing',
    href: '/deals',
    linkLabel: 'All deals',
    sortOrder: 4,
    enabled: true,
    config: { source: 'ON_SALE', limit: 12, icon: 'BadgePercent' },
  },
  {
    type: HomeSectionType.PROMO_TILES,
    sortOrder: 5,
    enabled: true,
    config: { limit: 3 },
  },
  {
    type: HomeSectionType.PRODUCT_RAIL,
    eyebrow: 'Fresh in',
    title: 'New arrivals',
    href: '/search?sort=newest',
    sortOrder: 6,
    enabled: true,
    config: { source: 'NEWEST', limit: 12, icon: 'Sparkles' },
  },
  {
    type: HomeSectionType.BRAND_STRIP,
    eyebrow: 'Stocked here',
    title: 'The brands we carry',
    sortOrder: 7,
    enabled: true,
    config: { limit: 12 },
  },
  {
    type: HomeSectionType.PRODUCT_RAIL,
    eyebrow: 'Popular right now',
    title: "What everyone's buying",
    href: '/search?sort=best_selling',
    sortOrder: 8,
    enabled: true,
    config: { source: 'BEST_SELLING', limit: 12, icon: 'Flame' },
  },
  {
    type: HomeSectionType.PRODUCT_RAIL,
    eyebrow: 'Under $100',
    title: 'Big upgrades, small spend',
    href: '/search?maxPrice=10000&sort=price_asc',
    sortOrder: 9,
    enabled: true,
    config: {
      source: 'PRICE_UNDER',
      maxPrice: 10000,
      limit: 12,
      icon: 'Wallet',
    },
  },
  {
    type: HomeSectionType.TESTIMONIALS,
    eyebrow: 'Owner reviews',
    title: 'What people say after living with it',
    href: '/search?sort=top_rated',
    linkLabel: 'Top rated',
    sortOrder: 10,
    enabled: true,
    config: { limit: 6 },
  },
  {
    type: HomeSectionType.FAQ,
    eyebrow: 'Before you buy',
    title: 'Questions, answered',
    sortOrder: 11,
    enabled: true,
  },
  {
    type: HomeSectionType.NEWSLETTER,
    eyebrow: 'Drops & deals',
    title: 'Be first to the good stuff',
    subtitle:
      'New arrivals and subscriber-only offers, straight to your inbox. No spam, unsubscribe anytime.',
    sortOrder: 12,
    enabled: true,
  },
];
/**
 * Homepage composition (script 18).
 *
 * The storefront homepage was previously a fixed sequence of components in
 * `page.tsx`: changing the order, retiring a rail, or running a seasonal hero
 * meant a code change and a deploy. This service turns that sequence into rows
 * an admin can order, toggle and schedule.
 */
@Injectable()
export class HomepageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Public read ───────────────────────────

  /**
   * The live homepage: enabled sections in order, plus the hero slides that are
   * enabled AND inside their scheduling window.
   *
   * Returns `configured: false` when no rows exist at all, which is how the
   * storefront tells "this store has an empty homepage" (render the built-in
   * default) apart from "this store has deliberately disabled everything"
   * (render nothing).
   */
  async getPublicHomepage() {
    const now = new Date();
    const [sections, slides] = await this.prisma.$transaction([
      this.prisma.homepageSection.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.heroSlide.findMany({
        where: {
          enabled: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const totalSections = await this.prisma.homepageSection.count();
    return { configured: totalSections > 0, sections, slides };
  }

  // ─────────────────────────── Admin reads ───────────────────────────

  /** Every section and slide, including disabled ones, for the builder. */
  async getAdminHomepage() {
    const [sections, slides] = await this.prisma.$transaction([
      this.prisma.homepageSection.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.heroSlide.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return { sections, slides };
  }

  // ─────────────────────────── Sections ───────────────────────────

  async createSection(dto: CreateHomepageSectionDto, actorId?: number) {
    // A new block belongs at the bottom unless told otherwise; asking the admin
    // for a sort order before they have seen the page is backwards.
    const sortOrder = dto.sortOrder ?? (await this.nextSectionOrder());
    const section = await this.prisma.homepageSection.create({
      data: {
        type: dto.type,
        eyebrow: dto.eyebrow ?? null,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        href: dto.href ?? null,
        linkLabel: dto.linkLabel ?? null,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        sortOrder,
        enabled: dto.enabled ?? true,
      },
    });
    await this.audit.record({
      actorId,
      action: 'homepage.section.create',
      entityType: 'HomepageSection',
      entityId: section.id,
      metadata: { type: section.type },
    });
    return section;
  }

  async updateSection(
    id: string,
    dto: UpdateHomepageSectionDto,
    actorId?: number,
  ) {
    await this.getSection(id);
    const data: Prisma.HomepageSectionUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.eyebrow !== undefined) data.eyebrow = dto.eyebrow;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle;
    if (dto.href !== undefined) data.href = dto.href;
    if (dto.linkLabel !== undefined) data.linkLabel = dto.linkLabel;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.config !== undefined) {
      // Replaced, not merged: the builder always submits the whole config it is
      // showing, so a merge would make clearing a key impossible.
      data.config =
        dto.config === null
          ? Prisma.JsonNull
          : (dto.config as Prisma.InputJsonValue);
    }

    const section = await this.prisma.homepageSection.update({
      where: { id },
      data,
    });
    await this.audit.record({
      actorId,
      action: 'homepage.section.update',
      entityType: 'HomepageSection',
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return section;
  }

  async deleteSection(id: string, actorId?: number) {
    await this.getSection(id);
    await this.prisma.homepageSection.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'homepage.section.delete',
      entityType: 'HomepageSection',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async reorderSections(dto: ReorderDto, actorId?: number) {
    if (dto.items.length === 0) return { updated: 0 };
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.homepageSection.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    await this.audit.record({
      actorId,
      action: 'homepage.section.reorder',
      entityType: 'HomepageSection',
      entityId: 'batch',
      metadata: { count: dto.items.length },
    });
    return { updated: dto.items.length };
  }

  // ─────────────────────────── Hero slides ───────────────────────────

  async createSlide(dto: CreateHeroSlideDto, actorId?: number) {
    const sortOrder = dto.sortOrder ?? (await this.nextSlideOrder());
    const slide = await this.prisma.heroSlide.create({
      data: {
        eyebrow: dto.eyebrow ?? null,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        ctaHref: dto.ctaHref ?? null,
        imageId: dto.imageId ?? null,
        imageUrl: dto.imageUrl ?? null,
        sortOrder,
        enabled: dto.enabled ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.audit.record({
      actorId,
      action: 'homepage.slide.create',
      entityType: 'HeroSlide',
      entityId: slide.id,
      metadata: { title: slide.title },
    });
    return slide;
  }

  async updateSlide(id: string, dto: UpdateHeroSlideDto, actorId?: number) {
    await this.getSlide(id);
    const data: Prisma.HeroSlideUpdateInput = {};
    if (dto.eyebrow !== undefined) data.eyebrow = dto.eyebrow;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle;
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel;
    if (dto.ctaHref !== undefined) data.ctaHref = dto.ctaHref;
    if (dto.imageId !== undefined) data.imageId = dto.imageId;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.startsAt !== undefined) {
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    }
    if (dto.endsAt !== undefined) {
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }

    const slide = await this.prisma.heroSlide.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'homepage.slide.update',
      entityType: 'HeroSlide',
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return slide;
  }

  async deleteSlide(id: string, actorId?: number) {
    await this.getSlide(id);
    await this.prisma.heroSlide.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'homepage.slide.delete',
      entityType: 'HeroSlide',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async reorderSlides(dto: ReorderDto, actorId?: number) {
    if (dto.items.length === 0) return { updated: 0 };
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.heroSlide.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    await this.audit.record({
      actorId,
      action: 'homepage.slide.reorder',
      entityType: 'HeroSlide',
      entityId: 'batch',
      metadata: { count: dto.items.length },
    });
    return { updated: dto.items.length };
  }

  // ─────────────────────────── Seeding ───────────────────────────

  /**
   * Write the default layout, and hero slides drawn from the store's own
   * categories.
   *
   * `replace` clears the existing layout first — that is the "reset to default"
   * button. Without it the call is a no-op when sections already exist, so an
   * accidental second press can never duplicate the whole page.
   */
  async seedDefaults(replace: boolean, actorId?: number) {
    const existing = await this.prisma.homepageSection.count();
    if (existing > 0 && !replace) {
      return { seeded: false, reason: 'already-configured' as const };
    }

    // Hero slides are built from real categories: a hero over stock artwork the
    // store does not sell is worse than no hero.
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, parentId: null, imageUrl: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 3,
      select: { name: true, slug: true, imageId: true, imageUrl: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.homepageSection.deleteMany({});
        await tx.heroSlide.deleteMany({});
      }
      await tx.homepageSection.createMany({
        data: DEFAULT_SECTIONS.map((section) => ({
          ...section,
          config: (section.config ?? {}) as Prisma.InputJsonValue,
        })),
      });
      if (categories.length > 0) {
        await tx.heroSlide.createMany({
          data: categories.map((c, i) => ({
            eyebrow: c.name,
            title: `${c.name}, properly specced`,
            subtitle: `Explore the full ${c.name.toLowerCase()} range — filtered by price, rating and what is actually in stock.`,
            ctaLabel: `Browse ${c.name}`,
            ctaHref: `/c/${c.slug}`,
            imageId: c.imageId,
            imageUrl: c.imageUrl,
            sortOrder: i,
            enabled: true,
          })),
        });
      }
    });

    await this.audit.record({
      actorId,
      action: replace ? 'homepage.reset' : 'homepage.seed',
      entityType: 'HomepageSection',
      entityId: 'batch',
      metadata: {
        sections: DEFAULT_SECTIONS.length,
        slides: categories.length,
      },
    });

    return {
      seeded: true,
      sections: DEFAULT_SECTIONS.length,
      slides: categories.length,
    };
  }

  // ─────────────────────────── Internals ───────────────────────────

  private async getSection(id: string) {
    const section = await this.prisma.homepageSection.findUnique({
      where: { id },
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  private async getSlide(id: string) {
    const slide = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!slide) throw new NotFoundException('Slide not found');
    return slide;
  }

  private async nextSectionOrder(): Promise<number> {
    const last = await this.prisma.homepageSection.aggregate({
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  private async nextSlideOrder(): Promise<number> {
    const last = await this.prisma.heroSlide.aggregate({
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }
}
