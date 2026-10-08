// npm run seed — creates a realistic, internally consistent dataset (docs/SPEC.md §6 of the brief).
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { config } from 'dotenv';
import { upsertReferenceData } from './reference';

config({ quiet: true } as Parameters<typeof config>[0]);
const prisma = new PrismaClient();

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Itams-Demo-2026';

async function main() {
  await upsertReferenceData(prisma);
  const passwordHash = await argon2.hash(SEED_PASSWORD);
  const users = [
    { email: 'edidiong.okon@ecews.org', name: 'Edidiong Okon', role: 'IT_ADMIN' as const, title: 'IT Admin', office: 'Uyo' },
    { email: 'uwem.ekanem@ecews.org', name: 'Uwem Ekanem', role: 'IT_SUPPORT' as const, title: 'IT Support', office: 'Ikot Ekpene' },
    { email: 'aniekan.udo@ecews.org', name: 'Aniekan Udo', role: 'VIEWER' as const, title: 'Programs Officer', office: 'Uyo' },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } });
  }
  console.log(`Seeded reference data and ${users.length} users (password: ${SEED_PASSWORD}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
