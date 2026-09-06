import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { CartModule } from '../cart/cart.module';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';

/**
 * Wishlist module (script 09, FR-307). Imports ProductModule for card hydration
 * (getCardsByIds) and CartModule for move-to-cart. PrismaModule is @Global.
 */
@Module({
  imports: [ProductModule, CartModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
