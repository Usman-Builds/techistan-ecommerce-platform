import { PrismaClient } from '@prisma/client';
import { loadSeedEnv, seedAdmin } from './admin';

// Standalone entry for `npm run seed:admin` — provisions ONLY the admin account
// (no catalog/store seed). Safe to run in any environment.
async function main() {
  loadSeedEnv();
  const prisma = new PrismaClient();
  try {
    await seedAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
