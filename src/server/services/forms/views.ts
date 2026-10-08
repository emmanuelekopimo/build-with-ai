// Read models: form detail (drawer + document page), Sign-offs list and KPIs, form registries.
import type { FormStatus, FormType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { FORM_TITLE } from '../../../shared/constants';
import { isoDateWAT } from '../../../shared/format';
import { db } from '../../db';
import { notFound } from '../../lib/errors';
import { formInclude, snapshotOf, type FormWithAll } from './core';
import { now as clockNow } from '../../lib/clock';

type AnyData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function recipientOf(form: { type: FormType; data: unknown }): { name: string; sub: string } {
  const d = (form.data ?? {}) as AnyData;
  if (form.type === 'ISSUANCE' || form.type === 'INDEMNITY')
    return { name: d.recipient?.name ?? '—', sub: [d.recipient?.department].filter(Boolean).join(' · ') };
  if (form.type === 'RETURN')
    return {
      name: d.returner?.name ?? '—',
      sub: d.returnerType === 'VENDOR' ? (d.returner?.company ?? 'Vendor') : (d.returner?.department ?? ''),
    };
  const from = d.from?.location ?? '';
  const to = d.to?.type === 'VENDOR' ? d.to?.vendor?.company : d.to?.location;
  const kind = d.to?.type === 'VENDOR' ? 'repair' : d.to?.type === 'STAFF' ? `to ${d.to?.person?.name ?? 'staff'}` : 'site transfer';
  return { name: from && to ? `${from} → ${to}` : (d.toLabel ?? '—'), sub: kind };
}

export async function getFormDetail(where: { id?: string; reference?: string }) {
  const form = (await db().form.findFirst({
    where: where.id ? { id: where.id } : { reference: where.reference },
    include: { ...formInclude, createdBy: true, parentForm: { select: { id: true, reference: true, status: true } }, document: { select: { generatedAt: true, sha256: true } } },
  })) as (FormWithAll & { createdBy: { name: string; title: string; office: string }; parentForm: { id: string; reference: string; status: FormStatus } | null; document: { generatedAt: Date; sha256: string } | null }) | null;
  if (!form) throw notFound('Form not found.');
  const assets = await Promise.all(
    form.assets.map(async (fa) => {
      const s = snapshotOf(fa);
      return {
        ...s,
        assetId: fa.assetId,
        currentStatus: fa.asset.status,
        inRepair: fa.asset.repairFormId !== null,
        deleted: fa.asset.deletedAt !== null,
        condition: fa.condition,
        resultingStatus: fa.resultingStatus,
      };
    }),
  );
  return {
    id: form.id,
    reference: form.reference,
    type: form.type,
    title: FORM_TITLE[form.type],
    status: form.status,
    createdBy: { name: form.createdBy.name, title: form.createdBy.title, office: form.createdBy.office },
    createdAt: form.createdAt,
    sentAt: form.sentAt,
    deadline: form.deadline,
    completedAt: form.completedAt,
    rejectedReason: form.rejectedReason,
    temporary: form.temporary,
    expectedReturn: form.expectedReturn,
    recipient: recipientOf(form),
    data: form.data,
    parties: form.parties.map((p) => ({
      id: p.id,
      role: p.role,
      name: p.name,
      email: p.email,
      department: p.department,
      position: p.position,
      needsSignature: p.needsSignature,
      status: p.status,
      signedAt: p.signedAt,
      typedName: p.typedName,
      signerDepartmentRole: p.signerDepartmentRole,
      ipAddress: p.ipAddress,
      userAgent: p.userAgent,
      linkExpiresAt: p.tokenExpiresAt,
      linkUsed: p.usedAt !== null,
    })),
    approvals: form.approvals.map((a) => ({ role: a.role, name: a.name, email: a.email, status: a.status, decidedAt: a.decidedAt, comment: a.comment, sentAt: a.sentAt })),
    assets,
    parent: form.parentForm,
    children: form.childForms.map((c) => ({ id: c.id, reference: c.reference, status: c.status, type: c.type })),
    document: form.document,
  };
}

export const signoffQuery = z.object({
  tab: z.enum(['ALL', 'AWAITING', 'SIGNED', 'EXPIRED', 'DRAFT']).default('ALL'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const TAB_STATUSES: Record<string, FormStatus[] | null> = {
  ALL: null,
  AWAITING: ['PENDING_APPROVAL', 'AWAITING', 'PARTIAL'],
  SIGNED: ['SIGNED'],
  EXPIRED: ['EXPIRED'],
  DRAFT: ['DRAFT'],
};

function formSearch(q?: string): Prisma.FormWhereInput {
  if (!q) return {};
  return {
    OR: [
      { reference: { contains: q, mode: 'insensitive' } },
      { parties: { some: { name: { contains: q, mode: 'insensitive' } } } },
      { assets: { some: { asset: { tag: { contains: q, mode: 'insensitive' } } } } },
      { assets: { some: { asset: { makeModel: { contains: q, mode: 'insensitive' } } } } },
      { data: { path: ['recipient', 'name'], string_contains: q } },
      { data: { path: ['returner', 'name'], string_contains: q } },
    ],
  };
}

function intakeSearch(q?: string): Prisma.IntakeWhereInput {
  if (!q) return {};
  return {
    OR: [
      { reference: { contains: q, mode: 'insensitive' } },
      { supplier: { contains: q, mode: 'insensitive' } },
      { poReference: { contains: q, mode: 'insensitive' } },
    ],
  };
}

export async function listSignoffs(query: z.infer<typeof signoffQuery>) {
  const statuses = TAB_STATUSES[query.tab];
  const formWhere: Prisma.FormWhereInput = { ...(statuses ? { status: { in: statuses } } : {}), ...formSearch(query.q) };
  const includeIntakes = query.tab === 'ALL' || query.tab === 'DRAFT';
  const [forms, intakes] = await Promise.all([
    db().form.findMany({ where: formWhere, select: { id: true, sentAt: true, createdAt: true } }),
    includeIntakes
      ? db().intake.findMany({ where: { status: 'DRAFT', ...intakeSearch(query.q) }, select: { id: true, updatedAt: true } })
      : Promise.resolve([]),
  ]);
  const keyed = [
    ...forms.map((f) => ({ kind: 'FORM' as const, id: f.id, at: (f.sentAt ?? f.createdAt).getTime() })),
    ...intakes.map((i) => ({ kind: 'INTAKE' as const, id: i.id, at: i.updatedAt.getTime() })),
  ].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const total = keyed.length;
  const slice = keyed.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
  const formRows = await db().form.findMany({
    where: { id: { in: slice.filter((s) => s.kind === 'FORM').map((s) => s.id) } },
    include: { assets: { orderBy: { position: 'asc' } }, parties: { orderBy: { order: 'asc' } } },
  });
  const intakeRows = await db().intake.findMany({
    where: { id: { in: slice.filter((s) => s.kind === 'INTAKE').map((s) => s.id) } },
    include: { _count: { select: { lineItems: true } } },
  });
  const items = slice.map((s) => {
    if (s.kind === 'INTAKE') {
      const i = intakeRows.find((x) => x.id === s.id)!;
      return {
        kind: 'INTAKE' as const,
        id: i.id,
        reference: i.reference,
        type: 'INTAKE' as const,
        status: 'DRAFT' as const,
        asset: { tag: null, makeModel: `${i._count.lineItems} line item${i._count.lineItems === 1 ? '' : 's'}`, more: 0 },
        recipient: { name: i.supplier || 'Supplier not set', sub: i.poReference || 'Form 1 intake' },
        sentAt: null,
        updatedAt: i.updatedAt,
        deadline: null,
      };
    }
    const f = formRows.find((x) => x.id === s.id)!;
    const first = f.assets[0] ? snapshotOf(f.assets[0]) : null;
    const waitingOn = f.parties.filter((p) => p.needsSignature && p.status === 'PENDING').map((p) => p.name);
    return {
      kind: 'FORM' as const,
      id: f.id,
      reference: f.reference,
      type: f.type,
      status: f.status,
      asset: { tag: first?.tag ?? null, makeModel: first?.makeModel ?? '', more: Math.max(0, f.assets.length - 1) },
      recipient: recipientOf(f),
      sentAt: f.sentAt,
      updatedAt: f.updatedAt,
      deadline: f.deadline,
      waitingOn,
    };
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Lagos-local day and week boundaries (WAT = UTC+1, no DST). */
function watBoundaries(now = clockNow()) {
  const today = isoDateWAT(now);
  const startOfDay = new Date(`${today}T00:00:00+01:00`);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const dow = (new Date(`${today}T12:00:00+01:00`).getUTCDay() + 6) % 7; // Monday = 0
  const startOfWeek = new Date(startOfDay.getTime() - dow * 86400000);
  return { startOfDay, endOfDay, startOfWeek };
}

export async function signoffSummary(now = clockNow()) {
  const { endOfDay, startOfWeek } = watBoundaries(now);
  const awaitingStatuses: FormStatus[] = ['AWAITING', 'PENDING_APPROVAL'];
  const [awaiting, overdueToday, signedThisWeek, partial, expired, all, signed, draftForms, draftIntakes, awaitingTab] = await Promise.all([
    db().form.count({ where: { status: { in: awaitingStatuses } } }),
    db().form.count({ where: { status: { in: [...awaitingStatuses, 'PARTIAL'] }, deadline: { lt: endOfDay } } }),
    db().form.count({ where: { status: 'SIGNED', completedAt: { gte: startOfWeek } } }),
    db().form.count({ where: { status: 'PARTIAL' } }),
    db().form.count({ where: { status: 'EXPIRED' } }),
    db().form.count(),
    db().form.count({ where: { status: 'SIGNED' } }),
    db().form.count({ where: { status: 'DRAFT' } }),
    db().intake.count({ where: { status: 'DRAFT' } }),
    db().form.count({ where: { status: { in: TAB_STATUSES.AWAITING! } } }),
  ]);
  return {
    kpis: { awaiting, overdueToday, signedThisWeek, partial, expired },
    tabs: { ALL: all + draftIntakes, AWAITING: awaitingTab, SIGNED: signed, EXPIRED: expired, DRAFT: draftForms + draftIntakes },
  };
}

export const registryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().uuid().optional(),
  project: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const REGISTRY_TYPES: Record<string, FormType[]> = { issuance: ['ISSUANCE', 'INDEMNITY'], return: ['RETURN'], movement: ['MOVEMENT'] };

export async function listRegistry(kind: 'issuance' | 'return' | 'movement', query: z.infer<typeof registryQuery>) {
  const q = query.q;
  const where: Prisma.FormAssetWhereInput = {
    form: { type: { in: REGISTRY_TYPES[kind] }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    asset: {
      deletedAt: null,
      ...(query.category ? { categoryId: query.category } : {}),
      ...(query.project ? { projectId: query.project } : {}),
    },
    ...(q
      ? {
          OR: [
            { asset: { tag: { contains: q, mode: 'insensitive' } } },
            { asset: { serial: { contains: q, mode: 'insensitive' } } },
            { asset: { makeModel: { contains: q, mode: 'insensitive' } } },
            { asset: { description: { contains: q, mode: 'insensitive' } } },
            { form: { reference: { contains: q, mode: 'insensitive' } } },
            { form: { parties: { some: { name: { contains: q, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db().formAsset.count({ where }),
    db().formAsset.findMany({
      where,
      include: { form: true, asset: { include: { project: true } } },
      orderBy: [{ form: { sentAt: 'desc' } }, { position: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const items = rows.map((r) => {
    const s = snapshotOf(r);
    const d = r.form.data as AnyData;
    const base = {
      id: r.id,
      formId: r.form.id,
      reference: r.form.reference,
      formStatus: r.form.status,
      tag: s.tag,
      description: s.description,
      makeModel: s.makeModel,
      serial: s.serial,
      project: r.asset.project.name,
      resultingStatus: r.resultingStatus,
      date: r.form.completedAt ?? r.form.sentAt,
      completed: r.form.status === 'SIGNED',
    };
    if (kind === 'movement') {
      return {
        ...base,
        movedFrom: d.from?.holderName ? `${d.from.holderName} · ${d.from.location}` : (d.from?.location ?? '—'),
        movedTo: d.to?.type === 'VENDOR' ? d.to?.vendor?.company : d.to?.type === 'STAFF' ? `${d.to?.person?.name} · ${d.to?.location}` : d.to?.location,
        reason: d.reason ?? '',
      };
    }
    return { ...base, holder: recipientOf(r.form) };
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}
