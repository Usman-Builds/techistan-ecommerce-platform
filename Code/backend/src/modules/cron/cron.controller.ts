import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AbandonedCartService } from './abandoned-cart.service';
import { AccountService } from '../account/account.service';
import { CronSecretGuard } from './cron-secret.guard';

/**
 * Externally-invokable scheduled jobs (script 16, Task 8). Guarded by the shared
 * CRON_SECRET so an outside scheduler (or ops) can trigger a run in addition to
 * the in-process @Cron schedule. These live in the BACKEND — never a Next route.
 */
@UseGuards(CronSecretGuard)
@Controller('cron')
export class CronController {
  constructor(
    private readonly abandonedCart: AbandonedCartService,
    private readonly account: AccountService,
  ) {}

  @Post('abandoned-carts')
  @HttpCode(200)
  runAbandonedCarts() {
    return this.abandonedCart.run();
  }

  /** On-demand run of the GDPR anonymization sweep (script 17). */
  @Post('anonymize-accounts')
  @HttpCode(200)
  async runAnonymizeAccounts() {
    const anonymized = await this.account.anonymizeExpired();
    return { anonymized };
  }
}
