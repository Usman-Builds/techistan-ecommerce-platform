import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotifierService } from './notifier.service';
import { SmsService } from './sms.service';

/**
 * Notification module (script 16, FR-902..905). @Global so the domain services
 * (order, payment, review, inventory, auth) inject NotifierService/EmailService
 * without importing this module — the notification concern is cross-cutting, like
 * AuditModule. EmailModule is also @Global, supplying EmailService here.
 */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotifierService, SmsService],
  exports: [NotificationService, NotifierService],
})
export class NotificationModule {}
