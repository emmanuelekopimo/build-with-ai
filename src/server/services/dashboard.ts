// Dashboard read model (Dashboard.png). Every number is computed from the database.
import { DAMAGE_ORIGIN_LABEL } from '../../shared/constants';
import { isoDateWAT } from '../../shared/format';
import { db } from '../db';
import { now as clockNow } from '../lib/clock';
import { snapshotOf } from './forms/core';
import { recipientOf } from './forms/views';

function watBounds(now: Date) {
  const today = isoDateWAT(now);
  const startOfDay = new Date(`${today}T00:00:00+01:00`);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const startOfMonth = new Date(`${today.slice(0, 8)}01T00:00:00+01:00`);
  return { today, startOfDay, endOfDay, startOfMonth };
}

export interface AttentionRow {
  key: string;
  reference: string | null;
  reason: 'DAMAGED' | 'FAILED_INTAKE' | 'OVERDUE';
  reasonLabel: string;
  tag: string;
  makeModel: string;
  since: Date;
}

/** Damaged assets not yet sent for repair, and vendor repairs past their expected return (D27). */
export async function needsAttention(now = clockNow()): Promise<AttentionRow[]> {
  const today = isoDateWAT(now);
  const damaged = await db().asset.findMany({
    where: { status: 'DAMAGED', repairFormId: null, deletedAt: null },
    include: {
      intakeLineItem: { include: { intake: { select: { reference: true } } } },
      custodyEvents: { where: { type: { in: ['DAMAGE_REPORTED', 'RETURNED', 'INTAKE_FAILED', 'REPAIR_FAILED', 'REINSTATED_FOR_REPAIR'] } }, orderBy: { occurredAt: 'desc' }, take: 1 },
    },
  });
  const rows: AttentionRow[] = damaged.map((a) => {
    const e = a.custodyEvents[0];
    const failed = a.damageOrigin === 'INTAKE_FAILURE';
    return {
      key: `d-${a.id}`,
      reference: e?.formReference ?? (failed ? (a.intakeLineItem?.intake.reference ?? null) : null),
      reason: failed ? 'FAILED_INTAKE' : 'DAMAGED',
      reasonLabel: failed ? DAMAGE_ORIGIN_LABEL.INTAKE_FAILURE : 'Damaged',
      tag: a.tag,
      makeModel: a.makeModel,
      since: a.damagedAt ?? e?.occurredAt ?? a.updatedAt,
    };
  });
  const repairs = await db().asset.findMany({ where: { repairFormId: { not: null }, deletedAt: null } });
  if (repairs.length) {
    const forms = new Map(
      (await db().form.findMany({ where: { id: { in: repairs.map((r) => r.repairFormId!) } } })).map((f) => [f.id, f]),
    );
    for (const a of repairs) {
      const f = forms.get(a.repairFormId!);
      if (!f?.expectedReturn || isoDateWAT(f.expectedReturn) >= today) continue;
      rows.push({ key: `o-${a.id}`, reference: f.reference, reason: 'OVERDUE', reasonLabel: 'Overdue', tag: a.tag, makeModel: a.makeModel, since: f.expectedReturn });
    }
  }
  return rows.sort((x, y) => x.since.getTime() - y.since.getTime());
}

export async function dashboard(now = clockNow()) {
  const { endOfDay, startOfMonth, today } = watBounds(now);
  const live = { deletedAt: null };
  const [inStore, addedThisMonth, issued, underRepair, awaiting, overdueToday, projects, recent, attention, repairForms] = await Promise.all([
    db().asset.count({ where: { ...live, status: 'IN_STORE' } }),
    db().asset.count({ where: { ...live, createdAt: { gte: startOfMonth } } }),
    db().asset.count({ where: { ...live, status: 'ISSUED' } }),
    db().asset.count({ where: { ...live, status: 'DAMAGED', repairFormId: { not: null } } }),
    db().form.count({ where: { status: { in: ['AWAITING', 'PENDING_APPROVAL'] } } }),
    db().form.count({ where: { status: { in: ['AWAITING', 'PENDING_APPROVAL', 'PARTIAL'] }, deadline: { lt: endOfDay } } }),
    db().project.findMany({ include: { _count: { select: { assets: { where: live } } } } }),
    db().form.findMany({
      where: { status: { notIn: ['DRAFT'] }, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      take: 3,
      include: { assets: { orderBy: { position: 'asc' }, take: 1 } },
    }),
    needsAttention(now),
    db().asset.findMany({ where: { ...live, repairFormId: { not: null } }, select: { repairFormId: true } }),
  ]);
  // D48: "awaiting parts" = in-repair assets still at the vendor after their expected return date.
  const repairExpected = await db().form.findMany({ where: { id: { in: repairForms.map((r) => r.repairFormId!) } }, select: { expectedReturn: true } });
  const awaitingParts = repairExpected.filter((f) => f.expectedReturn && isoDateWAT(f.expectedReturn) < today).length;

  return {
    today: now,
    kpis: { inStore, addedThisMonth, issued, underRepair, awaitingParts, awaiting, overdueToday },
    recent: recent.map((f) => {
      const s = f.assets[0] ? snapshotOf(f.assets[0]) : null;
      return { id: f.id, reference: f.reference, type: f.type, tag: s?.tag ?? null, makeModel: s?.makeModel ?? '', recipient: recipientOf(f), sentAt: f.sentAt };
    }),
    attention: { total: attention.length, items: attention.slice(0, 3) },
    projects: projects
      .map((p) => ({ id: p.id, name: p.name, description: p.description, count: p._count.assets }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}
