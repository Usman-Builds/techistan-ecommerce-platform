import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS transport STUB (script 16, FR-905 — Could / optional).
 *
 * Intentionally inert: unless SMS_ENABLED=true AND Twilio credentials are set,
 * every call just logs and returns. The interface is here so order-shipped /
 * delivered flows can opt into SMS later by dropping in the Twilio SDK behind
 * this same seam — no caller changes required. Never throws.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('sms.enabled') ?? false;
  }

  sendSms(to: string, body: string): void {
    if (!this.enabled) {
      this.logger.debug(`[sms:disabled] would send to ${to}: ${body}`);
      return;
    }
    // TODO(sms): initialize the Twilio client from config.sms.* and dispatch.
    this.logger.log(`[sms] → ${to}: ${body}`);
  }
}
