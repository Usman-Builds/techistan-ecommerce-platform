import { OrderNoteVisibility } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Order note (script 11, FR-507). INTERNAL notes are admin-only; CUSTOMER notes
 * also appear on the customer order-detail page.
 */
export class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsEnum(OrderNoteVisibility)
  visibility?: OrderNoteVisibility;
}
