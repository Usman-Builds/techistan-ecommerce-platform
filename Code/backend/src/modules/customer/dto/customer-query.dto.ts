import { Transform } from 'class-transformer';
import { UserStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Admin customer-list filters (script 15, FR-804). Scoped to CUSTOMER-role users;
 * supports search (name/email), status (ACTIVE/BANNED), and pagination.
 */
export class CustomerQueryDto {
  /** Case-insensitive contains over first/last name and email. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

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
