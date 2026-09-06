import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ALLOWED_FOLDERS, DEFAULT_FOLDER } from '../media.util';

/**
 * Body for `POST /media/upload-signature`. `folder` is whitelisted against the
 * canonical FOLDERS so a client can't sign an upload into an arbitrary path.
 */
export class CreateSignatureDto {
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_FOLDERS, { message: 'folder is not an allowed upload folder' })
  folder: string = DEFAULT_FOLDER;

  /** Optional explicit Cloudinary public_id (otherwise Cloudinary assigns one). */
  @IsOptional()
  @IsString()
  @Matches(/^[\w./-]{1,200}$/, {
    message: 'publicId contains invalid characters',
  })
  publicId?: string;
}
