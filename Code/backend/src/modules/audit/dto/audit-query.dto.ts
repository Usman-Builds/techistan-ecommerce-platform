import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** `strict` also rejects impossible dates such as 2026-13-45 (#51). */
const ISO_DATE = { strict: true };

/** Audit-log viewer filters (script 15, FR-808). Read-only. */
export class AuditQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  actorId?: number;

  /** Case-insensitive contains over the dotted action verb. */
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE, { message: 'from must be an ISO-8601 date' })
  from?: string;

  @IsOptional()
  @IsISO8601(ISO_DATE, { message: 'to must be an ISO-8601 date' })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
