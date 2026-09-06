import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Email module (script 16). @Global — every domain module that fires a
 * transactional email (auth, order, payment, notification facade, cron) injects
 * EmailService without importing this module explicitly, mirroring AuditModule.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
