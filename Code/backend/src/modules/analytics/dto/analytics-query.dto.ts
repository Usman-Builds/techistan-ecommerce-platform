import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Date-range filter for the analytics endpoints (script 15, FR-801). `from`/`to`
 * are ISO date strings; when omitted the service falls back to a sensible default
 * window (last 30 days). All aggregates are computed server-side (NFR — never on
 * the client) via efficient grouped queries.
 */
export class AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

/** Top-products query — same range plus a result cap. */
export class TopProductsQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
