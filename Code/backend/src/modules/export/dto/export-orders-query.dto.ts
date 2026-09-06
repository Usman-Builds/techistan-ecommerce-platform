import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Orders CSV export filters (script 15, FR-809). Mirrors the admin order-list
 * filters so an export can respect the current view (status + date range). No
 * pagination — the export streams the entire matching set.
 */
export class ExportOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
