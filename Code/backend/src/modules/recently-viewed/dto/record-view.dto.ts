import { IsNotEmpty, IsString } from 'class-validator';

/** Body for `POST /recently-viewed` — records that a product was viewed. */
export class RecordViewDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;
}
