/**
 * Integration-suite bootstrap. Runs before the test framework is installed so the
 * process env is fully populated before AppModule / PrismaClient evaluate. The
 * integration suite talks to a REAL Postgres (ecom_test) — never the dev/prod DB.
 * See test/README.md for the one-command invocation and DB strategy.
 */
import { config } from 'dotenv';
import { join } from 'path';

process.env.NODE_ENV = 'test';
config({ path: join(__dirname, '..', '.env.test') });

if (!process.env.DATABASE_URL || !/ecom_test/.test(process.env.DATABASE_URL)) {
  throw new Error(
    'Integration tests must run against the ecom_test database. ' +
      'Expected DATABASE_URL to point at ecom_test (see .env.test / test/README.md). ' +
      `Got: ${process.env.DATABASE_URL ?? '<unset>'}`,
  );
}
