import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * DI token for the configured Cloudinary `v2` instance. Inject with
 * `@Inject(CLOUDINARY) private readonly cloudinary: CloudinaryInstance`.
 */
export const CLOUDINARY = 'CLOUDINARY';

export type CloudinaryInstance = typeof cloudinary;

/**
 * Configures the Cloudinary SDK once from ConfigService and exposes the shared
 * `v2` instance. The **API secret lives only here on the server** — it is used to
 * sign upload requests and call the Admin API, and is never returned to clients.
 */
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY,
  inject: [ConfigService],
  useFactory: (config: ConfigService): CloudinaryInstance => {
    cloudinary.config({
      cloud_name: config.get<string>('cloudinary.cloudName'),
      api_key: config.get<string>('cloudinary.apiKey'),
      api_secret: config.get<string>('cloudinary.apiSecret'),
      secure: true,
    });
    return cloudinary;
  },
};
