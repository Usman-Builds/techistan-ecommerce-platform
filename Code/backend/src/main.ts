import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  // `rawBody: true` keeps the unparsed request bytes on `req.rawBody` (alongside
  // the normal parsed `req.body`), which the Stripe webhook needs to verify the
  // signature against the exact payload (script 10, FR-414).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Pass a signing secret so the guest cart cookie (script 09) can be SIGNED —
  // a tampered sessionId then lands in req.signedCookies as `false` and is
  // rejected. Unsigned cookies (auth JWTs, recently-viewed) still parse into
  // req.cookies as before.
  app.use(cookieParser(config.get<string>('cart.cookieSecret')));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties
      forbidNonWhitelisted: true, // throws error for extra properties
      transform: true, // transforms payloads to DTO instances
    }),
  );

  // CORS for the two Next.js clients (cookie-based JWT needs credentials).
  const origins = (
    config.get<string>('CLIENT_ORIGINS') ||
    'http://localhost:3001,http://localhost:3002'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // Containers stop by SIGTERM, and without this Node just exits: in-flight
  // requests are cut off and PrismaService.onModuleDestroy never runs, so the
  // pooled connections are dropped rather than closed. Registering the hooks
  // turns the signal into a normal Nest shutdown instead.
  app.enableShutdownHooks();

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
void bootstrap();
