import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** DI token for the shared Stripe client (null when no secret key is configured). */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Provides a single Stripe client built from `STRIPE_SECRET_KEY` (script 10,
 * Task 1). The secret key stays server-side; the client never sees it. When the
 * key is absent (dev before keys are wired) the provider resolves to `null` and
 * PaymentService throws a clear 503 at call time rather than failing to boot.
 */
export const StripeProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Stripe | null => {
    const key = config.get<string>('stripe.secretKey');
    if (!key) {
      new Logger('StripeProvider').warn(
        'STRIPE_SECRET_KEY not set — payment/checkout endpoints will return 503 until configured.',
      );
      return null;
    }
    // apiVersion omitted → uses the SDK's pinned default for the account.
    return new Stripe(key, { appInfo: { name: 'Techistan' } });
  },
};
