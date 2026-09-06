import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optional reason recorded in the audit log when a review is rejected (FR-702). */
export class RejectReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
