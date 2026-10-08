// Reports & exports (AB-10). CSV and Excel stream row batches to the response; PDF renders the same
// rows through the ECEWS-headed HTML template. The download contains exactly what the filters select.
import type { Prisma } from '@prisma/client';
import { stringify } from 'csv-stringify';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { z } from 'zod';
import {
  CONDITION_LABEL,
  DAMAGE_ORIGIN_LABEL,
  INTAKE_CHECK_QUESTIONS,
  OVERDUE_ISSUE_DAYS,
  RETIRE_REASON_LABEL,
  STATUS_LABEL,
  type AssetStatus,
  type Condition,
} from '../../shared/constants';
import { fmtDate, fmtDateTime, fmtNGN, isoDateWAT } from '../../shared/format';
import { db } from '../db';
import { esc } from '../email/templates';
import { notFound } from '../lib/errors';
import { now as clockNow } from '../lib/clock';
import { htmlToPdf } from '../pdf/browser';
import { reportShell } from '../pdf/reportHtml';

export const REPORTS = {
  'asset-register': { title: 'Asset register', description: 'Full registry: tag, make/model, serial, status, holder, project' },
  'issuance-history': { title: 'Issuance history per staff', description: 'Every indemnity a person has signed, past and present' },
  'overdue-returns': { title: 'Overdue-return alerts', description: `Items issued ${OVERDUE_ISSUE_DAYS}+ days that were meant to be temporary` },
  'assets-by-project': { title: 'Assets by project', description: 'Stock and value grouped by project and location' },
} as const;
export type ReportId = keyof typeof REPORTS;

