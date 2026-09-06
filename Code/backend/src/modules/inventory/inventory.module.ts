import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Admin inventory (script 15, FR-805). PrismaService + AuditService are @Global.
 */
@Module({
  // CategoryModule supplies the subtree expansion behind the "by category"
  // filter (a variant in "Laptops" must match a filter on "Computers").
  imports: [CategoryModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
