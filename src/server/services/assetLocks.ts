// Row locks and the one-active-form rule (D13).
import type { Asset } from '@prisma/client';
import type { Tx } from '../db';
import { conflict, notFound } from '../lib/errors';
import { FORM_STATUS_LABEL, type FormStatus } from '../../shared/constants';
import type { AssetState } from '../../shared/statusMachine';

/** SELECT … FOR UPDATE on the given assets (in id order to avoid deadlocks). */
export async function lockAssets(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const sorted = [...new Set(ids)].sort();
  await tx.$queryRawUnsafe(`SELECT id FROM "Asset" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, sorted);
}

export async function lockAssetByTag(tx: Tx, tag: string): Promise<Asset> {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "Asset" WHERE tag = $1 FOR UPDATE`, tag);
  if (!rows[0]) throw notFound(`Asset ${tag} was not found.`);
  return tx.asset.findUniqueOrThrow({ where: { id: rows[0].id } });
}

export function assetState(a: Pick<Asset, 'status' | 'repairFormId' | 'deletedAt'>): AssetState {
  return { status: a.status, inRepair: a.repairFormId !== null, deleted: a.deletedAt !== null };
}

export interface ActiveLock {
  formId: string;
  reference: string;
  status: FormStatus;
  type: string;
}

export async function activeLocks(tx: Tx, assetIds: string[]): Promise<Map<string, ActiveLock>> {
  const rows = await tx.formAsset.findMany({
    where: { assetId: { in: assetIds }, active: true },
    select: { assetId: true, form: { select: { id: true, reference: true, status: true, type: true } } },
  });
  return new Map(
    rows.map((r) => [r.assetId, { formId: r.form.id, reference: r.form.reference, status: r.form.status, type: r.form.type }]),
  );
}

export function lockMessage(tag: string, lock: ActiveLock): string {
  const state = lock.status === 'PENDING_APPROVAL' ? 'awaiting approval' : FORM_STATUS_LABEL[lock.status].toLowerCase();
  return `${tag} is already on ${lock.reference} (${state}). Finish or cancel that form first.`;
}

export async function assertNotOnActiveForm(tx: Tx, asset: Pick<Asset, 'id' | 'tag'>): Promise<void> {
  const lock = (await activeLocks(tx, [asset.id])).get(asset.id);
  if (lock) throw conflict(lockMessage(asset.tag, lock), { blockingReference: lock.reference });
}
