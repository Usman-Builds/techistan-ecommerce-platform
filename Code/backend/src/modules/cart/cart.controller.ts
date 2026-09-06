import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, OptionalJwtAuthGuard } from '../../common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { EstimateShippingDto } from './dto/estimate-shipping.dto';
import { CART_COOKIE_MAX_AGE, CART_SESSION_COOKIE } from './cart.constants';

/**
 * Cart endpoints (script 09). `OptionalJwtAuthGuard` populates `req.user` when a
 * customer is signed in but never rejects, so the same routes serve customers
 * (DB cart keyed by userId) and guests (DB cart keyed by a SIGNED httpOnly
 * `cartSessionId` cookie). Reads never create a row; mutations create-on-demand.
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async get(
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.resolveForRead(user, req);
    return cartId ? this.cart.buildView(cartId) : CartService.emptyView();
  }

  @Post('items')
  async addItem(
    @Body() dto: AddCartItemDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cartId = await this.resolveForWrite(user, req, res);
    return this.cart.addItem(cartId, dto.variantId, dto.quantity);
  }

  @Patch('items/:itemId')
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.requireCart(user, req);
    return this.cart.updateItem(cartId, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.requireCart(user, req);
    return this.cart.removeItem(cartId, itemId);
  }

  @Delete()
  async clear(
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.resolveForRead(user, req);
    return cartId ? this.cart.clear(cartId) : CartService.emptyView();
  }

  @Post('coupon')
  async applyCoupon(
    @Body() dto: ApplyCouponDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cartId = await this.resolveForWrite(user, req, res);
    return this.cart.applyCoupon(cartId, dto.code);
  }

  @Delete('coupon')
  async removeCoupon(
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.requireCart(user, req);
    return this.cart.removeCoupon(cartId);
  }

  @Post('estimate-shipping')
  @HttpCode(200)
  async estimateShipping(
    @Body() dto: EstimateShippingDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.resolveForRead(user, req);
    if (!cartId) {
      return { amountCents: 0, label: 'Add items to estimate', currency: 'USD', subtotal: 0 };
    }
    return this.cart.estimateShipping(cartId, dto);
  }

  // ── Cart resolution ─────────────────────────────────────────────────────────

  /** Resolve an existing cart id for reads (no row is created). */
  private async resolveForRead(
    user: AuthUser | undefined,
    req: Request,
  ): Promise<string | null> {
    if (user) {
      const cart = await this.cart.getUserCart(user.userId);
      return cart?.id ?? null;
    }
    const sessionId = this.readSession(req);
    if (!sessionId) return null;
    const cart = await this.cart.getSessionCart(sessionId);
    return cart?.id ?? null;
  }

  /** Resolve (creating on demand) a cart id for mutations. */
  private async resolveForWrite(
    user: AuthUser | undefined,
    req: Request,
    res: Response,
  ): Promise<string> {
    if (user) {
      const cart = await this.cart.getOrCreateUserCart(user.userId);
      return cart.id;
    }
    const sessionId = this.readSession(req);
    if (sessionId) {
      const existing = await this.cart.getSessionCart(sessionId);
      if (existing) return existing.id;
    }
    const fresh = randomUUID();
    const created = await this.cart.createSessionCart(fresh);
    this.setSession(res, fresh);
    return created.id;
  }

  /** Like resolveForRead but 404s when the caller has no cart. */
  private async requireCart(
    user: AuthUser | undefined,
    req: Request,
  ): Promise<string> {
    const cartId = await this.resolveForRead(user, req);
    if (!cartId) throw new NotFoundException('Cart not found');
    return cartId;
  }

  // ── Signed guest cookie helpers ──────────────────────────────────────────────

  private readSession(req: Request): string | undefined {
    const signed = (req as Request & { signedCookies?: Record<string, unknown> })
      .signedCookies;
    const value = signed?.[CART_SESSION_COOKIE];
    return typeof value === 'string' && value.length ? value : undefined;
  }

  private setSession(res: Response, sessionId: string): void {
    res.cookie(CART_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: this.config.get<string>('app.environment') === 'production',
      path: '/',
      maxAge: CART_COOKIE_MAX_AGE,
    });
  }
}
