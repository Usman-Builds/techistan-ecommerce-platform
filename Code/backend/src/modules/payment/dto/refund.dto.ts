import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Admin refund request (script 10, FR-413). Omit `amountCents` for a full
 * refund; provide it (≤ the remaining refundable amount) for a partial refund.
 * Money is integer cents.
 */
export class RefundDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
