// npm run user:create -- --email a@ecews.org --name "Full Name" --role IT_SUPPORT --title "IT Support" --office Uyo
// Prompts for nothing: the password is read from ITAMS_NEW_PASSWORD (never pass secrets as CLI arguments).
import argon2 from 'argon2';
import { config } from 'dotenv';
import { z } from 'zod';

config({ quiet: true } as Parameters<typeof config>[0]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email('--email must be a valid email'),
  name: z.string().trim().min(2, '--name is required'),
  role: z.enum(['IT_ADMIN', 'IT_SUPPORT', 'VIEWER'], { errorMap: () => ({ message: '--role must be IT_ADMIN, IT_SUPPORT or VIEWER' }) }),
  title: z.string().trim().min(2, '--title is required'),
  office: z.string().trim().min(2, '--office is required'),
  password: z
    .string({ required_error: 'Set ITAMS_NEW_PASSWORD in the environment' })
    .min(10, 'ITAMS_NEW_PASSWORD needs at least 10 characters')
    .regex(/[A-Za-z]/, 'ITAMS_NEW_PASSWORD needs a letter')
    .regex(/[0-9]/, 'ITAMS_NEW_PASSWORD needs a number'),
});

async function main() {
  const r = schema.safeParse({ email: arg('email'), name: arg('name'), role: arg('role'), title: arg('title'), office: arg('office'), password: process.env.ITAMS_NEW_PASSWORD });
  if (!r.success) {
    console.error(r.error.issues.map((i) => `- ${i.message}`).join('\n'));
    process.exit(1);
  }
  const { db, disconnectDb } = await import('../src/server/db');
  const { password, ...data } = r.data;
  const exists = await db().user.findUnique({ where: { email: data.email } });
  if (exists) {
    console.error(`A user with ${data.email} already exists.`);
    process.exit(1);
  }
  await db().user.create({ data: { ...data, passwordHash: await argon2.hash(password) } });
  console.log(`Created ${data.role} ${data.email}.`);
  await disconnectDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
