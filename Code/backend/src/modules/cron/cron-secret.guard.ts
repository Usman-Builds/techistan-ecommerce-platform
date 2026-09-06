import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Authorizes the externally-invokable POST /cron/* routes (script 16, Task 8).
 * Accepts the shared secret as `Authorization: Bearer <secret>` OR an
 * `x-cron-secret: <secret>` header. The secret must be configured (CRON_SECRET) —
 * an unset secret rejects with 503 so the route can never be called anonymously.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.config.get<string>('cron.secret');
    if (!configured) {
      throw new ServiceUnavailableException(
        'Cron routes are disabled: set CRON_SECRET to enable them.',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    const bearer =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : undefined;
    const custom = req.headers['x-cron-secret'];
    const provided =
      bearer ?? (typeof custom === 'string' ? custom : undefined);

    if (!provided || provided !== configured) {
      throw new UnauthorizedException('Invalid cron secret');
    }
    return true;
  }
}
