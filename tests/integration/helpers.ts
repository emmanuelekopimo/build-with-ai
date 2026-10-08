import argon2 from 'argon2';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { upsertReferenceData } from '../../prisma/reference';
import { createApp } from '../../src/server/app';
import { db } from '../../src/server/db';
import { clearOutbox } from '../../src/server/email/mailer';

export const PASSWORD = 'Correct-horse-42';

export const USERS: Record<Role, { email: string; name: string; title: string; office: string }> = {
  IT_ADMIN: { email: 'edidiong.okon@ecews.org', name: 'Edidiong Okon', title: 'IT Admin', office: 'Uyo' },
  IT_SUPPORT: { email: 'uwem.ekanem@ecews.org', name: 'Uwem Ekanem', title: 'IT Support', office: 'Ikot Ekpene' },
  VIEWER: { email: 'viewer@ecews.org', name: 'Aniekan Viewer', title: 'Programs Officer', office: 'Uyo' },
};

let hash: string | null = null;

export async function resetDb(): Promise<void> {
  const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  if (!/_(test|e2e)$/.test(dbName)) throw new Error(`resetDb refuses to clear "${dbName}" (not a _test/_e2e database).`);
  const tables = await db().$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // CustodyEvent has an append-only trigger; disable triggers for the test reset only.
  await db().$executeRawUnsafe(`SET session_replication_role = replica`);
  await db().$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await db().$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
  for (const s of ['asset_tag_seq', 'ref_in_seq', 'ref_iss_seq', 'ref_rtr_seq', 'ref_mvt_seq', 'ref_ind_seq']) {
    await db().$executeRawUnsafe(`ALTER SEQUENCE ${s} RESTART WITH 1`);
  }
  await upsertReferenceData(db());
  hash ??= await argon2.hash(PASSWORD);
  for (const [role, u] of Object.entries(USERS)) {
    await db().user.create({ data: { ...u, role: role as Role, passwordHash: hash } });
  }
  clearOutbox();
}

let app: ReturnType<typeof createApp> | null = null;
export function testApp() {
  app ??= createApp();
  return app;
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object, headers?: Record<string, string>) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  del: (url: string, body?: object) => request.Test;
}

export async function login(role: Role = 'IT_ADMIN'): Promise<Session> {
  const agent = request.agent(testApp());
  const res = await agent.post('/api/auth/login').send({ email: USERS[role].email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.csrfToken as string;
  return {
    agent,
    csrf,
    userId: res.body.user.id,
    get: (url) => agent.get(url),
    post: (url, body = {}, headers = {}) => agent.post(url).set('X-CSRF-Token', csrf).set(headers).send(body),
    patch: (url, body = {}) => agent.patch(url).set('X-CSRF-Token', csrf).send(body),
    del: (url, body = {}) => agent.delete(url).set('X-CSRF-Token', csrf).send(body),
  };
}
