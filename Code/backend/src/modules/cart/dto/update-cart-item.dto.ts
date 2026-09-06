import { IsInt, Max, Min } from 'class-validator';

/**
 * Body for `PATCH /cart/items/:itemId` — set an absolute quantity. A quantity of
 * 0 removes the line; anything above available stock is clamped server-side.
 */
export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}
