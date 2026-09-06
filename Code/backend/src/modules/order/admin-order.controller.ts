import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminOnly, CurrentUser } from '../../common';
import type { AuthUser } from '../../common';
import { PaymentService } from '../payment/payment.service';
import { RefundDto } from '../payment/dto/refund.dto';
import { OrderService, OrderActor } from './order.service';
import { InvoiceService } from './invoice.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { SetTrackingDto } from './dto/set-tracking.dto';
import { AddNoteDto } from './dto/add-note.dto';
import { ResolveReturnDto } from './dto/create-return.dto';
import { AdminOrderQueryDto } from './dto/order-query.dto';

/**
 * Admin order management + fulfillment (script 11, Task 4). Every route is
 * `@AdminOnly()` (JwtAuthGuard + RolesGuard, ADMIN|SUPER_ADMIN) — RBAC is enforced
 * server-side, not just hidden in the client UI (NFR-208). All mutations write an
 * audit log inside the service.
 */
@AdminOnly()
@Controller('admin/orders')
export class AdminOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly payment: PaymentService,
    private readonly invoices: InvoiceService,
  ) {}

  private static actor(user: AuthUser): OrderActor {
    return { userId: user.userId, role: user.role };
  }

  /** List all orders with filters + pagination. */
  @Get()
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.listAdminOrders(query);
  }

  /** Full order detail incl. internal notes, tracking, returns, customer. */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.getAdminOrder(id);
  }

  /** Transition the order's status (fulfillment). */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.updateStatus(
      id,
      dto.status,
      dto.note,
      AdminOrderController.actor(user),
    );
  }

  /** Add an internal or customer-visible note. */
  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.addNote(id, dto, AdminOrderController.actor(user));
  }

  /** Set shipment tracking → creates a ShipmentEvent and ships the order. */
  @Post(':id/tracking')
  setTracking(
    @Param('id') id: string,
    @Body() dto: SetTrackingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.setTracking(id, dto, AdminOrderController.actor(user));
  }

  /** Full or partial refund via Stripe (script 10 PaymentService). */
  @Post(':id/refund')
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.payment.processRefund(id, dto.amountCents, user.userId);
    return this.orders.getAdminOrder(id);
  }

  /** Approve a return (restock + best-effort refund). */
  @Post(':id/return/:returnId/approve')
  approveReturn(
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Body() dto: ResolveReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.approveReturn(
      id,
      returnId,
      dto.note,
      AdminOrderController.actor(user),
    );
  }

  /** Reject a return. */
  @Post(':id/return/:returnId/reject')
  rejectReturn(
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Body() dto: ResolveReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.rejectReturn(
      id,
      returnId,
      dto.note,
      AdminOrderController.actor(user),
    );
  }

  /** Download the branded invoice PDF for any order. */
  @Get(':id/invoice')
  async invoice(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoices.generateInvoice(
      id,
      AdminOrderController.actor(user),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
