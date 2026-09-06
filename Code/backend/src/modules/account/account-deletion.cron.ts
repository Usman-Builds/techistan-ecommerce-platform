import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountService } from './account.service';

/**
 * Daily sweep that anonymizes accounts whose 30-day deletion grace window has
 * elapsed (script 17, FR-114). Runs IN THE BACKEND via @nestjs/schedule; the
 * same work is exposed for on-demand runs behind CRON_SECRET on the cron
 * controller. ScheduleModule.forRoot() is registered at the app root.
 */
@Injectable()
export class AccountDeletionCron {
  private readonly logger = new Logger(AccountDeletionCron.name);

  constructor(private readonly account: AccountService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'account-anonymize' })
  async handle(): Promise<void> {
    try {
      await this.account.anonymizeExpired();
    } catch (err) {
      this.logger.error(
        `Account anonymization sweep failed: ${(err as Error).message}`,
      );
    }
  }
}
