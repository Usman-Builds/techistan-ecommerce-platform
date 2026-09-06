import { Module } from '@nestjs/common';
import { CouponModule } from '../coupon/coupon.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StripeProvider } from './stripe.provider';

/**
 * Payment module (script 10). Owns the Stripe client, PaymentIntent creation, the
 * raw-body webhook, and refunds. PrismaModule + AuditModule are @Global;
 * CouponModule supplies redemption finalization at payment success. Exports
 * PaymentService so OrderModule can create an intent for a new order — no reverse
 * dependency (the webhook confirms orders via Prisma directly), so no cycle.
 */
@Module({
  imports: [CouponModule],
  controllers: [PaymentController],
  providers: [StripeProvider, PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
