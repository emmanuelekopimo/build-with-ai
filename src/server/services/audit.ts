import type { Prisma } from '@prisma/client';
import { db, type Tx } from '../db';

export async function audit(
  entry: {
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    detail?: Prisma.InputJsonValue;
    ipAddress?: string;
  },
  tx?: Tx,
): Promise<void> {
  await (tx ?? db()).auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: entry.detail ?? {},
      ipAddress: entry.ipAddress,
    },
  });
}
