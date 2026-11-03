import { Transform } from 'class-transformer';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Customer order-history filters (script 11, Task 3, FR-112). Scoped server-side
 * to the authenticated user's own orders, and paginated (#55).
 */
export class OrderQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Match against order number (case-insensitive contains). */
  @IsOptional()
  @IsString()
  search?: string;

  /** ISO date lower/upper bounds on createdAt. */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  /** 1-based page (#55). */
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page?: number;

  /** Orders per page; default 20, at most 50 (#55). */
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

/**
 * Admin order-list filters (script 11, Task 4, FR-506). Adds payment status +
 * broader customer search and pagination on top of the customer filters.
 */
export class AdminOrderQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  /** Match order number OR customer email (case-insensitive contains). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
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
