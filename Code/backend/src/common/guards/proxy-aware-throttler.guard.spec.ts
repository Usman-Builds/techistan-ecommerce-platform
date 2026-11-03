import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ProxyAwareThrottlerGuard } from './proxy-aware-throttler.guard';

class TestGuard extends ProxyAwareThrottlerGuard {
  tracker(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

describe('ProxyAwareThrottlerGuard.getTracker', () => {
  const original = process.env.PROXY_SECRET;
  let guard: TestGuard;

  beforeEach(() => {
    process.env.PROXY_SECRET = 'shh';
    guard = new TestGuard(
      [{ ttl: 60_000, limit: 100 }],
      new ThrottlerStorageService(),
      new Reflector(),
    );
  });

  afterAll(() => {
    if (original === undefined) delete process.env.PROXY_SECRET;
    else process.env.PROXY_SECRET = original;
  });

  it('keys by x-client-ip when the proxy secret matches', async () => {
    const req = {
      ip: '10.0.0.1',
      headers: { 'x-proxy-secret': 'shh', 'x-client-ip': '203.0.113.7' },
    };
    await expect(guard.tracker(req)).resolves.toBe('client:203.0.113.7');
  });

  it('ignores x-client-ip when the secret is wrong', async () => {
    const req = {
      ip: '10.0.0.1',
      headers: { 'x-proxy-secret': 'nope', 'x-client-ip': '203.0.113.7' },
    };
    await expect(guard.tracker(req)).resolves.toBe('10.0.0.1');
  });

  it('ignores x-client-ip when no secret is sent', async () => {
    const req = { ip: '10.0.0.1', headers: { 'x-client-ip': '203.0.113.7' } };
    await expect(guard.tracker(req)).resolves.toBe('10.0.0.1');
  });

  it('falls back to req.ip when PROXY_SECRET is unset', async () => {
    delete process.env.PROXY_SECRET;
    const req = {
      ip: '10.0.0.1',
      headers: { 'x-proxy-secret': '', 'x-client-ip': '203.0.113.7' },
    };
    await expect(guard.tracker(req)).resolves.toBe('10.0.0.1');
  });

  it('falls back to req.ip when the secret matches but no client IP is sent', async () => {
    const req = { ip: '10.0.0.1', headers: { 'x-proxy-secret': 'shh' } };
    await expect(guard.tracker(req)).resolves.toBe('10.0.0.1');
  });
});
