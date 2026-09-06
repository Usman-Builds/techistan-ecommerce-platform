import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RecentlyViewedController } from './recently-viewed.controller';
import { RecentlyViewedService } from './recently-viewed.service';

/**
 * Recently-viewed module (script 08). Imports ProductModule to reuse
 * ProductService.getCardsByIds for card hydration. PrismaModule is @Global.
 */
@Module({
  imports: [ProductModule],
  controllers: [RecentlyViewedController],
  providers: [RecentlyViewedService],
})
export class RecentlyViewedModule {}
