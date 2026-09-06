import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Admin status transition (script 11, FR-501). The target must be a valid next
 * state for the order's current status (enforced in the service). REFUNDED is not
 * accepted here — refunds go through the dedicated refund action.
 */
export class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  /** Optional internal note recorded with the transition. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
