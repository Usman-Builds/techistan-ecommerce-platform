import { IsInt, Max, Min } from 'class-validator';

/**
 * Quick stock adjustment (script 15, FR-805). Sets the absolute on-hand quantity
 * for a variant (integer units, never negative). The client applies this
 * optimistically and reconciles against the returned row.
 */
export class AdjustStockDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;
}
