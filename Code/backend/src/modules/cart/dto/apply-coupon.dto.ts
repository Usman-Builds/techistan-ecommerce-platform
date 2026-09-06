import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for `POST /cart/coupon` — apply a coupon code to the cart. */
export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}
