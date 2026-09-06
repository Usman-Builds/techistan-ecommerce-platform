import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/** Body for `POST /cart/items` — add a variant to the cart (or increment it). */
export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  // Quantity to add. Clamped to available stock server-side; a hard upper bound
  // keeps a single request from requesting an absurd amount.
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number = 1;
}
