import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { PrismaModule } from './prisma/prisma.module'; // if you already have it
import { UserModule } from './modules/user/user.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { MediaModule } from './modules/media/media.module';
import { AuditModule } from './modules/audit/audit.module';
import { ProductModule } from './modules/product/product.module';
import { CategoryModule } from './modules/category/category.module';
import { TagModule } from './modules/tag/tag.module';
import { SearchModule } from './modules/search/search.module';
import { RecentlyViewedModule } from './modules/recently-viewed/recently-viewed.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { PaymentModule } from './modules/payment/payment.module';
import { OrderModule } from './modules/order/order.module';
import { AddressModule } from './modules/address/address.module';
import { ReviewModule } from './modules/review/review.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CustomerModule } from './modules/customer/customer.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ExportModule } from './modules/export/export.module';
import { EmailModule } from './modules/email/email.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AccountModule } from './modules/account/account.module';
import { CronModule } from './modules/cron/cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 🌍 makes config available everywhere
      load: [configuration], // loads your configuration.ts
      validationSchema, // validates your .env with Joi
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`, // dynamic env
    }),

    // Rate limiting (NFR-205). Lenient global default; sensitive auth routes
    // tighten this to 5-attempts/15-min via @Throttle in auth.controller.
    ThrottlerModule.forRoot([{ ttl: 60 * 1000, limit: 100 }]),

    // Scheduled jobs (script 16) — powers the @Cron abandoned-cart recovery.
    ScheduleModule.forRoot(),

    PrismaModule,
    UserModule,
    AuthModule,
    MediaModule,
    AuditModule,
    ProductModule,
    CategoryModule,
    TagModule,
    SearchModule,
    RecentlyViewedModule,
    CouponModule,
    CartModule,
    WishlistModule,
    PaymentModule,
    OrderModule,
    AddressModule,
    ReviewModule,
    SettingsModule,
    StorefrontModule,
    AnalyticsModule,
    CustomerModule,
    InventoryModule,
    ExportModule,
    EmailModule,
    NotificationModule,
    AccountModule,
    CronModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply the throttler globally so @Throttle overrides take effect.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
