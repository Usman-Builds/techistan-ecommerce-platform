import { OrderStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

/** `strict` also rejects impossible dates such as 2026-13-45 (#51). */
const ISO_DATE = { strict: true };

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
  @IsISO8601(ISO_DATE, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE, { message: 'to must be an ISO-8601 date' })
  to?: string;
}
