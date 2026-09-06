import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { InventoryService } from './inventory.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

/** Admin inventory (script 15, FR-805). All `@AdminOnly()`. */
@AdminOnly()
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() query: InventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get('low-stock')
  lowStock() {
    return this.inventory.lowStock();
  }

  @Patch(':variantId')
  adjust(
    @Param('variantId') variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.inventory.adjust(variantId, dto.stock, actorId);
  }
}
