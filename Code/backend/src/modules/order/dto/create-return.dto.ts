import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Reason a customer is returning items (FR-508). */
export enum ReturnReason {
  DEFECTIVE = 'DEFECTIVE',
  WRONG_ITEM = 'WRONG_ITEM',
  NOT_AS_DESCRIBED = 'NOT_AS_DESCRIBED',
  NO_LONGER_NEEDED = 'NO_LONGER_NEEDED',
  ARRIVED_LATE = 'ARRIVED_LATE',
  OTHER = 'OTHER',
}

/** One line of a return request: an order item + how many units to return. */
export class ReturnItemDto {
  @IsString()
  @IsNotEmpty()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Customer return request (script 11, Task 7). Only allowed for eligible
 * (delivered/completed) orders; the requested items must belong to the order and
 * not exceed the purchased quantity (validated in the service).
 */
export class CreateReturnDto {
  @IsEnum(ReturnReason)
  reasonCode!: ReturnReason;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Admin decision on a return: optionally refund + restock on approval. */
export class ResolveReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
