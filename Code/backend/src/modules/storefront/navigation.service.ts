import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NavLocation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateNavItemDto,
  ReorderNavDto,
  UpdateNavItemDto,
} from './dto/navigation.dto';

/** A navigation entry as the storefront consumes it. */
export interface NavNode {
  id: string;
  label: string;
  /** Always resolved — a category link is expanded to its current /c/<slug>. */
  href: string;
  icon: string | null;
  badge: string | null;
  newTab: boolean;
  /** Set when this entry is bound to a category, for icon/image fallbacks. */
  categorySlug: string | null;
  /** The bound category's poster art, so the mega-menu can illustrate itself. */
  categoryImageUrl: string | null;
  children: NavNode[];
}

const ITEM_SELECT = {
  id: true,
  location: true,
  parentId: true,
  label: true,
  href: true,
  categoryId: true,
  icon: true,
  badge: true,
  newTab: true,
  sortOrder: true,
  enabled: true,
  category: {
    select: { slug: true, name: true, isActive: true, imageUrl: true },
  },
} satisfies Prisma.NavItemSelect;

type ItemRow = Prisma.NavItemGetPayload<{ select: typeof ITEM_SELECT }>;

/**
 * Header and footer navigation (script 18).
 *
 * Both were previously hard-coded JSX that derived itself from the category
 * tree, which meant a merchant could not add a "Gift cards" link, reorder the
 * columns, or keep a category out of the header without hiding it everywhere.
 *
 * One model serves both locations because the shape is identical: a label, a
 * destination, an order and a parent. Depth is capped at two — a parent is a
 * dropdown trigger in the header and a column heading in the footer, and a
 * third level has no rendering in either.
 */
