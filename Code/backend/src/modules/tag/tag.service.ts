import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ensureUniqueSlug } from '../../common/utils/slug.util';
import { CreateTagDto } from './dto/create-tag.dto';
import { AttachTagDto } from './dto/attach-tag.dto';

@Injectable()
export class TagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Public list with product counts. */
  list() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { productTags: true } } },
    });
  }

  async create(dto: CreateTagDto, actorId?: number) {
    const slug = await ensureUniqueSlug(dto.slug || dto.name, (s) =>
      this.slugTaken(s),
    );
    const tag = await this.prisma.tag.create({
      data: { name: dto.name, slug },
    });
    await this.audit.record({
      actorId,
      action: 'tag.create',
      entityType: 'Tag',
      entityId: tag.id,
      metadata: { name: tag.name, slug: tag.slug },
    });
    return tag;
  }

  async attach(dto: AttachTagDto, actorId?: number) {
    await this.assertBothExist(dto.productId, dto.tagId);
    await this.prisma.productTag.upsert({
      where: {
        productId_tagId: { productId: dto.productId, tagId: dto.tagId },
      },
      create: { productId: dto.productId, tagId: dto.tagId },
      update: {},
    });
    await this.audit.record({
      actorId,
      action: 'tag.attach',
      entityType: 'Product',
      entityId: dto.productId,
      metadata: { tagId: dto.tagId },
    });
    return { attached: true };
  }

  async detach(dto: AttachTagDto, actorId?: number) {
    await this.prisma.productTag.deleteMany({
      where: { productId: dto.productId, tagId: dto.tagId },
    });
    await this.audit.record({
      actorId,
      action: 'tag.detach',
      entityType: 'Product',
      entityId: dto.productId,
      metadata: { tagId: dto.tagId },
    });
    return { detached: true };
  }

  private async assertBothExist(
    productId: string,
    tagId: string,
  ): Promise<void> {
    const [product, tag] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      }),
      this.prisma.tag.findUnique({
        where: { id: tagId },
        select: { id: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!tag) throw new BadRequestException('tagId does not exist.');
  }

  private slugTaken(slug: string): Promise<boolean> {
    return this.prisma.tag
      .findUnique({ where: { slug }, select: { id: true } })
      .then((t) => !!t);
  }
}
