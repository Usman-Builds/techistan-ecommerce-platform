import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Toggle a customer's account status active/banned (script 15, FR-804). */
export class UpdateCustomerStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
