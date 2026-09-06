import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common';
import type { AuthUser } from '../../common';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

/**
 * Wishlist endpoints (FR-307). Customer-only: `JwtAuthGuard` rejects guests with
 * 401 and `RolesGuard` + `@Roles(CUSTOMER)` scopes it to customers (SUPER_ADMIN
 * passes as a superset). Every route is keyed to the authenticated user's id, so
 * a customer can only ever touch their own wishlist.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.wishlist.list(user.userId);
  }

  @Post('items')
  add(@Body() dto: AddWishlistItemDto, @CurrentUser() user: AuthUser) {
    return this.wishlist.add(user.userId, dto.productId);
  }

  @Delete('items/:productId')
  remove(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.wishlist.remove(user.userId, productId);
  }

  @Post('items/:productId/move-to-cart')
  @HttpCode(200)
  moveToCart(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.wishlist.moveToCart(user.userId, productId);
  }
}
