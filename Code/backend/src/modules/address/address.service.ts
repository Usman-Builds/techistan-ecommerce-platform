import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';

/**
 * Customer address book (script 10, FR-402). Backs the checkout shipping step's
 * saved-address picker. All routes are scoped to the authenticated user.
 */
@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: number) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(userId: number, dto: CreateAddressDto) {
    // Only one default at a time.
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.address.create({
      data: {
        userId,
        label: dto.label,
        fullName: dto.fullName,
        phone: dto.phone,
        line1: dto.line1,
        line2: dto.line2,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async remove(userId: number, id: string) {
    const { count } = await this.prisma.address.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Address not found');
    return { deleted: true };
  }
}
