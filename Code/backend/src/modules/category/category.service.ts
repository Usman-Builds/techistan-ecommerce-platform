import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ensureUniqueSlug, slugify } from '../../common/utils/slug.util';
import { MAX_CATEGORY_DEPTH } from '../product/dto/product.constants';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';

/**
 * The presentation / SEO / visibility half of a category, as plain scalars.
 *
 * Deliberately NOT `Prisma.CategoryUncheckedUpdateInput`: that type also admits
 * field-update operations (`{ set: … }`), which are legal in an update but not
 * in a create, so the shared mapper could not be spread into both.
 */
type CategoryPresentation = Partial<
  Pick<
    Prisma.CategoryUncheckedCreateInput,
    | 'description'
    | 'imageId'
    | 'imageUrl'
    | 'bannerId'
    | 'bannerUrl'
    | 'iconKey'
    | 'metaTitle'
    | 'metaDescription'
    | 'isActive'
    | 'showInNav'
    | 'featured'
  >
>;

/** Minimal node used for in-memory depth/cycle math. */
interface GraphNode {
  id: string;
  parentId: string | null;
}

export interface TreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  /** Lucide icon name chosen by the admin; null falls back to the heuristic. */
  iconKey: string | null;
  sortOrder: number;
  featured: boolean;
  showInNav: boolean;
  /** Products directly in this category. */
  productCount: number;
  /** Products in this category AND everything under it — what a shopper sees. */
  totalProductCount: number;
  children: TreeNode[];
}

