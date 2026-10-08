import type { NotificationKind, Prisma } from '@prisma/client';
import { db, type Tx } from '../db';

export type MessagePart = { t: string } | { b: string };

/** Notify every active IT user (admins and support). Deduplicated per user by `dedupeKey`. */
export async function notifyIT(
  n: { kind: NotificationKind; message: MessagePart[]; link?: string; dedupeKey?: string },
  tx?: Tx,
): Promise<void> {
  const client = tx ?? db();
  const users = await client.user.findMany({ where: { active: true, role: { in: ['IT_ADMIN', 'IT_SUPPORT'] } }, select: { id: true } });
  for (const u of users) {
    const data = {
      userId: u.id,
      kind: n.kind,
      message: n.message as unknown as Prisma.InputJsonValue,
      link: n.link,
      dedupeKey: n.dedupeKey,
    };
    if (n.dedupeKey) {
      await client.notification.upsert({
        where: { userId_dedupeKey: { userId: u.id, dedupeKey: n.dedupeKey } },
        update: {},
        create: data,
      });
    } else {
      await client.notification.create({ data });
    }
  }
}
