import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { ListProductsDto } from './dto/list-products.dto';

/**
 * Public storefront reads (FR-201/202/222) — **no guard**. Callers always see
 * ACTIVE products only (enforced in the service). Admin listing/detail with all
 * statuses lives on `admin-product.controller.ts`.
 */
@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(@Query() dto: ListProductsDto) {
    return this.products.list(dto, false);
  }

  // Declared before `:slug` so `/products/sitemap` never resolves to the param
  // route. Feeds the storefront sitemap (script 17).
  @Get('sitemap')
  sitemap() {
    return this.products.sitemapEntries();
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug, false);
  }
}
