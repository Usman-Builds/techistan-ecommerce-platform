import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Supported carriers (FR-504). Keep in sync with CARRIER_TRACKING_URLS. */
export enum Carrier {
  UPS = 'UPS',
  USPS = 'USPS',
  FEDEX = 'FEDEX',
  DHL = 'DHL',
  OTHER = 'OTHER',
}

/**
 * Set-tracking payload (script 11, Task 5). Creating tracking records a
 * ShipmentEvent, builds the carrier URL, and moves the order to SHIPPED.
 */
export class SetTrackingDto {
  @IsEnum(Carrier)
  carrier!: Carrier;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
