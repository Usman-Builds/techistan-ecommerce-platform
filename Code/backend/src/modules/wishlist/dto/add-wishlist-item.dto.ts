import { IsNotEmpty, IsString } from 'class-validator';

/** Body for `POST /wishlist/items` — add a product to the customer's wishlist. */
export class AddWishlistItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;
}
