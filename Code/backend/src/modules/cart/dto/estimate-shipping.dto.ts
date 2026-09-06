import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /cart/estimate-shipping` (FR-305). Partial address is fine — a
 * country is enough to pick a zone. This is a cheap, NON-authoritative preview;
 * the binding calculation runs at checkout (script 10).
 */
export class EstimateShippingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;
}
