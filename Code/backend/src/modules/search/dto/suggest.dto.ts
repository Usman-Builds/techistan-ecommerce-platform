import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Query params for `GET /search/suggest` (autocomplete, script 08). */
export class SuggestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q!: string;
}
