import { Inject, Injectable, Logger } from '@nestjs/common';
import { SearchParamsDto } from './dto/search-params.dto';
import { SEARCH_PROVIDER } from './providers/search-provider.interface';
import type {
  SearchFacets,
  SearchProvider,
  SearchResult,
  Suggestion,
} from './providers/search-provider.interface';

/**
 * Thin orchestration layer over the active {@link SearchProvider}. Feature
 * modules (e.g. the catalog admin write paths) depend on this service rather
 * than the provider token, and the reindex hooks are best-effort so a search
 * hiccup never blocks a catalog mutation.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
  ) {}

  search(params: SearchParamsDto): Promise<SearchResult> {
    return this.provider.search(params);
  }

  facets(params: SearchParamsDto): Promise<SearchFacets> {
    return this.provider.facets(params);
  }

  suggest(query: string): Promise<Suggestion[]> {
    return this.provider.suggest(query);
  }

  /** Best-effort reindex hook — called from catalog writes; never throws. */
  async indexProduct(productId: string): Promise<void> {
    try {
      await this.provider.indexProduct(productId);
    } catch (err) {
      this.logger.warn(
        `indexProduct(${productId}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** Best-effort de-index hook — called on catalog delete; never throws. */
  async removeProduct(productId: string): Promise<void> {
    try {
      await this.provider.removeProduct(productId);
    } catch (err) {
      this.logger.warn(
        `removeProduct(${productId}) failed: ${(err as Error).message}`,
      );
    }
  }
}
