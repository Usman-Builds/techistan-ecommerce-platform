import { IsInt, IsOptional, Max, Min } from 'class-validator';

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

  /**
   * The on-hand value the admin was looking at when they typed `stock` (#17).
   * If the row no longer holds it (a sale landed meanwhile), the API answers 409
   * instead of overwriting the decrement. Optional for older clients.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedStock?: number;
}
