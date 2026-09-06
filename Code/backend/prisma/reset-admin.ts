import { PrismaClient } from '@prisma/client';
import { loadSeedEnv, resetAdminPassword } from './admin';

// Standalone entry for `npm run admin:reset` — forces the preseeded admin's
// password to match the current ADMIN_PASSWORD env. Use after rotating the dev
// password, since `seed:admin` is idempotent and won't rewrite it.
async function main() {
  loadSeedEnv();
  const prisma = new PrismaClient();
  try {
    await resetAdminPassword(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
