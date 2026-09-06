import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AccountDeletionCron } from './account-deletion.cron';

/**
 * Self-service GDPR module (script 17). PrismaModule + AuditModule are @Global,
 * so nothing needs importing here. Exports AccountService so the cron module can
 * expose a guarded on-demand anonymization trigger.
 */
@Module({
  controllers: [AccountController],
  providers: [AccountService, AccountDeletionCron],
  exports: [AccountService],
})
export class AccountModule {}
