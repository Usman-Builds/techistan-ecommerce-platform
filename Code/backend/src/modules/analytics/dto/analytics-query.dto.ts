import { Transform } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

/** `strict` also rejects impossible dates such as 2026-13-45 (#51). */
const ISO_DATE = { strict: true };

/**
 * Date-range filter for the analytics endpoints (script 15, FR-801). `from`/`to`
 * are ISO date strings; when omitted the service falls back to a sensible default
 * window (last 30 days). All aggregates are computed server-side (NFR — never on
 * the client) via efficient grouped queries.
 */
export class AnalyticsQueryDto {
  @IsOptional()
  @IsISO8601(ISO_DATE, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE, { message: 'to must be an ISO-8601 date' })
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
