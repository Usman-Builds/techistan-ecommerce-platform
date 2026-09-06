import { IsString, IsNotEmpty, Matches, MinLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth.constants';

export class ResetPasswordDto {
  @IsString() @IsNotEmpty() token: string;

  // Same strong-password policy as registration (FR-105).
  @IsString()
  @MinLength(8, { message: PASSWORD_MESSAGE })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
}
