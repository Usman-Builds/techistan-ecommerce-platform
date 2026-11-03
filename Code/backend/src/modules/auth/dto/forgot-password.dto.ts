import { IsEmail } from 'class-validator';
import { NormalizeEmail } from './normalize-email';

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
