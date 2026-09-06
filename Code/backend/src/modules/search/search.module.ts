import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PgSearchProvider } from './providers/pg-search.provider';
import { SEARCH_PROVIDER } from './providers/search-provider.interface';

/**
 * Search module (script 08). The `SEARCH_PROVIDER` token is bound by a factory
 * that reads `search.driver` (env `SEARCH_DRIVER`). Today only the Postgres FTS
 * provider ships; adding a MeiliSearchProvider means registering it here and
 * extending this switch — every caller depends on the interface, not the impl
 * (CR-001). PrismaModule is @Global, so PgSearchProvider needs no import.
 */
@Module({
  controllers: [SearchController],
  providers: [
    PgSearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useFactory: (config: ConfigService, pg: PgSearchProvider) => {
        const driver = config.get<string>('search.driver') ?? 'pg';
        switch (driver) {
          // case 'meilisearch': return meili;  // future drop-in
          case 'pg':
          default:
            return pg;
        }
      },
      inject: [ConfigService, PgSearchProvider],
    },
    SearchService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
