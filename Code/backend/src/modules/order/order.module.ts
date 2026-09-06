import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CouponModule } from '../coupon/coupon.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderController } from './order.controller';
import { AdminOrderController } from './admin-order.controller';
import { OrderService } from './order.service';
import { PricingService } from './pricing.service';
import { InvoiceService } from './invoice.service';

/**
 * Order module (scripts 10 + 11). PrismaModule + AuditModule are @Global. Imports
 * CartModule (read the checkout cart), CouponModule (re-validate the applied
 * coupon), and PaymentModule (create the PaymentIntent + refunds). Order lifecycle
 * emails + in-app notifications go through NotifierService (@Global via
 * NotificationModule). PaymentModule does NOT depend back on OrderModule — its
 * webhook confirms orders via Prisma directly — so there is no cycle.
 */
@Module({
  imports: [CartModule, CouponModule, PaymentModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService, PricingService, InvoiceService],
  exports: [OrderService],
})
export class OrderModule {}
