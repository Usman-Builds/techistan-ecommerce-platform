import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Boots the full Nest app the same way `main.ts` does (raw body, cookie-parser,
 * global ValidationPipe) so supertest exercises the real request pipeline. The
 * global ThrottlerGuard is stubbed out so a suite can hammer the auth routes
 * without tripping the 5-attempt lockout (rate limiting is asserted separately).
 */
export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.use(
    cookieParser(process.env.CART_COOKIE_SECRET || process.env.JWT_SECRET),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

/** Pull a named cookie value out of a supertest response's Set-Cookie header. */
export function readSetCookie(
  res: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  const value = hit.split(';')[0].slice(name.length + 1);
  return value;
}
