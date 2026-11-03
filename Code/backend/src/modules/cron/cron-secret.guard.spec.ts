import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronSecretGuard } from './cron-secret.guard';
import { safeEqual } from '../../common/utils/safe-equal';

jest.mock('../../common/utils/safe-equal', () => {
  const actual = jest.requireActual<
    typeof import('../../common/utils/safe-equal')
  >('../../common/utils/safe-equal');
  return { safeEqual: jest.fn(actual.safeEqual) };
});

/**
 * #37: the cron secret guards GDPR anonymisation and bulk email, so it must be
 * compared in constant time, like the proxy secret in the throttler guard.
 */
const SECRET = 'cron-secret-value';

function ctx(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guard(secret: string | undefined) {
  const config = { get: () => secret } as unknown as ConfigService;
  return new CronSecretGuard(config);
}

describe('CronSecretGuard', () => {
  beforeEach(() => jest.mocked(safeEqual).mockClear());

  it('returns 503 when CRON_SECRET is not configured', () => {
    expect(() =>
      guard(undefined).canActivate(ctx({ 'x-cron-secret': 'x' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects a missing secret with 401', () => {
    expect(() => guard(SECRET).canActivate(ctx({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong secret with 401, including one of the same length', () => {
    expect(() =>
      guard(SECRET).canActivate(ctx({ 'x-cron-secret': 'nope' })),
    ).toThrow(UnauthorizedException);
    const sameLength = SECRET.slice(0, -1) + 'X';
    expect(() =>
      guard(SECRET).canActivate(ctx({ authorization: `Bearer ${sameLength}` })),
    ).toThrow(UnauthorizedException);
  });

  it('accepts the secret as a Bearer token', () => {
    expect(
      guard(SECRET).canActivate(ctx({ authorization: `Bearer ${SECRET}` })),
    ).toBe(true);
  });

  it('accepts the secret in x-cron-secret', () => {
    expect(guard(SECRET).canActivate(ctx({ 'x-cron-secret': SECRET }))).toBe(
      true,
    );
  });

  it('compares the secret with the constant-time safeEqual', () => {
    guard(SECRET).canActivate(ctx({ 'x-cron-secret': SECRET }));
    expect(safeEqual).toHaveBeenCalledWith(SECRET, SECRET);
  });
});
