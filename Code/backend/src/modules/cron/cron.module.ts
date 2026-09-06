import { Module } from '@nestjs/common';
import { AbandonedCartService } from './abandoned-cart.service';
import { CronController } from './cron.controller';
import { CronSecretGuard } from './cron-secret.guard';
import { AccountModule } from '../account/account.module';

/**
 * Scheduled jobs (script 16). PrismaModule + EmailModule are @Global. ScheduleModule
 * is registered once at the app root; the @Cron decorator on AbandonedCartService
 * is discovered automatically. AccountModule is imported so the guarded cron
 * controller can trigger the GDPR anonymization sweep on demand (script 17).
 */
@Module({
  imports: [AccountModule],
  controllers: [CronController],
  providers: [AbandonedCartService, CronSecretGuard],
  exports: [AbandonedCartService],
})
export class CronModule {}
