import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { NavLocation } from '@prisma/client';

export class CreateNavItemDto {
  @IsEnum(NavLocation)
  location!: NavLocation;

  /**
   * Parent entry. In the HEADER a parent is a dropdown trigger; in the FOOTER
   * it is a column heading. Two levels only — the service rejects a parent that
   * already has one.
   */
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsString()
  @Length(1, 60)
  label!: string;

  /**
   * Destination. Ignored when `categoryId` is set — a category link derives its
   * URL from the category's current slug, so renaming a category can't leave a
   * dead link behind.
   */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  href?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  /** Lucide icon name shown before the label. */
  @IsOptional()
  @IsString()
  @Length(0, 60)
  icon?: string | null;

  /** Small pill after the label, e.g. "New". */
  @IsOptional()
  @IsString()
  @Length(0, 20)
  badge?: string | null;

  @IsOptional()
  @IsBoolean()
  newTab?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNavItemDto {
  @IsOptional()
  @IsEnum(NavLocation)
  location?: NavLocation;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  href?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  badge?: string | null;

  @IsOptional()
  @IsBoolean()
  newTab?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** One row of a navigation reorder: position AND (possibly new) parent. */
export class NavReorderItemDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderNavDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => NavReorderItemDto)
  items!: NavReorderItemDto[];
}
