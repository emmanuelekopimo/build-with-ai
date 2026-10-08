// Empties every table of a *_test / *_e2e database. Refuses any other database.
import { PrismaClient } from '@prisma/client';

export async function clearDatabase(prisma: PrismaClient, url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1);
  if (!/_(test|e2e)$/.test(name)) throw new Error(`Refusing to clear "${name}": only *_test or *_e2e databases.`);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe('SET session_replication_role = replica');
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT');
  for (const s of ['asset_tag_seq', 'ref_in_seq', 'ref_iss_seq', 'ref_rtr_seq', 'ref_mvt_seq', 'ref_ind_seq']) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE ${s} RESTART WITH 1`);
  }
}

if (process.argv[1]?.endsWith('clear-db.ts')) {
  const url = process.env.DATABASE_URL ?? '';
  const prisma = new PrismaClient();
  clearDatabase(prisma, url)
    .then(() => console.log('cleared'))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
