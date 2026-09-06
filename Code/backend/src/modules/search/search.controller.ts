import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchParamsDto } from './dto/search-params.dto';
import { SuggestDto } from './dto/suggest.dto';

/**
 * Public storefront search (FR-220–223) — **no guard**, all `GET`. Only ACTIVE
 * products are ever returned (enforced in the provider). The static `suggest`
 * and `facets` segments don't collide with the root `/search` route.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  /** Main search: results + facet counts + sort + pagination + highlights. */
  @Get()
  search(@Query() dto: SearchParamsDto) {
    return this.svc.search(dto);
  }

  /** Autocomplete: product + category suggestions (≤8). Debounced client-side. */
  @Get('suggest')
  suggest(@Query() dto: SuggestDto) {
    return this.svc.suggest(dto.q);
  }

  /** Standalone facet counts for filter panels that refresh independently. */
  @Get('facets')
  facets(@Query() dto: SearchParamsDto) {
    return this.svc.facets(dto);
  }
}
