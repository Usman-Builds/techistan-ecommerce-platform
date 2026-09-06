import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Address snapshot captured on an order (script 10, FR-402). Guests type it in;
 * signed-in customers may pick a saved address (resolved to the same shape).
 */
export class OrderAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  state!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  /** ISO-2 country code (e.g. "US"); drives shipping + tax. */
  @IsString()
  @Length(2, 2)
  country!: string;
}

/**
 * Create-order payload (script 10, FR-401/406). The `idempotencyKey` is stable
 * per checkout attempt — resubmitting it returns the SAME order instead of
 * creating a duplicate. All money is recomputed server-side; the client never
 * sends totals (FR-404).
 */
export class CreateOrderDto {
  @IsEmail()
  email!: string;

  /** Stable per checkout attempt; dedupes duplicate submissions. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey!: string;

  @ValidateNested()
  @Type(() => OrderAddressDto)
  shippingAddress!: OrderAddressDto;

  /** Defaults to the shipping address when omitted. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderAddressDto)
  billingAddress?: OrderAddressDto;

  /** Save the shipping address to the customer's address book (logged-in only). */
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;
}