/** Options for {@link CategoryService.getTree}. */
export interface TreeOptions {
  /** Admin callers pass true to see categories with `isActive = false`. */
  includeHidden?: boolean;
  /** Restrict to `showInNav` categories (header/footer fallback nav). */
  navOnly?: boolean;
}

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── Public reads ───────────────────────────

  /**
   * Nested tree (≤ 3 levels), each level ordered by sortOrder then name.
   *
   * Carries the merchandising fields (description/banner/icon/featured) so the
   * storefront and the admin category picker can both render a category
   * properly from one fetch. `productCount` is direct; `totalProductCount`
   * rolls the subtree up, because "Computers (0)" is misleading when every
   * product lives in its child categories.
   */
  async getTree(options: TreeOptions = {}): Promise<TreeNode[]> {
    const where: Prisma.CategoryWhereInput = {};
    if (!options.includeHidden) where.isActive = true;
    if (options.navOnly) where.showInNav = true;

    const [all, counts] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imageUrl: true,
          bannerUrl: true,
          iconKey: true,
          sortOrder: true,
          featured: true,
          showInNav: true,
          parentId: true,
        },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
        ...(options.includeHidden
          ? {}
          : { where: { status: ProductStatus.ACTIVE } }),
      }),
    ]);

    const directCount = new Map<string, number>();
    for (const row of counts) {
      if (row.categoryId) directCount.set(row.categoryId, row._count._all);
    }

    const byParent = new Map<string | null, typeof all>();
    for (const c of all) {
      const bucket = byParent.get(c.parentId) ?? [];
      bucket.push(c);
      byParent.set(c.parentId, bucket);
    }

    const build = (parentId: string | null, depth: number): TreeNode[] => {
      if (depth > MAX_CATEGORY_DEPTH) return [];
      return (byParent.get(parentId) ?? []).map((c) => {
        const children = build(c.id, depth + 1);
        const productCount = directCount.get(c.id) ?? 0;
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          imageUrl: c.imageUrl,
          bannerUrl: c.bannerUrl,
          iconKey: c.iconKey,
          sortOrder: c.sortOrder,
          featured: c.featured,
          showInNav: c.showInNav,
          productCount,
          totalProductCount:
            productCount +
            children.reduce((sum, kid) => sum + kid.totalProductCount, 0),
          children,
        };
      });
    };

    return build(null, 1);
  }

  /**
   * Flat slug + updatedAt feed for the storefront `sitemap.ts` (script 17).
   * All categories are public (no visibility flag), so every row is included.
   */
  sitemapEntries(): Promise<{ slug: string; updatedAt: Date }[]> {
    return this.prisma.category.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Category + immediate children + breadcrumb (root → self).
   *
   * A hidden category (`isActive = false`) 404s for the public storefront but
   * is still readable by admins previewing an unpublished landing page.
   */
  async getBySlug(slug: string, includeHidden = false) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        children: {
          where: includeHidden ? {} : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            iconKey: true,
          },
        },
        _count: { select: { products: true, children: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (!category.isActive && !includeHidden) {
      throw new NotFoundException('Category not found');
    }

    const breadcrumb = await this.buildBreadcrumb(category.id);
    return { ...category, breadcrumb };
  }

  /** Single category for the admin editor (includes hidden ones). */
  async getAdminById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /**
   * Expand category ids to include their whole subtree.
   *
   * Every "by category" feature in the app means "and everything under it" — a
   * coupon scoped to Computers has to cover Laptops, and an inventory filter on
   * Audio has to cover Headphones. Centralising the expansion here means that
   * rule is stated once instead of being re-derived (and eventually got wrong)
   * in promotions, inventory and search.
   *
   * Loads the id/parent graph in ONE query and walks it in memory; the tree is
   * at most 3 levels and a few hundred rows, so this is cheaper than a
   * recursive CTE and needs no raw SQL. Unknown ids are dropped. Returns [] for
   * an empty input, which callers must treat as "match nothing", not "match
   * everything".
   */
  async descendantIds(rootIds: string[]): Promise<string[]> {
    if (rootIds.length === 0) return [];

    const all = await this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });

    const childrenOf = new Map<string, string[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      const bucket = childrenOf.get(c.parentId) ?? [];
      bucket.push(c.id);
      childrenOf.set(c.parentId, bucket);
    }

    const known = new Set(all.map((c) => c.id));
    const out = new Set<string>();
    const queue = rootIds.filter((id) => known.has(id));
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (out.has(id)) continue; // defensive: broken data can't loop us forever
      out.add(id);
      queue.push(...(childrenOf.get(id) ?? []));
    }
    return [...out];
  }

  /** Flat admin list with child/product counts (drives the category manager). */
  listAdmin() {
    return this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true, children: true } } },
    });
  }

  // ─────────────────────────── Admin mutations ───────────────────────────

  async create(dto: CreateCategoryDto, actorId?: number) {
    const graph = await this.loadGraph();
    this.assertParentDepth(dto.parentId ?? null, 1, graph);

    const slug = await ensureUniqueSlug(dto.slug || dto.name, (s) =>
      this.slugTaken(s),
    );

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        ...CategoryService.presentationData(dto),
      },
    });
    await this.audit.record({
      actorId,
      action: 'category.create',
      entityType: 'Category',
      entityId: category.id,
      metadata: { name: category.name, slug: category.slug },
    });
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actorId?: number) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, slug: true, parentId: true },
    });
    if (!existing) throw new NotFoundException('Category not found');

    // If the parent changes, re-validate cycle + depth for this whole subtree.
    if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
      const graph = await this.loadGraph();
      this.assertNoCycle(id, dto.parentId, graph);
      const parentDepth = dto.parentId ? this.depthOf(dto.parentId, graph) : 0;
      const subtreeHeight = this.heightBelow(id, graph);
      if (parentDepth + subtreeHeight > MAX_CATEGORY_DEPTH) {
        throw new BadRequestException(
          `Move would exceed the maximum category depth of ${MAX_CATEGORY_DEPTH}.`,
        );
      }
    }

    let slug = existing.slug;
    if (dto.slug && slugify(dto.slug) !== existing.slug) {
      slug = await ensureUniqueSlug(dto.slug, (s) => this.slugTaken(s, id));
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        slug,
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...CategoryService.presentationData(dto),
      },
    });
    await this.audit.record({
      actorId,
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
    });
    return category;
  }

  /**
   * Delete a category. Blocked if it has children or products, unless
   * `reassignTo` is provided — then children + products are moved there first.
   */
  async remove(id: string, reassignTo: string | undefined, actorId?: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { products: true, children: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');

    const hasDependents =
      category._count.children > 0 || category._count.products > 0;

    if (hasDependents && !reassignTo) {
      throw new BadRequestException(
        'Category has children or products. Provide reassignTo to move them, or empty the category first.',
      );
    }

    if (reassignTo) {
      if (reassignTo === id) {
        throw new BadRequestException('Cannot reassign a category to itself.');
      }
      const target = await this.prisma.category.findUnique({
        where: { id: reassignTo },
        select: { id: true },
      });
      if (!target) throw new BadRequestException('reassignTo does not exist.');

      const graph = await this.loadGraph();
      // Reassign target must not sit inside the subtree being deleted (cycle).
      if (this.isDescendant(reassignTo, id, graph)) {
        throw new BadRequestException(
          'reassignTo cannot be a descendant of the category being deleted.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (reassignTo) {
        await tx.category.updateMany({
          where: { parentId: id },
          data: { parentId: reassignTo },
        });
        await tx.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: reassignTo },
        });
      }
      await tx.category.delete({ where: { id } });
      await this.audit.record(
        {
          actorId,
          action: 'category.delete',
          entityType: 'Category',
          entityId: id,
          metadata: reassignTo ? { reassignTo } : undefined,
        },
        tx,
      );
    });

    return { id, deleted: true, reassignedTo: reassignTo ?? null };
  }

  /** Batch parent/sortOrder update from the drag-reorder UI. */
  async reorder(dto: ReorderCategoriesDto, actorId?: number) {
    if (dto.items.length === 0) return { updated: 0 };

    // Validate the FINAL graph (all moves applied) for cycles + depth once.
    const graph = await this.loadGraph();
    for (const item of dto.items) {
      const node = graph.get(item.id);
      if (!node) {
        throw new BadRequestException(`Unknown category id: ${item.id}`);
      }
      node.parentId = item.parentId ?? null;
    }
    this.assertGraphValid(graph);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.category.update({
          where: { id: item.id },
          data: {
            parentId: item.parentId ?? null,
            sortOrder: item.sortOrder,
          },
        });
      }
      await this.audit.record(
        {
          actorId,
          action: 'category.reorder',
          entityType: 'Category',
          entityId: 'batch',
          metadata: { count: dto.items.length },
        },
        tx,
      );
    });

    return { updated: dto.items.length };
  }

  /**
   * Map the presentation / SEO / visibility half of a category DTO onto Prisma
   * data. Shared by create and update so the two can never drift — the field
   * list here is the single place a new category column has to be wired.
   *
   * Only keys the caller actually sent are emitted, which is what makes PATCH
   * semantics work: omitting `bannerUrl` leaves it alone, sending `null` clears
   * it.
   */
  private static presentationData(
    dto: CreateCategoryDto | UpdateCategoryDto,
  ): CategoryPresentation {
    const keys = [
      'description',
      'imageId',
      'imageUrl',
      'bannerId',
      'bannerUrl',
      'iconKey',
      'metaTitle',
      'metaDescription',
      'isActive',
      'showInNav',
      'featured',
    ] as const;

    const data: CategoryPresentation = {};
    for (const key of keys) {
      const value = dto[key];
      if (value !== undefined) {
        // Each key's value type already matches its slot; the cast is only
        // needed because the loop erases the per-key correspondence.
        (data as Record<string, unknown>)[key] = value;
      }
    }
    return data;
  }

  // ─────────────────────────── graph helpers ───────────────────────────

  private async loadGraph(): Promise<Map<string, GraphNode>> {
    const all = await this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });
    return new Map(all.map((c) => [c.id, { id: c.id, parentId: c.parentId }]));
  }

  /** Depth of a node (root = 1), guarding against pre-existing cycles. */
  private depthOf(id: string, graph: Map<string, GraphNode>): number {
    let depth = 0;
    let current: string | null = id;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) break; // defensive: broken data
      seen.add(current);
      depth += 1;
      current = graph.get(current)?.parentId ?? null;
    }
    return depth;
  }

  /** Height of the subtree rooted at `id` (a leaf = 1). */
  private heightBelow(id: string, graph: Map<string, GraphNode>): number {
    const childrenOf = new Map<string, string[]>();
    for (const node of graph.values()) {
      if (node.parentId) {
        const bucket = childrenOf.get(node.parentId) ?? [];
        bucket.push(node.id);
        childrenOf.set(node.parentId, bucket);
      }
    }
    const walk = (nodeId: string, seen: Set<string>): number => {
      if (seen.has(nodeId)) return 0;
      seen.add(nodeId);
      const kids = childrenOf.get(nodeId) ?? [];
      if (kids.length === 0) return 1;
      return 1 + Math.max(...kids.map((k) => walk(k, seen)));
    };
    return walk(id, new Set());
  }

  private isDescendant(
    candidateId: string,
    ancestorId: string,
    graph: Map<string, GraphNode>,
  ): boolean {
    let current: string | null = graph.get(candidateId)?.parentId ?? null;
    const seen = new Set<string>();
    while (current) {
      if (current === ancestorId) return true;
      if (seen.has(current)) break;
      seen.add(current);
      current = graph.get(current)?.parentId ?? null;
    }
    return false;
  }

  private assertNoCycle(
    id: string,
    parentId: string | null | undefined,
    graph: Map<string, GraphNode>,
  ): void {
    if (!parentId) return;
    if (parentId === id) {
      throw new BadRequestException('A category cannot be its own parent.');
    }
    if (!graph.has(parentId)) {
      throw new BadRequestException('parentId does not exist.');
    }
    if (this.isDescendant(parentId, id, graph)) {
      throw new BadRequestException(
        'Cannot move a category under one of its own descendants (cycle).',
      );
    }
  }

  /** Pure graph maths on an already-loaded graph — no I/O, so not async. */
  private assertParentDepth(
    parentId: string | null,
    newSubtreeHeight: number,
    graph: Map<string, GraphNode>,
  ): void {
    if (!parentId) return;
    if (!graph.has(parentId)) {
      throw new BadRequestException('parentId does not exist.');
    }
    const parentDepth = this.depthOf(parentId, graph);
    if (parentDepth + newSubtreeHeight > MAX_CATEGORY_DEPTH) {
      throw new BadRequestException(
        `Category depth cannot exceed ${MAX_CATEGORY_DEPTH} levels.`,
      );
    }
  }

  /** Whole-graph validation used after applying a batch of reorder moves. */
  private assertGraphValid(graph: Map<string, GraphNode>): void {
    for (const node of graph.values()) {
      // Cycle check: walking parents must terminate at a root.
      const seen = new Set<string>();
      let current: string | null = node.id;
      while (current) {
        if (seen.has(current)) {
          throw new BadRequestException('Reorder would create a cycle.');
        }
        seen.add(current);
        current = graph.get(current)?.parentId ?? null;
      }
      // Depth check.
      if (this.depthOf(node.id, graph) > MAX_CATEGORY_DEPTH) {
        throw new BadRequestException(
          `Reorder would exceed the maximum depth of ${MAX_CATEGORY_DEPTH}.`,
        );
      }
    }
  }

  private async buildBreadcrumb(
    startId: string,
  ): Promise<{ id: string; name: string; slug: string }[]> {
    const trail: { id: string; name: string; slug: string }[] = [];
    let current: string | null = startId;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const node = await this.prisma.category.findUnique({
        where: { id: current },
        select: { id: true, name: true, slug: true, parentId: true },
      });
      if (!node) break;
      trail.unshift({ id: node.id, name: node.name, slug: node.slug });
      current = node.parentId;
    }
    return trail;
  }

  private slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    return this.prisma.category
      .findFirst({
        where: { slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
      })
      .then((c) => !!c);
  }
}
