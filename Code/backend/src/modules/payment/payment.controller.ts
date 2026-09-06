import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AdminOnly, CurrentUser } from '../../common';
import { PaymentService } from './payment.service';
import { RefundDto } from './dto/refund.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  /**
   * Stripe webhook (FR-414). NOT guarded — Stripe authenticates by signing the
   * request; we verify that signature against the RAW body (captured via
   * `rawBody: true` in main.ts). Always ack 200 on a handled/ignored event so
   * Stripe stops retrying; signature failures throw 400 so Stripe retries.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body.');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header.');
    }
    const event = this.payment.constructEvent(req.rawBody, signature);
    await this.payment.handleEvent(event);
    return { received: true };
  }

  /**
   * Refund an order — full (no body) or partial (`amountCents`). Admin-only; the
   * admin UI trigger lands in scripts 11/15.
   */
  @Post(':orderId/refund')
  @AdminOnly()
  async refund(
    @Param('orderId') orderId: string,
    @Body() dto: RefundDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.payment.processRefund(orderId, dto.amountCents, actorId);
  }
}
