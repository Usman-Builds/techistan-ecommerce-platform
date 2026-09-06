import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type ReviewSort = 'newest' | 'helpful' | 'rating';

/** Public review-list filters + pagination (FR-705). APPROVED only, per product. */
export class ListReviewsQueryDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  /** newest (default) | helpful (most-helpful first) | rating (highest first). */
  @IsOptional()
  @IsIn(['newest', 'helpful', 'rating'])
  sort?: ReviewSort;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
