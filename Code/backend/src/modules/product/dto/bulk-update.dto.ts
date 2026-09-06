import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Bulk catalog actions (FR-802). `setPrice` requires `value` (cents). */
export enum BulkAction {
  ACTIVATE = 'activate',
  ARCHIVE = 'archive',
  DELETE = 'delete',
  SET_PRICE = 'setPrice',
}

export class BulkUpdateDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];

  @IsEnum(BulkAction)
  action!: BulkAction;

  /** New price in cents; required (and validated) only for `setPrice`. */
  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;
}
