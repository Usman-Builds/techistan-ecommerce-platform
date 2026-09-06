import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { AdminProductController } from './admin-product.controller';

/**
 * Catalog product module (script 07). PrismaModule and AuditModule are @Global,
 * so only MediaModule (Cloudinary cleanup) and SearchModule (reindex hooks,
 * script 08) are imported. Exports ProductService for reuse by cart/order flows
 * (scripts 09–11) and recently-viewed (script 08).
 */
@Module({
  imports: [MediaModule, SearchModule],
  controllers: [ProductController, AdminProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
