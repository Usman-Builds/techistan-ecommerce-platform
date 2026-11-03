import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { safeEqual } from '../utils/safe-equal';

/** Header carrying the shared secret that proves a request came from our own Next.js servers. */
export const PROXY_SECRET_HEADER = 'x-proxy-secret';
/** Header our Next.js servers set to the end user's IP, as seen at their own edge. */
export const CLIENT_IP_HEADER = 'x-client-ip';

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(
  req: Record<string, any>,
  name: string,
): string | undefined {
  const headers = req.headers as HeaderBag | undefined;
  const v = headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Rate-limit by the real end user, not by whoever opened the TCP connection.
 *
 * Both Next.js apps proxy `/api/*` here and also call this API from server
 * components, so without this every visitor of a frontend shares that
 * frontend server's single IP — and with it one 100/min bucket (and a site-wide
 * 5-per-15-min login limit). The frontends therefore forward the visitor's IP
 * in `x-client-ip`, authenticated by `x-proxy-secret` (env PROXY_SECRET).
 *
 * `x-client-ip` is honoured ONLY when the secret matches, so a caller cannot
 * pick its own bucket to dodge the login limit. Anything else — direct
 * callers, a missing/wrong secret, PROXY_SECRET unset — falls back to the
 * stock behaviour (`req.ip`).
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const expected = process.env.PROXY_SECRET;
    const provided = headerValue(req, PROXY_SECRET_HEADER);
    const clientIp = headerValue(req, CLIENT_IP_HEADER)?.trim();

    if (expected && provided && clientIp && safeEqual(provided, expected)) {
      return `client:${clientIp}`;
    }
    return super.getTracker(req);
  }
}
