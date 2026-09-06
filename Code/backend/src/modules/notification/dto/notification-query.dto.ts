import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for the current user's notification list (newest first). */
export class NotificationQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** When "true", return only unread rows. */
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;
}
