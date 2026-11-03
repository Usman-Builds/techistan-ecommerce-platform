import { IsEmail } from 'class-validator';
import { NormalizeEmail } from './normalize-email';

export class ResendVerificationDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
