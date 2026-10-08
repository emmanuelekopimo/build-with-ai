// Append-only chain of custody. Every status change writes one of these in the same transaction.
import type { AssetStatus, CustodyEventType, Prisma } from '@prisma/client';
import type { Tx } from '../db';
import { now as clockNow } from '../lib/clock';

export interface CustodyInput {
  assetId: string;
  type: CustodyEventType;
  statusAfter: AssetStatus;
  actor: { id?: string | null; name: string };
  occurredAt?: Date;
  fromHolder?: string | null;
  toHolder?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  form?: { id: string; reference: string } | null;
  detail?: Record<string, unknown>;
}

export async function writeCustody(tx: Tx, e: CustodyInput): Promise<void> {
  await tx.custodyEvent.create({
    data: {
      assetId: e.assetId,
      type: e.type,
      statusAfter: e.statusAfter,
      actorUserId: e.actor.id ?? null,
      actorName: e.actor.name,
      occurredAt: e.occurredAt ?? clockNow(),
      fromHolder: e.fromHolder ?? null,
      toHolder: e.toHolder ?? null,
      fromLocation: e.fromLocation ?? null,
      toLocation: e.toLocation ?? null,
      formId: e.form?.id ?? null,
      formReference: e.form?.reference ?? null,
      detail: (e.detail ?? {}) as Prisma.InputJsonValue,
    },
  });
}
