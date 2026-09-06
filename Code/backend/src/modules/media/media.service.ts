import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CLOUDINARY } from './cloudinary.provider';
import type { CloudinaryInstance } from './cloudinary.provider';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { SaveMediaDto } from './dto/save-media.dto';
import {
  ALLOWED_FOLDERS,
  ALLOWED_FORMATS,
  DEFAULT_FOLDER,
  MAX_UPLOAD_BYTES,
} from './media.util';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: CloudinaryInstance,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Guard every Cloudinary interaction so we fail loudly if env is unset. */
  private requireConfig(): {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  } {
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    const apiKey = this.config.get<string>('cloudinary.apiKey');
    const apiSecret = this.config.get<string>('cloudinary.apiSecret');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException(
        'Cloudinary is not configured on the server (set CLOUDINARY_* env vars).',
      );
    }
    return { cloudName, apiKey, apiSecret };
  }

  /**
   * Build a short-lived upload signature. The client posts the file directly to
   * Cloudinary with `{ signature, timestamp, api_key, folder }` — the file never
   * transits our API (NFR-404). Only public values (`apiKey`, `cloudName`) leave
   * the server; the **secret is only used to compute the signature**.
   */
  createUploadSignature(dto: CreateSignatureDto) {
    const { cloudName, apiKey, apiSecret } = this.requireConfig();

    const folder = dto.folder ?? DEFAULT_FOLDER;
    if (!ALLOWED_FOLDERS.includes(folder)) {
      throw new BadRequestException('folder is not an allowed upload folder');
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Exactly the params the client will send (alphabetical order is handled by
    // the SDK). The client MUST echo these back verbatim or the upload fails.
    const paramsToSign: Record<string, string | number> = { folder, timestamp };
    if (dto.publicId) paramsToSign.public_id = dto.publicId;

    const signature = this.cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      ...(dto.publicId ? { publicId: dto.publicId } : {}),
    };
  }

  /**
   * Persist a confirmed upload. Re-verifies the asset against the Cloudinary
   * Admin API (authoritative metadata + anti-spoof), enforces format/size, then
   * writes either a `ProductImage` (if `productId` given) or a generic
   * `MediaAsset` for the library.
   */
  async saveMedia(dto: SaveMediaDto) {
    this.requireConfig();

    // Anti-spoof: the record only lands if Cloudinary actually holds the asset.
    // (Cloudinary indexes uploads immediately, so a fresh public_id resolves.)
    let resource: {
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      secure_url?: string;
    };
    try {
      resource = await this.cloudinary.api.resource(dto.cloudinaryPublicId);
    } catch {
      throw new BadRequestException(
        'Uploaded asset could not be verified with Cloudinary.',
      );
    }

    const format = resource.format ?? dto.format;
    const width = resource.width ?? dto.width;
    const height = resource.height ?? dto.height;
    const bytes = resource.bytes ?? dto.bytes;
    const url = resource.secure_url ?? dto.url;

    if (
      format &&
      !(ALLOWED_FORMATS as readonly string[]).includes(format.toLowerCase())
    ) {
      await this.destroyQuietly(dto.cloudinaryPublicId);
      throw new BadRequestException(`Unsupported file format: ${format}`);
    }
    if (bytes && bytes > MAX_UPLOAD_BYTES) {
      await this.destroyQuietly(dto.cloudinaryPublicId);
      throw new BadRequestException('File exceeds the maximum allowed size.');
    }

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('Product not found');

      const position = await this.prisma.productImage.count({
        where: { productId: dto.productId },
      });

      return this.prisma.productImage.create({
        data: {
          productId: dto.productId,
          cloudinaryPublicId: dto.cloudinaryPublicId,
          url,
          alt: dto.alt ?? null,
          width: width ?? null,
          height: height ?? null,
          position,
        },
      });
    }

    // Generic library asset. Upsert on public_id so a re-confirm is idempotent.
    return this.prisma.mediaAsset.upsert({
      where: { cloudinaryPublicId: dto.cloudinaryPublicId },
      update: {
        url,
        format: format ?? null,
        width: width ?? null,
        height: height ?? null,
        bytes: bytes ?? null,
        alt: dto.alt ?? null,
        folder: dto.folder ?? null,
      },
      create: {
        cloudinaryPublicId: dto.cloudinaryPublicId,
        url,
        format: format ?? null,
        width: width ?? null,
        height: height ?? null,
        bytes: bytes ?? null,
        alt: dto.alt ?? null,
        folder: dto.folder ?? null,
      },
    });
  }

  /** Library listing for the admin media page (optional case-insensitive search). */
  listMedia(search?: string) {
    const q = search?.trim();
    return this.prisma.mediaAsset.findMany({
      where: q
        ? {
            OR: [
              { cloudinaryPublicId: { contains: q, mode: 'insensitive' } },
              { alt: { contains: q, mode: 'insensitive' } },
              { folder: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Delete an asset from the DB **and** Cloudinary. The Cloudinary destroy is
   * best-effort: a failure is logged (for a reconcile job — Task 8) but never
   * blocks or rolls back the DB delete.
   */
  async deleteMedia(publicId: string) {
    const [asset, images] = await Promise.all([
      this.prisma.mediaAsset.findUnique({
        where: { cloudinaryPublicId: publicId },
        select: { id: true },
      }),
      this.prisma.productImage.findMany({
        where: { cloudinaryPublicId: publicId },
        select: { id: true },
      }),
    ]);

    if (!asset && images.length === 0) {
      throw new NotFoundException('Media asset not found');
    }

    await this.prisma.$transaction([
      this.prisma.mediaAsset.deleteMany({
        where: { cloudinaryPublicId: publicId },
      }),
      this.prisma.productImage.deleteMany({
        where: { cloudinaryPublicId: publicId },
      }),
    ]);

    const cloudinaryDestroyed = await this.destroyQuietly(publicId);
    return { publicId, deleted: true, cloudinaryDestroyed };
  }

  /**
   * Best-effort Cloudinary cleanup for a public_id whose DB row is already gone
   * (e.g. a `ProductImage` cascade-deleted with its product — script 07). Never
   * throws; returns whether the destroy succeeded.
   */
  cleanupCloudinaryAsset(publicId: string): Promise<boolean> {
    return this.destroyQuietly(publicId);
  }

  /** Best-effort Cloudinary destroy; returns whether it succeeded. Never throws. */
  private async destroyQuietly(publicId: string): Promise<boolean> {
    try {
      const res = await this.cloudinary.uploader.destroy(publicId, {
        invalidate: true,
      });
      if (res.result !== 'ok' && res.result !== 'not found') {
        this.logger.warn(
          `Cloudinary destroy for "${publicId}" returned "${res.result}" (logged for reconcile).`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Cloudinary destroy failed for "${publicId}" (logged for reconcile): ${String(err)}`,
      );
      return false;
    }
  }
}
