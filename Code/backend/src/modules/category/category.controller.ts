import { Controller, Get, Param } from '@nestjs/common';
import { CategoryService } from './category.service';

/**
 * Public category reads — no guard. `tree` is declared before `:slug` so
 * `/categories/tree` never resolves to the param route.
 */
@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get('tree')
  tree() {
    return this.categories.getTree();
  }

  // Before `:slug` (like `tree`) so it never resolves to the param route.
  @Get('sitemap')
  sitemap() {
    return this.categories.sitemapEntries();
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.categories.getBySlug(slug);
  }
}