export const exportQuery = z.object({
  format: z.enum(['pdf', 'xlsx', 'csv']),
  history: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  project: z.string().uuid().optional(),
  status: z.enum(['IN_STORE', 'ISSUED', 'DAMAGED', 'IN_REPAIR', 'RETIRED']).optional(),
  location: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type ExportQuery = z.infer<typeof exportQuery>;

type ColType = 'string' | 'date' | 'datetime' | 'number' | 'money';
interface Col {
  key: string;
  header: string;
  type?: ColType;
  width?: number;
}
type Row = Record<string, string | number | Date | null | undefined>;

interface ReportData {
  title: string;
  columns: Col[];
  rows: () => AsyncGenerator<Row[]>;
  /** Optional second table: lifecycle history (asset register with "Include full lifecycle history"). */
  history?: { columns: Col[]; rows: () => AsyncGenerator<Row[]> };
  filtersText: string[];
  footnote?: () => Promise<string | null>;
  count: () => Promise<number>;
}

const BATCH = 500;
const watStart = (d: string) => new Date(`${d}T00:00:00+01:00`);
const watEnd = (d: string) => new Date(watStart(d).getTime() + 86400000);
const statusLabel = (s: AssetStatus, inRepair: boolean) => (s === 'DAMAGED' && inRepair ? 'Damaged (in repair)' : STATUS_LABEL[s]);

export function assetWhere(q: ExportQuery): Prisma.AssetWhereInput {
  const and: Prisma.AssetWhereInput[] = [{ deletedAt: null }];
  if (q.project) and.push({ projectId: q.project });
  if (q.location) and.push({ locationId: q.location });
  if (q.status === 'IN_REPAIR') and.push({ status: 'DAMAGED', repairFormId: { not: null } });
  else if (q.status) and.push({ status: q.status });
  if (q.from) and.push({ createdAt: { gte: watStart(q.from) } });
  if (q.to) and.push({ createdAt: { lt: watEnd(q.to) } });
  return { AND: and };
}

async function filterText(q: ExportQuery): Promise<string[]> {
  const out: string[] = [];
  if (q.project) out.push(`Project: ${(await db().project.findUnique({ where: { id: q.project } }))?.name ?? '?'}`);
  if (q.status) out.push(`Status: ${q.status === 'IN_REPAIR' ? 'Damaged (in repair)' : STATUS_LABEL[q.status]}`);
  if (q.location) out.push(`Location: ${(await db().location.findUnique({ where: { id: q.location } }))?.name ?? '?'}`);
  if (q.from || q.to) out.push(`Added: ${q.from ? fmtDate(q.from) : '…'} – ${q.to ? fmtDate(q.to) : '…'}`);
  return out;
}

const EVENT_LABEL: Record<string, string> = {
  INTAKE_VALIDATED: 'Intake validated',
  INTAKE_FAILED: 'Failed intake',
  ISSUED: 'Issued',
  REISSUED: 'Re-issued',
  MOVED: 'Moved',
  RETURNED: 'Returned',
  DAMAGE_REPORTED: 'Reported damaged',
  SENT_FOR_REPAIR: 'Sent for repair',
  REPAIRED: 'Received back, In Store',
  REPAIR_FAILED: 'Received back, still faulty',
  RETIRED: 'Retired',
  REINSTATED_FOR_REPAIR: 'Reinstated for repair',
  DELETED: 'Deleted',
};

export function eventSummary(e: { type: string; fromHolder: string | null; toHolder: string | null; fromLocation: string | null; toLocation: string | null; detail: unknown }): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (e.toHolder && e.toHolder !== e.fromHolder) parts.push(`to ${e.toHolder}`);
  if (e.fromLocation && e.toLocation && e.fromLocation !== e.toLocation) parts.push(`${e.fromLocation} → ${e.toLocation}`);
  if (typeof d.condition === 'string') parts.push(`condition ${CONDITION_LABEL[d.condition as Condition] ?? d.condition}`);
  if (typeof d.reasonLabel === 'string') parts.push(d.reasonLabel);
  else if (typeof d.reason === 'string') parts.push(d.reason);
  if (typeof d.notes === 'string' && d.notes) parts.push(d.notes);
  if (typeof d.supplier === 'string') parts.push(`${d.supplier} · ${String(d.poReference ?? '')}`);
  return parts.join(' · ');
}

const historyCols: Col[] = [
  { key: 'tag', header: 'Asset tag', width: 16 },
  { key: 'when', header: 'Date (WAT)', type: 'datetime', width: 18 },
  { key: 'event', header: 'Event', width: 24 },
  { key: 'detail', header: 'Detail', width: 50 },
  { key: 'reference', header: 'Form', width: 12 },
  { key: 'by', header: 'By', width: 18 },
  { key: 'statusAfter', header: 'Status after', width: 14 },
];

async function* assetIdsBatches(where: Prisma.AssetWhereInput) {
  let cursor: number | undefined;
  for (;;) {
    const batch = await db().asset.findMany({
      where: cursor === undefined ? where : { AND: [where, { tagNumber: { gt: cursor } }] },
      orderBy: { tagNumber: 'asc' },
      take: BATCH,
      include: { category: true, project: true, location: true, currentHolder: true },
    });
    if (!batch.length) return;
    yield batch;
    cursor = batch[batch.length - 1]!.tagNumber;
    if (batch.length < BATCH) return;
  }
}

function assetRegister(q: ExportQuery): ReportData {
  const where = assetWhere(q);
  const columns: Col[] = [
    { key: 'tag', header: 'Asset tag', width: 16 },
    { key: 'category', header: 'Category', width: 16 },
    { key: 'description', header: 'Description', width: 20 },
    { key: 'makeModel', header: 'Make / model', width: 26 },
    { key: 'serial', header: 'Serial', width: 16 },
    { key: 'status', header: 'Status', width: 18 },
    { key: 'damageOrigin', header: 'Damage origin', width: 18 },
    { key: 'holder', header: 'Current holder', width: 20 },
    { key: 'holderDept', header: 'Holder department', width: 18 },
    { key: 'project', header: 'Project', width: 14 },
    { key: 'location', header: 'Location', width: 20 },
    { key: 'added', header: 'Added', type: 'date', width: 12 },
    { key: 'unitCost', header: 'Unit cost (NGN)', type: 'money', width: 16 },
  ];
  return {
    title: REPORTS['asset-register'].title,
    columns,
    filtersText: [],
    count: () => db().asset.count({ where }),
    rows: async function* () {
      for await (const batch of assetIdsBatches(where)) {
        yield batch.map((a) => ({
          tag: a.tag,
          category: a.category.name,
          description: a.description,
          makeModel: a.makeModel,
          serial: a.serial,
          status: statusLabel(a.status, a.repairFormId !== null),
          damageOrigin: a.damageOrigin ? DAMAGE_ORIGIN_LABEL[a.damageOrigin] : a.retireReason ? `Retired: ${RETIRE_REASON_LABEL[a.retireReason]}` : null,
          holder: a.currentHolder?.name ?? null,
          holderDept: a.currentHolder ? (a.currentHolder.type === 'VENDOR' ? a.currentHolder.company : a.currentHolder.department) : null,
          project: a.project.name,
          location: a.location.name,
          added: a.createdAt,
          unitCost: a.unitCost === null ? null : Number(a.unitCost),
        }));
      }
    },
    history: q.history
      ? {
          columns: historyCols,
          rows: async function* () {
            for await (const batch of assetIdsBatches(where)) {
              const events = await db().custodyEvent.findMany({
                where: { assetId: { in: batch.map((a) => a.id) } },
                orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
                include: { asset: { select: { tag: true, tagNumber: true } } },
              });
              events.sort((x, y) => x.asset.tagNumber - y.asset.tagNumber || x.occurredAt.getTime() - y.occurredAt.getTime());
              yield events.map((e) => ({
                tag: e.asset.tag,
                when: e.occurredAt,
                event: EVENT_LABEL[e.type] ?? e.type,
                detail: eventSummary(e),
                reference: e.formReference,
                by: e.actorName,
                statusAfter: STATUS_LABEL[e.statusAfter],
              }));
            }
          },
        }
      : undefined,
  };
}

function issuanceHistory(q: ExportQuery): ReportData {
  const where: Prisma.FormAssetWhereInput = {
    form: {
      type: { in: ['ISSUANCE', 'INDEMNITY'] },
      status: 'SIGNED',
      ...(q.from || q.to ? { completedAt: { ...(q.from ? { gte: watStart(q.from) } : {}), ...(q.to ? { lt: watEnd(q.to) } : {}) } } : {}),
    },
    asset: { deletedAt: null, ...(q.project ? { projectId: q.project } : {}), ...(q.location ? { locationId: q.location } : {}) },
  };
  const columns: Col[] = [
    { key: 'staff', header: 'Staff', width: 20 },
    { key: 'department', header: 'Department', width: 18 },
    { key: 'staffId', header: 'Staff ID', width: 12 },
    { key: 'email', header: 'Email', width: 26 },
    { key: 'reference', header: 'Indemnity', width: 12 },
    { key: 'tag', header: 'Asset tag', width: 16 },
    { key: 'makeModel', header: 'Make / model', width: 24 },
    { key: 'signed', header: 'Signed', type: 'date', width: 12 },
    { key: 'temporary', header: 'Temporary', width: 10 },
    { key: 'current', header: 'Current', width: 26 },
  ];
  return {
    title: REPORTS['issuance-history'].title,
    columns,
    filtersText: [],
    count: () => db().formAsset.count({ where }),
    rows: async function* () {
      let skip = 0;
      for (;;) {
        const batch = await db().formAsset.findMany({
          where,
          include: { form: true, asset: { include: { currentHolder: true } } },
          orderBy: [{ form: { completedAt: 'asc' } }, { id: 'asc' }],
          skip,
          take: BATCH,
        });
        if (!batch.length) return;
        const rows = batch.map((fa) => {
          const d = fa.form.data as { recipient?: { name?: string; department?: string; staffId?: string; email?: string } };
          const r = d.recipient ?? {};
          const stillHeld = fa.asset.currentFormId === fa.form.id && fa.asset.status === 'ISSUED';
          return {
            staff: r.name ?? '',
            department: r.department ?? '',
            staffId: r.staffId ?? '',
            email: r.email ?? '',
            reference: fa.form.reference,
            tag: fa.asset.tag,
            makeModel: fa.asset.makeModel,
            signed: fa.form.completedAt,
            temporary: fa.form.temporary ? 'Yes' : 'No',
            current: stillHeld ? 'Still held' : `Closed · now ${statusLabel(fa.asset.status, fa.asset.repairFormId !== null)}${fa.asset.currentHolder ? ` (${fa.asset.currentHolder.name})` : ''}`,
          };
        });
        rows.sort((a, b) => String(a.staff).localeCompare(String(b.staff)));
        yield rows;
        if (batch.length < BATCH) return;
        skip += BATCH;
      }
    },
  };
}

/** Assets currently Issued under a temporary issuance signed ≥ 90 days ago (D27). */
export async function overdueIssuances(now = clockNow()) {
  const cutoff = new Date(now.getTime() - OVERDUE_ISSUE_DAYS * 86400000);
  const assets = await db().asset.findMany({ where: { status: 'ISSUED', deletedAt: null, currentFormId: { not: null } }, include: { currentHolder: true } });
  const forms = new Map(
    (await db().form.findMany({ where: { id: { in: assets.map((a) => a.currentFormId!) }, temporary: true, status: 'SIGNED', completedAt: { lte: cutoff } } })).map((f) => [f.id, f]),
  );
  return assets
    .filter((a) => forms.has(a.currentFormId!))
    .map((a) => {
      const f = forms.get(a.currentFormId!)!;
      return { asset: a, form: f, days: Math.floor((now.getTime() - f.completedAt!.getTime()) / 86400000) };
    })
    .sort((x, y) => y.days - x.days);
}

function overdueReturns(q: ExportQuery): ReportData {
  const columns: Col[] = [
    { key: 'tag', header: 'Asset tag', width: 16 },
    { key: 'makeModel', header: 'Make / model', width: 24 },
    { key: 'holder', header: 'Held by', width: 20 },
    { key: 'department', header: 'Department', width: 18 },
    { key: 'reference', header: 'Indemnity', width: 12 },
    { key: 'issued', header: 'Issued', type: 'date', width: 12 },
    { key: 'expected', header: 'Expected return', type: 'date', width: 14 },
    { key: 'days', header: 'Days issued', type: 'number', width: 12 },
  ];
  const load = async () =>
    (await overdueIssuances()).filter(
      (x) => (!q.project || x.asset.projectId === q.project) && (!q.location || x.asset.locationId === q.location),
    );
  return {
    title: REPORTS['overdue-returns'].title,
    columns,
    filtersText: [],
    count: async () => (await load()).length,
    rows: async function* () {
      yield (await load()).map((x) => ({
        tag: x.asset.tag,
        makeModel: x.asset.makeModel,
        holder: x.asset.currentHolder?.name ?? null,
        department: x.asset.currentHolder?.department ?? null,
        reference: x.form.reference,
        issued: x.form.completedAt,
        expected: x.form.expectedReturn,
        days: x.days,
      }));
    },
  };
}

function assetsByProject(q: ExportQuery): ReportData {
  const where = assetWhere({ ...q, status: undefined });
  const columns: Col[] = [
    { key: 'project', header: 'Project', width: 16 },
    { key: 'location', header: 'Location', width: 22 },
    { key: 'inStore', header: 'In Store', type: 'number', width: 10 },
    { key: 'issued', header: 'Issued', type: 'number', width: 10 },
    { key: 'damaged', header: 'Damaged', type: 'number', width: 10 },
    { key: 'retired', header: 'Retired', type: 'number', width: 10 },
    { key: 'total', header: 'Total', type: 'number', width: 10 },
    { key: 'value', header: 'Value (NGN)', type: 'money', width: 18 },
  ];
  const groups = async () => {
    const rows = await db().asset.groupBy({ by: ['projectId', 'locationId', 'status'], where, _count: { _all: true }, _sum: { unitCost: true } });
    const [projects, locations] = await Promise.all([db().project.findMany(), db().location.findMany()]);
    const map = new Map<string, Row & { inStore: number; issued: number; damaged: number; retired: number; total: number; value: number }>();
    for (const r of rows) {
      const k = `${r.projectId}|${r.locationId}`;
      const g =
        map.get(k) ??
        ({
          project: projects.find((p) => p.id === r.projectId)?.name ?? '',
          location: locations.find((l) => l.id === r.locationId)?.name ?? '',
          inStore: 0,
          issued: 0,
          damaged: 0,
          retired: 0,
          total: 0,
          value: 0,
        } as Row & { inStore: number; issued: number; damaged: number; retired: number; total: number; value: number });
      const n = r._count._all;
      if (r.status === 'IN_STORE') g.inStore += n;
      if (r.status === 'ISSUED') g.issued += n;
      if (r.status === 'DAMAGED') g.damaged += n;
      if (r.status === 'RETIRED') g.retired += n;
      g.total += n;
      g.value += Number(r._sum.unitCost ?? 0);
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => String(a.project).localeCompare(String(b.project)) || String(a.location).localeCompare(String(b.location)));
  };
  return {
    title: REPORTS['assets-by-project'].title,
    columns,
    filtersText: [],
    count: async () => (await groups()).length,
    rows: async function* () {
      yield await groups();
    },
    footnote: async () => {
      const missing = await db().asset.count({ where: { AND: [where, { unitCost: null }] } });
      return missing ? `${missing} asset${missing === 1 ? ' has' : 's have'} no unit cost recorded and ${missing === 1 ? 'is' : 'are'} counted as NGN 0.` : null;
    },
  };
}

export async function buildReport(id: ReportId, q: ExportQuery): Promise<ReportData> {
  const r =
    id === 'asset-register' ? assetRegister(q) : id === 'issuance-history' ? issuanceHistory(q) : id === 'overdue-returns' ? overdueReturns(q) : assetsByProject(q);
  r.filtersText = await filterText(q);
  return r;
}

export function exportFileName(base: string, format: 'pdf' | 'xlsx' | 'csv'): string {
  return `ECEWS-ITAMS-${base.replace(/[^A-Za-z0-9_-]+/g, '-')}_${isoDateWAT(clockNow())}.${format}`;
}

function cellText(v: Row[string], type: ColType = 'string'): string {
  if (v === null || v === undefined) return '';
  if (type === 'date') return fmtDate(v as Date);
  if (type === 'datetime') return fmtDateTime(v as Date);
  if (type === 'money') return fmtNGN(v as number);
  return String(v);
}

/** Stream a report to the HTTP response in the requested format. */
export async function writeReport(res: Response, report: ReportData, format: 'pdf' | 'xlsx' | 'csv', fileName: string): Promise<void> {
  const disposition = `attachment; filename="${fileName}"`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', disposition);
    res.write('﻿'); // UTF-8 BOM so Excel opens accents and ₦ correctly
    const cols = report.history ? [...report.columns, { key: '__history', header: 'Lifecycle history' }] : report.columns;
    const csv = stringify({ header: true, columns: cols.map((c) => ({ key: c.key, header: c.header })) });
    csv.pipe(res, { end: false });
    const done = new Promise<void>((resolve, reject) => {
      csv.on('end', resolve);
      csv.on('error', reject);
    });
    for await (const batch of report.rows()) {
      let histories: Map<string, string> | null = null;
      if (report.history) {
        const tags = batch.map((r) => String(r.tag));
        const events = await db().custodyEvent.findMany({ where: { asset: { tag: { in: tags } } }, orderBy: { occurredAt: 'asc' }, include: { asset: { select: { tag: true } } } });
        histories = new Map();
        for (const e of events) {
          const line = `${fmtDateTime(e.occurredAt)} ${EVENT_LABEL[e.type] ?? e.type}${e.formReference ? ` (${e.formReference})` : ''}`;
          histories.set(e.asset.tag, histories.has(e.asset.tag) ? `${histories.get(e.asset.tag)}; ${line}` : line);
        }
      }
      for (const r of batch) {
        const out: Record<string, string> = {};
        for (const c of report.columns) out[c.key] = c.type === 'money' || c.type === 'number' ? (r[c.key] === null ? '' : String(r[c.key])) : c.type === 'date' || c.type === 'datetime' ? (r[c.key] ? isoDateWAT(r[c.key] as Date) : '') : cellText(r[c.key]);
        if (histories) out.__history = histories.get(String(r.tag)) ?? '';
        if (!csv.write(out)) await new Promise((resolve) => csv.once('drain', resolve));
      }
    }
    csv.end();
    await done;
    res.end();
    return;
  }

  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', disposition);
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    wb.creator = 'ECEWS-ITAMS';
    wb.created = clockNow();
    const addSheet = async (name: string, cols: Col[], rows: () => AsyncGenerator<Row[]>) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 16,
        style: c.type === 'money' ? { numFmt: '"NGN" #,##0.00' } : c.type === 'date' ? { numFmt: 'dd mmm yyyy' } : c.type === 'datetime' ? { numFmt: 'dd mmm yyyy hh:mm' } : {},
      }));
      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF096D49' } };
      header.alignment = { vertical: 'middle' };
      header.commit();
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      for await (const batch of rows()) {
        for (const r of batch) {
          const values: Record<string, unknown> = {};
          for (const c of cols) {
            const v = r[c.key];
            // Dates are written as real Excel dates, shifted to WAT wall-clock time.
            values[c.key] = v instanceof Date ? new Date(v.getTime() + 3600000) : v;
          }
          ws.addRow(values).commit();
        }
      }
      ws.commit();
    };
    await addSheet(report.title.slice(0, 31), report.columns, report.rows);
    if (report.history) await addSheet('Lifecycle history', report.history.columns, report.history.rows);
    const note = report.footnote ? await report.footnote() : null;
    if (note || report.filtersText.length) {
      const ws = wb.addWorksheet('Notes');
      ws.addRow(['Generated', fmtDateTime(clockNow())]).commit();
      for (const f of report.filtersText) ws.addRow(['Filter', f]).commit();
      if (note) ws.addRow(['Note', note]).commit();
      ws.commit();
    }
    await wb.commit();
    return;
  }

  // PDF: built from the same rows (PDF cannot stream; large registers still render page by page in Chromium).
  const head = report.columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
  const parts: string[] = [];
  let total = 0;
  for await (const batch of report.rows()) {
    total += batch.length;
    for (const r of batch) parts.push(`<tr>${report.columns.map((c) => `<td class="${c.type === 'money' || c.type === 'number' ? 'num' : ''}">${esc(cellText(r[c.key], c.type))}</td>`).join('')}</tr>`);
  }
  let historyHtml = '';
  if (report.history) {
    const hp: string[] = [];
    for await (const batch of report.history.rows()) for (const r of batch) hp.push(`<tr>${report.history.columns.map((c) => `<td>${esc(cellText(r[c.key], c.type))}</td>`).join('')}</tr>`);
    historyHtml = `<h2>Lifecycle history</h2><table><thead><tr>${report.history.columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead><tbody>${hp.join('')}</tbody></table>`;
  }
  const note = report.footnote ? await report.footnote() : null;
  const body = `<table><thead><tr>${head}</tr></thead><tbody>${parts.join('') || `<tr><td colspan="${report.columns.length}">No records match these filters.</td></tr>`}</tbody></table>${note ? `<p class="note">${esc(note)}</p>` : ''}${historyHtml}`;
  const html = reportShell({ title: report.title, subtitle: `${total} row${total === 1 ? '' : 's'}${report.filtersText.length ? ` · ${report.filtersText.join(' · ')}` : ' · all records'}`, body, landscape: report.columns.length > 8 });
  const pdf = await htmlToPdf(html, { landscape: report.columns.length > 8, footer: report.title });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition);
  res.send(pdf);
}

