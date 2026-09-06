import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, OptionalJwtAuthGuard } from '../../common';
import { CartService } from '../cart/cart.service';
import { CART_SESSION_COOKIE } from '../cart/cart.constants';
import { OrderService, OrderActor } from './order.service';
import { InvoiceService } from './invoice.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { OrderQueryDto } from './dto/order-query.dto';

/**
 * Customer + checkout order endpoints (scripts 10 + 11). `OptionalJwtAuthGuard`
 * serves both signed-in customers (cart keyed by userId) and guests (cart keyed
 * by the signed `cartSessionId` cookie), so guest checkout and guest confirmation
 * polling work on the same routes. Mutations that touch account-owned state
 * (cancel, return, history) require an authenticated user.
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly cart: CartService,
    private readonly invoices: InvoiceService,
  ) {}

  /** Create (or return the existing) order for this checkout attempt. */
  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
  ) {
    const cartId = await this.resolveCartId(user, req);
    return this.orders.createOrder(dto, user?.userId ?? null, cartId);
  }

  /** The signed-in customer's order history (filterable). */
  @Get()
  async list(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: OrderQueryDto,
  ) {
    if (!user) throw new UnauthorizedException('Sign in to view your orders.');
    return this.orders.listMyOrders(user.userId, query);
  }

  /** One order — for confirmation polling and history detail. */
  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.orders.getOrder(id, OrderController.actor(user));
  }

  /** Customer self-cancel (unpaid orders only). */
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    const actor = OrderController.requireActor(user);
    return this.orders.cancelOrder(id, actor);
  }

  /** Request a return on an eligible (delivered) order. */
  @Post(':id/return')
  async requestReturn(
    @Param('id') id: string,
    @Body() dto: CreateReturnDto,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    const actor = OrderController.requireActor(user);
    return this.orders.requestReturn(id, actor, dto);
  }

  /** Download the order invoice PDF (own order, or guest order by id). */
  @Get(':id/invoice')
  async invoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoices.generateInvoice(
      id,
      OrderController.actor(user),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  // ─────────────────────────── helpers ───────────────────────────

  private static actor(user: AuthUser | undefined): OrderActor | null {
    return user ? { userId: user.userId, role: user.role } : null;
  }

  private static requireActor(user: AuthUser | undefined): OrderActor {
    if (!user) throw new UnauthorizedException('Sign in to manage your orders.');
    return { userId: user.userId, role: user.role };
  }

  /** Resolve the caller's cart id (customer by userId, guest by signed cookie). */
  private async resolveCartId(
    user: AuthUser | undefined,
    req: Request,
  ): Promise<string | null> {
    if (user) {
      const cart = await this.cart.getUserCart(user.userId);
      return cart?.id ?? null;
    }
    const signed = (req as Request & { signedCookies?: Record<string, unknown> })
      .signedCookies;
    const sessionId = signed?.[CART_SESSION_COOKIE];
    if (typeof sessionId !== 'string' || !sessionId.length) return null;
    const cart = await this.cart.getSessionCart(sessionId);
    return cart?.id ?? null;
  }
}
