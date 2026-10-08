// Asset registry queries and the manual lifecycle actions (report damage, retire, delete).
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  DAMAGE_REPORT_CONDITIONS,
  NOTE_MIN_LENGTH,
  RETIRE_REASON_LABEL,
  RETIRE_REASONS,
} from '../../shared/constants';
import { can, ACTION_PERMISSION, PERMISSION_MESSAGE } from '../../shared/permissions';
import { formEligibility, stateActions, transition, type AssetAction, type FormSlot } from '../../shared/statusMachine';
import { db, withTx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { SessionUser } from './sessions';
import { activeLocks, assertNotOnActiveForm, assetState, lockAssetByTag, lockMessage } from './assetLocks';
import { audit } from './audit';
import { writeCustody } from './custody';
import { notifyIT } from './notifications';
import { now as clockNow } from '../lib/clock';

export const PICKER_SLOTS = {
  ISSUANCE: { form: 'ISSUANCE' },
  RETURN_STAFF: { form: 'RETURN', returner: 'STAFF' },
  RETURN_VENDOR: { form: 'RETURN', returner: 'VENDOR' },
  MOVEMENT_STAFF: { form: 'MOVEMENT', to: 'STAFF' },
  MOVEMENT_LOCATION: { form: 'MOVEMENT', to: 'LOCATION' },
  MOVEMENT_VENDOR: { form: 'MOVEMENT', to: 'VENDOR' },
} as const satisfies Record<string, FormSlot>;
export type PickerFor = keyof typeof PICKER_SLOTS;

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().uuid().optional(),
  group: z.string().max(40).optional(),
  status: z.enum(['IN_STORE', 'ISSUED', 'DAMAGED', 'IN_REPAIR', 'RETIRED', 'DELETED']).optional(),
  project: z.string().uuid().optional(),
  location: z.string().uuid().optional(),
  holder: z.string().uuid().optional(),
  addedFrom: z.string().date().optional(),
  addedTo: z.string().date().optional(),
  for: z.enum(Object.keys(PICKER_SLOTS) as [PickerFor, ...PickerFor[]]).optional(),
  sort: z.enum(['tag', 'description', 'makeModel', 'serial', 'status', 'holder', 'project', 'added']).default('tag'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListQuery = z.infer<typeof listQuery>;

const assetInclude = {
  category: { select: { id: true, name: true, group: true, icon: true } },
  project: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  currentHolder: {
    select: { id: true, name: true, type: true, department: true, email: true, staffId: true, company: true, position: true },
  },
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;

/** Lagos day boundaries for date filters (WAT = UTC+1, no DST). */
const watStart = (d: string) => new Date(`${d}T00:00:00+01:00`);
const watEnd = (d: string) => new Date(new Date(`${d}T00:00:00+01:00`).getTime() + 86400000);

export function buildWhere(q: ListQuery, user: SessionUser): Prisma.AssetWhereInput {
  const and: Prisma.AssetWhereInput[] = [];
  if (q.status === 'DELETED') {
    if (!can(user.role, 'asset.viewDeleted')) throw forbidden('Only IT Admin can view deleted assets.');
    and.push({ deletedAt: { not: null } });
  } else {
    and.push({ deletedAt: null });
    if (q.status === 'IN_REPAIR') and.push({ status: 'DAMAGED', repairFormId: { not: null } });
    else if (q.status) and.push({ status: q.status });
  }
  if (q.q) {
    const term = q.q;
    and.push({
      OR: [
        { tag: { contains: term, mode: 'insensitive' } },
        { serial: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { makeModel: { contains: term, mode: 'insensitive' } },
        { currentHolder: { name: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }
  if (q.category) and.push({ categoryId: q.category });
  if (q.group) and.push({ category: { group: q.group } });
  if (q.project) and.push({ projectId: q.project });
  if (q.location) and.push({ locationId: q.location });
  if (q.holder) and.push({ currentHolderId: q.holder });
  if (q.addedFrom) and.push({ createdAt: { gte: watStart(q.addedFrom) } });
  if (q.addedTo) and.push({ createdAt: { lt: watEnd(q.addedTo) } });
  if (q.for) {
    // Pickers only offer assets in the right state (§4.2).
    const slot = PICKER_SLOTS[q.for];
    if (slot.form === 'ISSUANCE') and.push({ status: 'IN_STORE' });
    else if (slot.form === 'RETURN')
      and.push(slot.returner === 'STAFF' ? { status: 'ISSUED' } : { status: 'DAMAGED', repairFormId: { not: null } });
    else if (slot.to === 'VENDOR') and.push({ status: 'DAMAGED', repairFormId: null });
    else if (slot.to === 'STAFF') and.push({ status: 'ISSUED' });
    else and.push({ status: { in: ['ISSUED', 'IN_STORE'] } });
  }
  return { AND: and };
}

function orderBy(q: ListQuery): Prisma.AssetOrderByWithRelationInput[] {
  const d = q.dir;
  switch (q.sort) {
    case 'description':
      return [{ description: d }, { tagNumber: 'asc' }];
    case 'makeModel':
      return [{ makeModel: d }, { tagNumber: 'asc' }];
    case 'serial':
      return [{ serial: d }, { tagNumber: 'asc' }];
    case 'status':
      return [{ status: d }, { tagNumber: 'asc' }];
    case 'holder':
      return [{ currentHolder: { name: d } }, { tagNumber: 'asc' }];
    case 'project':
      return [{ project: { name: d } }, { tagNumber: 'asc' }];
    case 'added':
      return [{ createdAt: d }, { tagNumber: d }];
    default:
      return [{ tagNumber: d }];
  }
}

export function serializeAsset(a: AssetRow) {
  return {
    id: a.id,
    tag: a.tag,
    description: a.description,
    makeModel: a.makeModel,
    serial: a.serial,
    status: a.status,
    inRepair: a.repairFormId !== null,
    damageOrigin: a.damageOrigin,
    condition: a.condition,
    category: a.category,
    project: a.project,
    location: a.location,
    holder: a.currentHolder,
    oemSupport: a.oemSupport,
    unitCost: a.unitCost === null ? null : Number(a.unitCost),
    createdAt: a.createdAt,
    deletedAt: a.deletedAt,
    retireReason: a.retireReason,
  };
}

export async function listAssets(q: ListQuery, user: SessionUser) {
  const where = buildWhere(q, user);
  const [total, grandTotal, rows] = await Promise.all([
    db().asset.count({ where }),
    db().asset.count({ where: { deletedAt: null } }),
    db().asset.findMany({
      where,
      include: assetInclude,
      orderBy: orderBy(q),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  const locks = await activeLocks(db(), rows.map((r) => r.id));
  const items = rows.map((r) => {
    const lock = locks.get(r.id);
    const base = { ...serializeAsset(r), activeForm: lock ? { reference: lock.reference, status: lock.status } : null };
    if (!q.for) return base;
    const elig = formEligibility(assetState(r), PICKER_SLOTS[q.for]);
    const reason = lock ? lockMessage(r.tag, lock) : elig.ok ? null : elig.message;
    return { ...base, available: !reason, unavailableReason: reason };
  });
  return { items, total, grandTotal, page: q.page, pageSize: q.pageSize };
}

export type ActionView = {
  action: AssetAction;
  primary: boolean;
  enabled: boolean;
  reason: string | null;
  blockingReference: string | null;
};

export async function getAssetDetail(tag: string, user: SessionUser) {
  const asset = await db().asset.findUnique({
    where: { tag },
    include: {
      ...assetInclude,
      intakeLineItem: {
        include: { intake: { include: { project: true, checks: { orderBy: { question: 'asc' } } } } },
      },
      custodyEvents: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!asset || (asset.deletedAt && !can(user.role, 'asset.viewDeleted'))) throw notFound(`Asset ${tag} was not found.`);

  const lock = (await activeLocks(db(), [asset.id])).get(asset.id) ?? null;
  const [currentForm, repairForm] = await Promise.all([
    asset.currentFormId ? db().form.findUnique({ where: { id: asset.currentFormId }, select: { reference: true, type: true } }) : null,
    asset.repairFormId
      ? db().form.findUnique({ where: { id: asset.repairFormId }, select: { reference: true, expectedReturn: true, data: true } })
      : null,
  ]);

  const state = assetState(asset);
  const actions: ActionView[] = stateActions(state)
    .filter((a) => {
      const perm = ACTION_PERMISSION[a];
      // Retire / Repair / Delete are hidden (not just disabled) for roles without them (§4.3).
      return can(user.role, perm);
    })
    .map((a, i) => {
      // Receive back is the one form an in-repair asset may join; the repair movement itself is final.
      const blocked = lock !== null;
      return {
        action: a,
        primary: i === 0,
        enabled: !blocked,
        reason: blocked ? lockMessage(asset.tag, lock) : null,
        blockingReference: lock?.reference ?? null,
      };
    });

  const events = asset.custodyEvents;
  const totals = {
    intake: events.filter((e) => e.type === 'INTAKE_VALIDATED' || e.type === 'INTAKE_FAILED').length,
    issuances: events.filter((e) => e.type === 'ISSUED' || e.type === 'REISSUED').length,
    movements: events.filter((e) => e.type === 'MOVED' || e.type === 'SENT_FOR_REPAIR').length,
    returns: events.filter((e) => e.type === 'RETURNED' || e.type === 'REPAIRED' || e.type === 'REPAIR_FAILED').length,
  };

  const intake = asset.intakeLineItem?.intake;
  return {
    asset: serializeAsset(asset),
    currentForm,
    repair: repairForm
      ? {
          reference: repairForm.reference,
          expectedReturn: repairForm.expectedReturn,
          vendor: ((repairForm.data as Record<string, unknown>)?.to as { name?: string } | undefined)?.name ?? null,
        }
      : null,
    activeForm: lock,
    actions,
    timeline: events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt,
      actorName: e.actorName,
      fromHolder: e.fromHolder,
      toHolder: e.toHolder,
      fromLocation: e.fromLocation,
      toLocation: e.toLocation,
      formReference: e.formReference,
      statusAfter: e.statusAfter,
      detail: e.detail,
    })),
    intake: intake
      ? {
          reference: intake.reference,
          supplier: intake.supplier,
          poReference: intake.poReference,
          deliveryLocation: intake.deliveryLocation,
          deliveryDate: intake.deliveryDate,
          project: intake.project?.name ?? null,
          validatedBy: intake.validatedByName,
          validatedAt: intake.validatedAt,
          oemSupport: asset.oemSupport,
          result: asset.intakeLineItem?.result ?? null,
          checks: intake.checks.map((c) => ({ question: c.question, answer: c.answer, remark: c.remark })),
        }
      : null,
    totals,
  };
}

const actor = (u: SessionUser) => ({ id: u.id, name: u.name });

export const reportDamageBody = z.object({
  condition: z.enum(DAMAGE_REPORT_CONDITIONS, { errorMap: () => ({ message: 'Choose the condition assessed.' }) }),
  notes: z
    .string()
    .trim()
    .min(NOTE_MIN_LENGTH, `Describe the damage in at least ${NOTE_MIN_LENGTH} characters.`)
    .max(2000),
});

export async function reportDamage(tag: string, body: z.infer<typeof reportDamageBody>, user: SessionUser, ip: string) {
  return withTx(async (tx) => {
    const asset = await lockAssetByTag(tx, tag);
    if (asset.deletedAt) throw notFound(`Asset ${tag} was not found.`);
    await assertNotOnActiveForm(tx, asset);
    const t = transition(assetState(asset), { type: 'REPORT_DAMAGE' });
    if (!t.ok) throw conflict(t.message);
    const holder = asset.currentHolderId ? await tx.person.findUnique({ where: { id: asset.currentHolderId } }) : null;
    const location = await tx.location.findUniqueOrThrow({ where: { id: asset.locationId } });
    const now = clockNow();
    await tx.asset.update({
      where: { id: asset.id },
      data: { status: 'DAMAGED', damageOrigin: 'REPORTED', damagedAt: now, condition: body.condition },
    });
    await writeCustody(tx, {
      assetId: asset.id,
      type: 'DAMAGE_REPORTED',
      statusAfter: 'DAMAGED',
      actor: actor(user),
      occurredAt: now,
      fromHolder: holder?.name,
      toHolder: holder?.name,
      fromLocation: location.name,
      toLocation: location.name,
      detail: { condition: body.condition, notes: body.notes, previousStatus: asset.status },
    });
    await notifyIT(
      {
        kind: 'DAMAGE',
        message: [{ b: asset.tag }, { t: ' reported damaged — needs repair or retirement' }],
        link: `/assets/${asset.tag}`,
      },
      tx,
    );
    await audit({ userId: user.id, action: 'asset.report_damage', entityType: 'Asset', entityId: asset.id, detail: body, ipAddress: ip }, tx);
    return { tag: asset.tag, status: 'DAMAGED' as const };
  });
}

export const retireBody = z.object({
  reason: z.enum(RETIRE_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }),
  notes: z.string().trim().min(NOTE_MIN_LENGTH, `Add notes of at least ${NOTE_MIN_LENGTH} characters.`).max(2000),
});

export async function retireAsset(tag: string, body: z.infer<typeof retireBody>, user: SessionUser, ip: string) {
  if (!can(user.role, 'asset.retire')) throw forbidden(PERMISSION_MESSAGE['asset.retire']);
  return withTx(async (tx) => {
    const asset = await lockAssetByTag(tx, tag);
    if (asset.deletedAt) throw notFound(`Asset ${tag} was not found.`);
    await assertNotOnActiveForm(tx, asset);
    const t = transition(assetState(asset), { type: 'RETIRE' });
    if (!t.ok) throw conflict(t.message);
    const holder = asset.currentHolderId ? await tx.person.findUnique({ where: { id: asset.currentHolderId } }) : null;
    const location = await tx.location.findUniqueOrThrow({ where: { id: asset.locationId } });
    const now = clockNow();
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: 'RETIRED',
        damageOrigin: null,
        repairFormId: null,
        currentHolderId: null,
        currentFormId: null,
        retireReason: body.reason,
        retiredAt: now,
      },
    });
    await writeCustody(tx, {
      assetId: asset.id,
      type: 'RETIRED',
      statusAfter: 'RETIRED',
      actor: actor(user),
      occurredAt: now,
      fromHolder: holder?.name,
      fromLocation: location.name,
      toLocation: location.name,
      detail: { reason: body.reason, reasonLabel: RETIRE_REASON_LABEL[body.reason], notes: body.notes, wasInRepair: asset.repairFormId !== null },
    });
    await audit({ userId: user.id, action: 'asset.retire', entityType: 'Asset', entityId: asset.id, detail: body, ipAddress: ip }, tx);
    return { tag: asset.tag, status: 'RETIRED' as const };
  });
}

export const deleteBody = z.object({
  confirmTag: z.string().trim(),
  reason: z.string().trim().min(NOTE_MIN_LENGTH, `Give a reason of at least ${NOTE_MIN_LENGTH} characters.`).max(2000),
});

/** Soft delete (D26). Custody events, forms and signatures are kept. */
export async function deleteAsset(tag: string, body: z.infer<typeof deleteBody>, user: SessionUser, ip: string) {
  if (!can(user.role, 'asset.delete')) throw forbidden(PERMISSION_MESSAGE['asset.delete']);
  if (body.confirmTag !== tag) throw badRequest(`Type ${tag} exactly to confirm.`, { fields: { confirmTag: `Type ${tag} exactly to confirm.` } });
  return withTx(async (tx) => {
    const asset = await lockAssetByTag(tx, tag);
    if (asset.deletedAt) throw conflict(`${tag} is already deleted.`);
    await assertNotOnActiveForm(tx, asset);
    const t = transition(assetState(asset), { type: 'DELETE' });
    if (!t.ok) throw conflict(t.message);
    const now = clockNow();
    await tx.asset.update({ where: { id: asset.id }, data: { deletedAt: now, deletedById: user.id, deleteReason: body.reason } });
    await writeCustody(tx, {
      assetId: asset.id,
      type: 'DELETED',
      statusAfter: 'RETIRED',
      actor: actor(user),
      occurredAt: now,
      detail: { reason: body.reason },
    });
    await audit({ userId: user.id, action: 'asset.delete', entityType: 'Asset', entityId: asset.id, detail: { reason: body.reason }, ipAddress: ip }, tx);
    return { tag: asset.tag, deleted: true };
  });
}
