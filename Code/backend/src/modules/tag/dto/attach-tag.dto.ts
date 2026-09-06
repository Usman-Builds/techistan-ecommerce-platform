import { IsString } from 'class-validator';

/** Payload for attaching/detaching a tag to/from a product (ProductTag join). */
export class AttachTagDto {
  @IsString()
  productId!: string;

  @IsString()
  tagId!: string;
}
