import { existsSync } from 'node:fs';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Must match BCRYPT_COST in src/modules/auth/auth.constants.ts (≥12).
const BCRYPT_COST = 12;

/**
 * Load env for standalone seed runs. Prisma's CLI only loads `.env`, but the
 * ADMIN_* vars live in `.env.<NODE_ENV>` (e.g. `.env.development`). Load the
 * base file first, then let the env-specific file override.
 */
export function loadSeedEnv(): void {
  const files = ['.env', `.env.${process.env.NODE_ENV || 'development'}`];
  for (const file of files) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/**
 * Idempotently provision the preseeded admin (script 05). Reads ADMIN_EMAIL /
 * ADMIN_PASSWORD from the environment and upserts a SUPER_ADMIN with a bcrypt
 * (cost 12) password hash and a verified email. Re-running never duplicates and
 * never rewrites the existing password/role.
 *
 * To add more admins: change ADMIN_EMAIL/ADMIN_PASSWORD and re-run
 * `npm run seed:admin`, or extend this into a small CLI that accepts a target
 * role (ADMIN vs SUPER_ADMIN).
 */
export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'seedAdmin: ADMIN_EMAIL and ADMIN_PASSWORD must be set (check .env.development).',
    );
  }

  const hashed = await bcrypt.hash(password, BCRYPT_COST);

  const admin = await prisma.user.upsert({
    where: { email },
    // Keep an existing admin as-is (idempotent) — do not clobber a rotated
    // password or a manually-elevated role on re-run.
    update: {},
    create: {
      firstName: 'Super',
      lastName: 'Admin',
      email,
      password: hashed,
      provider: 'LOCAL',
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
    },
  });

  console.log(`✅ Admin ready: ${admin.email} (${admin.role})`);
}

/**
 * Force the preseeded admin's password to match the current ADMIN_PASSWORD env.
 *
 * `seedAdmin()` is deliberately idempotent (`update: {}`), so it never rewrites an
 * existing admin's password — which means changing ADMIN_PASSWORD in .env and
 * re-running `seed:admin` is a no-op for the password. Use this when you have
 * intentionally rotated the dev password and want the DB to reflect it. It also
 * re-asserts SUPER_ADMIN / verified / ACTIVE so a poked-at dev row can log in
 * again. Unlike seedAdmin() this does NOT create a missing row — it errors if the
 * admin doesn't exist yet (run `seed:admin` first).
 */
export async function resetAdminPassword(prisma: PrismaClient): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'resetAdminPassword: ADMIN_EMAIL and ADMIN_PASSWORD must be set (check .env.development).',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    throw new Error(
      `resetAdminPassword: no user for ${email}. Run \`npm run seed:admin\` first.`,
    );
  }

  const hashed = await bcrypt.hash(password, BCRYPT_COST);
  const admin = await prisma.user.update({
    where: { email },
    data: {
      password: hashed,
      provider: 'LOCAL',
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
      status: 'ACTIVE',
    },
  });

  console.log(`🔑 Admin password reset: ${admin.email} (${admin.role})`);
}