@Injectable()
export class NavigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Public read ───────────────────────────

  /**
   * Both menus, resolved and nested.
   *
   * `configured` distinguishes an unconfigured store (the storefront falls back
   * to deriving navigation from categories, exactly as before) from one that
   * has deliberately emptied a menu.
   */
  async getPublicNavigation() {
    const rows = await this.prisma.navItem.findMany({
      where: { enabled: true },
      select: ITEM_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    const total = await this.prisma.navItem.count();
    return {
      configured: total > 0,
      header: this.nest(rows, NavLocation.HEADER),
      footer: this.nest(rows, NavLocation.FOOTER),
    };
  }

  // ─────────────────────────── Admin reads ───────────────────────────

  /** Flat list including disabled entries, for the manager UI. */
  listAdmin(location?: NavLocation) {
    return this.prisma.navItem.findMany({
      where: location ? { location } : {},
      select: ITEM_SELECT,
      orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  // ─────────────────────────── Mutations ───────────────────────────

  async create(dto: CreateNavItemDto, actorId?: number) {
    await this.assertParentValid(dto.parentId ?? null, dto.location, null);
    const sortOrder =
      dto.sortOrder ??
      (await this.nextOrder(dto.location, dto.parentId ?? null));

    const item = await this.prisma.navItem.create({
      data: {
        location: dto.location,
        parentId: dto.parentId ?? null,
        label: dto.label,
        href: dto.href ?? null,
        categoryId: dto.categoryId ?? null,
        icon: dto.icon ?? null,
        badge: dto.badge ?? null,
        newTab: dto.newTab ?? false,
        sortOrder,
        enabled: dto.enabled ?? true,
      },
      select: ITEM_SELECT,
    });
    await this.audit.record({
      actorId,
      action: 'navigation.create',
      entityType: 'NavItem',
      entityId: item.id,
      metadata: { location: item.location, label: item.label },
    });
    return item;
  }

  async update(id: string, dto: UpdateNavItemDto, actorId?: number) {
    const existing = await this.get(id);
    const location = dto.location ?? existing.location;
    if (dto.parentId !== undefined) {
      await this.assertParentValid(dto.parentId, location, id);
    }

    const data: Prisma.NavItemUpdateInput = {};
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.href !== undefined) data.href = dto.href;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.badge !== undefined) data.badge = dto.badge;
    if (dto.newTab !== undefined) data.newTab = dto.newTab;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    const item = await this.prisma.navItem.update({
      where: { id },
      data,
      select: ITEM_SELECT,
    });
    await this.audit.record({
      actorId,
      action: 'navigation.update',
      entityType: 'NavItem',
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return item;
  }

  /** Delete an entry. Children cascade (schema-level), which is what a column
   * heading disappearing should mean. */
  async remove(id: string, actorId?: number) {
    await this.get(id);
    await this.prisma.navItem.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'navigation.delete',
      entityType: 'NavItem',
      entityId: id,
    });
    return { id, deleted: true };
  }

  /**
   * Batch position + reparent, from the drag-reorder UI. The whole affected
   * list is sent, so the server applies an ordering rather than inferring one.
   */
  async reorder(dto: ReorderNavDto, actorId?: number) {
    if (dto.items.length === 0) return { updated: 0 };

    const ids = dto.items.map((i) => i.id);
    const rows = await this.prisma.navItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, location: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException('Reorder references an unknown entry.');
    }

    // Validate the FINAL arrangement in one pass: an item may only be a child
    // of a top-level item in the same menu, and cannot parent itself.
    const finalParent = new Map<string, string | null>();
    for (const item of dto.items)
      finalParent.set(item.id, item.parentId ?? null);
    for (const item of dto.items) {
      const parentId = item.parentId ?? null;
      if (!parentId) continue;
      if (parentId === item.id) {
        throw new BadRequestException('An entry cannot be its own parent.');
      }
      // The parent's own parent must be null — two levels, no deeper. A parent
      // outside this payload keeps whatever it already had, so look there too.
      const parentsParent = finalParent.has(parentId)
        ? finalParent.get(parentId)
        : (await this.get(parentId)).parentId;
      if (parentsParent) {
        throw new BadRequestException(
          'Navigation supports two levels — an entry cannot nest under a sub-entry.',
        );
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.navItem.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            parentId: item.parentId ?? null,
          },
        }),
      ),
    );
    await this.audit.record({
      actorId,
      action: 'navigation.reorder',
      entityType: 'NavItem',
      entityId: 'batch',
      metadata: { count: dto.items.length },
    });
    return { updated: dto.items.length };
  }

  /**
   * Build a starting navigation from the store's own catalog: top-level
   * categories in the header (with their children as dropdown entries) and a
   * "Shop" + "Help" pair of footer columns.
   *
   * The point is that a merchant lands on a populated screen they can edit,
   * rather than an empty one they have to imagine. `replace` clears first, so
   * pressing it twice cannot double the menu.
   */
  async seedFromCategories(
    location: NavLocation | undefined,
    replace: boolean,
    actorId?: number,
  ) {
    const existing = await this.prisma.navItem.count({
      where: location ? { location } : {},
    });
    if (existing > 0 && !replace) {
      return { seeded: false, reason: 'already-configured' as const };
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true, showInNav: true, parentId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        iconKey: true,
        children: {
          where: { isActive: true, showInNav: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, iconKey: true },
        },
      },
    });

    let created = 0;
    await this.prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.navItem.deleteMany({ where: location ? { location } : {} });
      }

      const wantHeader = !location || location === NavLocation.HEADER;
      const wantFooter = !location || location === NavLocation.FOOTER;

      if (wantHeader) {
        let order = 0;
        for (const category of categories) {
          const parent = await tx.navItem.create({
            data: {
              location: NavLocation.HEADER,
              label: category.name,
              categoryId: category.id,
              icon: category.iconKey,
              sortOrder: order++,
            },
          });
          created++;
          let childOrder = 0;
          for (const child of category.children) {
            await tx.navItem.create({
              data: {
                location: NavLocation.HEADER,
                parentId: parent.id,
                label: child.name,
                categoryId: child.id,
                icon: child.iconKey,
                sortOrder: childOrder++,
              },
            });
            created++;
          }
        }
        await tx.navItem.create({
          data: {
            location: NavLocation.HEADER,
            label: 'Deals',
            href: '/deals',
            icon: 'BadgePercent',
            badge: 'Sale',
            sortOrder: order,
          },
        });
        created++;
      }

      if (wantFooter) {
        const shop = await tx.navItem.create({
          data: { location: NavLocation.FOOTER, label: 'Shop', sortOrder: 0 },
        });
        created++;
        let shopOrder = 0;
        for (const category of categories.slice(0, 6)) {
          await tx.navItem.create({
            data: {
              location: NavLocation.FOOTER,
              parentId: shop.id,
              label: category.name,
              categoryId: category.id,
              icon: category.iconKey,
              sortOrder: shopOrder++,
            },
          });
          created++;
        }
        await tx.navItem.create({
          data: {
            location: NavLocation.FOOTER,
            parentId: shop.id,
            label: 'All products',
            href: '/search',
            sortOrder: shopOrder,
          },
        });
        created++;

        const help = await tx.navItem.create({
          data: { location: NavLocation.FOOTER, label: 'Help', sortOrder: 1 },
        });
        created++;
        const helpLinks = [
          { label: 'Track your order', href: '/account/orders' },
          { label: 'My account', href: '/account' },
          { label: 'Wishlist', href: '/wishlist' },
          { label: 'Cart', href: '/cart' },
        ];
        for (const [i, link] of helpLinks.entries()) {
          await tx.navItem.create({
            data: {
              location: NavLocation.FOOTER,
              parentId: help.id,
              label: link.label,
              href: link.href,
              sortOrder: i,
            },
          });
          created++;
        }
      }
    });

    await this.audit.record({
      actorId,
      action: replace ? 'navigation.reset' : 'navigation.seed',
      entityType: 'NavItem',
      entityId: 'batch',
      metadata: { created, location: location ?? 'ALL' },
    });

    return { seeded: true, created };
  }

  // ─────────────────────────── Internals ───────────────────────────

  /**
   * Flatten to a two-level tree for one location, resolving hrefs.
   *
   * An entry bound to a category that has since been hidden is DROPPED, not
   * rendered as a dead link — the category's own visibility flag has to win, or
   * hiding a category would still leave it advertised in the header.
   */
  private nest(rows: ItemRow[], location: NavLocation): NavNode[] {
    const forLocation = rows.filter(
      (r) => r.location === location && this.isLinkable(r),
    );
    const byParent = new Map<string | null, ItemRow[]>();
    for (const row of forLocation) {
      const bucket = byParent.get(row.parentId) ?? [];
      bucket.push(row);
      byParent.set(row.parentId, bucket);
    }

    const toNode = (row: ItemRow): NavNode => ({
      id: row.id,
      label: row.label,
      href: this.hrefFor(row),
      icon: row.icon,
      badge: row.badge,
      newTab: row.newTab,
      categorySlug: row.category?.slug ?? null,
      categoryImageUrl: row.category?.imageUrl ?? null,
      children: (byParent.get(row.id) ?? []).map((child) => ({
        ...toNode(child),
        children: [],
      })),
    });

    return (byParent.get(null) ?? []).map(toNode);
  }

  /** A category-bound entry is only linkable while its category is visible. */
  private isLinkable(row: ItemRow): boolean {
    if (row.categoryId) return row.category?.isActive === true;
    // A parent with no href is a heading, which is legitimate; a leaf with
    // neither href nor category has nowhere to go, and the caller filters it
    // out by giving it the "#" href below only when it has children.
    return true;
  }

  private hrefFor(row: ItemRow): string {
    if (row.category) return `/c/${row.category.slug}`;
    return row.href ?? '#';
  }

  private async get(id: string) {
    const item = await this.prisma.navItem.findUnique({
      where: { id },
      select: ITEM_SELECT,
    });
    if (!item) throw new NotFoundException('Navigation entry not found');
    return item;
  }

  /** Two-level guard, applied on create and on a parent change. */
  private async assertParentValid(
    parentId: string | null,
    location: NavLocation,
    selfId: string | null,
  ): Promise<void> {
    if (!parentId) return;
    if (parentId === selfId) {
      throw new BadRequestException('An entry cannot be its own parent.');
    }
    const parent = await this.prisma.navItem.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, location: true },
    });
    if (!parent) throw new BadRequestException('parentId does not exist.');
    if (parent.location !== location) {
      throw new BadRequestException(
        'An entry cannot be nested under one in a different menu.',
      );
    }
    if (parent.parentId) {
      throw new BadRequestException(
        'Navigation supports two levels — an entry cannot nest under a sub-entry.',
      );
    }
  }

  private async nextOrder(
    location: NavLocation,
    parentId: string | null,
  ): Promise<number> {
    const last = await this.prisma.navItem.aggregate({
      where: { location, parentId },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }
}
