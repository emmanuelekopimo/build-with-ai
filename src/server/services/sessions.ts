import type { Role, User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { env } from '../env';
import { addHours, hashToken, newToken } from '../lib/tokens';

export const SESSION_COOKIE = 'itams_sid';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  office: string;
}

export function toSessionUser(u: User): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, office: u.office };
}

export async function createSession(userId: string, ip: string, ua: string | undefined) {
  const { token, hash } = newToken();
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = addHours(new Date(), env().SESSION_IDLE_HOURS);
  await db().session.create({
    data: { tokenHash: hash, csrfToken, userId, expiresAt, ipAddress: ip, userAgent: ua?.slice(0, 300) },
  });
  return { token, csrfToken, expiresAt };
}

/** Look up a live session; slides the idle window (at most once a minute). */
export async function resolveSession(token: string) {
  const s = await db().session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s) return null;
  const now = new Date();
  if (s.expiresAt <= now || !s.user.active) {
    await db().session.deleteMany({ where: { id: s.id } });
    return null;
  }
  if (now.getTime() - s.lastSeenAt.getTime() > 60000) {
    const expiresAt = addHours(now, env().SESSION_IDLE_HOURS);
    await db().session.update({ where: { id: s.id }, data: { lastSeenAt: now, expiresAt } });
    s.expiresAt = expiresAt;
  }
  return s;
}

export async function destroySession(token: string): Promise<void> {
  await db().session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