// ---------------------------------------------------------------- single-asset report

export const assetReportQuery = z.object({
  format: z.enum(['pdf', 'xlsx', 'csv']),
  timeline: z.enum(['0', '1']).default('1'),
  intake: z.enum(['0', '1']).default('1'),
});

export async function assetReport(tag: string, q: z.infer<typeof assetReportQuery>): Promise<ReportData & { fileBase: string }> {
  const a = await db().asset.findUnique({
    where: { tag },
    include: {
      category: true,
      project: true,
      location: true,
      currentHolder: true,
      intakeLineItem: { include: { intake: { include: { checks: { orderBy: { question: 'asc' } } } } } },
      custodyEvents: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!a || a.deletedAt) throw notFound(`Asset ${tag} was not found.`);
  const info: Row[] = [
    { field: 'Asset tag', value: a.tag },
    { field: 'Description', value: a.description },
    { field: 'Make / model', value: a.makeModel },
    { field: 'Serial', value: a.serial ?? '-' },
    { field: 'Category', value: a.category.name },
    { field: 'Status', value: statusLabel(a.status, a.repairFormId !== null) },
    { field: 'Damage origin', value: a.damageOrigin ? DAMAGE_ORIGIN_LABEL[a.damageOrigin] : '-' },
    { field: 'Current holder', value: a.currentHolder?.name ?? '-' },
    { field: 'Project', value: a.project.name },
    { field: 'Location', value: a.location.name },
    { field: 'Added', value: fmtDate(a.createdAt) },
    { field: 'Unit cost', value: a.unitCost === null ? '-' : fmtNGN(Number(a.unitCost)) },
  ];
  const intake = a.intakeLineItem?.intake;
  if (q.intake === '1' && intake) {
    info.push(
      { field: 'Intake', value: intake.reference },
      { field: 'Supplier / vendor', value: intake.supplier },
      { field: 'PO reference', value: intake.poReference },
      { field: 'Delivery location', value: intake.deliveryLocation },
      { field: 'Delivery date', value: fmtDate(intake.deliveryDate) },
      { field: 'Intake result', value: a.intakeLineItem?.result === 'FAILED' ? 'Failed' : 'Passed' },
      { field: 'OEM support', value: a.oemSupport ? 'Active' : 'None' },
      ...intake.checks.map((c) => ({ field: `Check ${c.question}: ${INTAKE_CHECK_QUESTIONS[c.question - 1]}`, value: `${c.answer ?? '-'}${c.remark ? ` (${c.remark})` : ''}` })),
    );
  }
  const timeline: Row[] = a.custodyEvents.map((e) => ({
    tag: a.tag,
    when: e.occurredAt,
    event: EVENT_LABEL[e.type] ?? e.type,
    detail: eventSummary(e),
    reference: e.formReference,
    by: e.actorName,
    statusAfter: STATUS_LABEL[e.statusAfter],
  }));
  return {
    fileBase: `${a.tag}_full-history`,
    title: `${a.tag} · ${a.makeModel}`,
    columns: [
      { key: 'field', header: 'Field', width: 40 },
      { key: 'value', header: 'Value', width: 50 },
    ],
    rows: async function* () {
      yield info;
    },
    history: q.timeline === '1' ? { columns: historyCols, rows: async function* () {
      yield timeline;
    } } : undefined,
    filtersText: [],
    count: async () => info.length,
  };
}

export async function reportsSummary() {
  const [register, overdue, issuanceRecords, projects, locations] = await Promise.all([
    db().asset.count({ where: { deletedAt: null } }),
    overdueIssuances(),
    db().formAsset.count({ where: { form: { type: { in: ['ISSUANCE', 'INDEMNITY'] }, status: 'SIGNED' }, asset: { deletedAt: null } } }),
    db().project.count(),
    db().location.count(),
  ]);
  return { register, overdue: overdue.length, issuanceRecords, projectsAndLocations: projects + locations };
}

/** Single-asset CSV: one flat table — the asset fields, then every custody event. */
export function assetReportAsCsv(r: ReportData): ReportData {
  return {
    ...r,
    columns: [
      { key: 'section', header: 'Section' },
      { key: 'a', header: 'Field / date (WAT)' },
      { key: 'b', header: 'Value / event' },
      { key: 'detail', header: 'Detail' },
      { key: 'reference', header: 'Form' },
      { key: 'by', header: 'By' },
      { key: 'statusAfter', header: 'Status after' },
    ],
    history: undefined,
    rows: async function* () {
      for await (const batch of r.rows()) yield batch.map((x) => ({ section: 'Asset', a: x.field ?? '', b: x.value ?? '', detail: '', reference: '', by: '', statusAfter: '' }));
      if (r.history)
        for await (const batch of r.history.rows())
          yield batch.map((x) => ({ section: 'Chain of custody', a: x.when ? fmtDateTime(x.when as Date) : '', b: x.event, detail: x.detail, reference: x.reference, by: x.by, statusAfter: x.statusAfter }));
    },
  };
}
