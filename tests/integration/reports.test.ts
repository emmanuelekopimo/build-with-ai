import ExcelJS from 'exceljs';
import type { Response } from 'superagent';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/server/db';
import { isoDateWAT } from '../../src/shared/format';
import { intakeAssets, lastLink, refs, signBodyFor, STAFF } from './fixtures';
import { login, testApp, type Session } from './helpers';
import request from 'supertest';

const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function parseCsv(text: string): string[][] {
  // Minimal RFC-4180 parser for verification.
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

let admin: Session;
let tags: string[];

beforeAll(async () => {
  admin = await login();
  tags = await intakeAssets(admin, [
    { unitCost: 1000000 },
    { unitCost: 500000 },
    { result: 'FAILED' },
    { category: 'Wireless Mouse', makeModel: 'Logitech M185', unitCost: 12500 },
  ]);
  // Issue one, temporary, then age it past 90 days → overdue.
  const res = await admin.post('/api/forms', {
    type: 'ISSUANCE',
    assetTags: [tags[0]],
    data: { recipient: STAFF.samuel, temporary: true, expectedReturn: '2026-01-10' },
    send: true,
  });
  await request(testApp()).post(`/api/public/sign/${lastLink(STAFF.samuel.email)}`).send(signBodyFor(STAFF.samuel.name, 3));
  await db().form.update({ where: { id: res.body.id }, data: { completedAt: new Date(Date.now() - 100 * 86400000) } });
});

describe('exports match the database', () => {
  it('asset register CSV: BOM, header, one row per non-deleted asset, filters applied exactly', async () => {
    const r = await admin.get('/api/reports/asset-register/export?format=csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(new RegExp(`ECEWS-ITAMS-asset-register_${isoDateWAT()}\\.csv`));
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    const rows = parseCsv(r.text.slice(1)).filter((x) => x.length > 1);
    expect(rows[0]![0]).toBe('Asset tag');
    expect(rows.length - 1).toBe(await db().asset.count({ where: { deletedAt: null } }));
    const instore = parseCsv((await admin.get('/api/reports/asset-register/export?format=csv&status=IN_STORE')).text.slice(1)).filter((x) => x.length > 1);
    expect(instore.length - 1).toBe(await db().asset.count({ where: { deletedAt: null, status: 'IN_STORE' } }));
    expect(instore.slice(1).every((x) => x[5] === 'In Store')).toBe(true);
    const { proj } = await refs();
    const none = parseCsv((await admin.get(`/api/reports/asset-register/export?format=csv&project=${proj('Field Ops')}`)).text.slice(1)).filter((x) => x.length > 1);
    expect(none.length - 1).toBe(await db().asset.count({ where: { deletedAt: null, projectId: proj('Field Ops') } }));
    const future = parseCsv((await admin.get('/api/reports/asset-register/export?format=csv&from=2099-01-01')).text.slice(1)).filter((x) => x.length > 1);
    expect(future).toHaveLength(1); // header only
    const withHistory = parseCsv((await admin.get('/api/reports/asset-register/export?format=csv&history=1')).text.slice(1));
    expect(withHistory[0]!.at(-1)).toBe('Lifecycle history');
    expect(withHistory.find((x) => x[0] === tags[0])!.at(-1)).toContain('Intake validated');
  });

  it('asset register Excel: typed columns, styled frozen header, history sheet', async () => {
    const r = await admin.get('/api/reports/asset-register/export?format=xlsx&history=1').buffer(true).parse(binary);
    expect(r.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as Buffer);
    const ws = wb.getWorksheet('Asset register')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Asset tag');
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.rowCount - 1).toBe(await db().asset.count({ where: { deletedAt: null } }));
    const first = ws.getRow(2);
    expect(first.getCell(12).value).toBeInstanceOf(Date); // Added
    expect(typeof first.getCell(13).value).toBe('number'); // Unit cost
    const hist = wb.getWorksheet('Lifecycle history')!;
    expect(hist.rowCount - 1).toBe(await db().custodyEvent.count({ where: { asset: { deletedAt: null } } }));
  });

  it('PDF exports render (ECEWS-headed)', async () => {
    const r = await admin.get('/api/reports/asset-register/export?format=pdf').buffer(true).parse(binary);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('overdue-return alerts list temporary issuances ≥ 90 days that are still out', async () => {
    const csv = parseCsv((await admin.get('/api/reports/overdue-returns/export?format=csv')).text.slice(1)).filter((x) => x.length > 1);
    expect(csv.slice(1).map((x) => x[0])).toEqual([tags[0]]);
    expect(Number(csv[1]![7])).toBeGreaterThanOrEqual(100);
    const s = await admin.get('/api/reports/summary');
    expect(s.body.overdue).toBe(1);
    expect(s.body.register).toBe(await db().asset.count({ where: { deletedAt: null } }));
  });

  it('issuance history per staff and assets-by-project values', async () => {
    const hist = parseCsv((await admin.get('/api/reports/issuance-history/export?format=csv')).text.slice(1)).filter((x) => x.length > 1);
    expect(hist.slice(1).some((x) => x[0] === 'Samuel Etuk' && x[5] === tags[0] && x[9] === 'Still held')).toBe(true);
    const byProject = parseCsv((await admin.get('/api/reports/assets-by-project/export?format=csv')).text.slice(1)).filter((x) => x.length > 1);
    const total = byProject.slice(1).reduce((sum, x) => sum + Number(x[7]), 0);
    const agg = await db().asset.aggregate({ where: { deletedAt: null }, _sum: { unitCost: true } });
    expect(total).toBeCloseTo(Number(agg._sum.unitCost ?? 0), 2);
    const counted = byProject.slice(1).reduce((sum, x) => sum + Number(x[6]), 0);
    expect(counted).toBe(await db().asset.count({ where: { deletedAt: null } }));
    const xl = await admin.get('/api/reports/assets-by-project/export?format=xlsx').buffer(true).parse(binary);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xl.body as Buffer);
    const notes = wb.getWorksheet('Notes')!;
    const missing = await db().asset.count({ where: { deletedAt: null, unitCost: null } });
    expect(JSON.stringify(notes.getSheetValues())).toContain(`${missing} asset`);
  });

  it('single-asset report: chain of custody and intake snapshot; filename', async () => {
    const r = await admin.get(`/api/assets/${tags[0]}/report?format=csv&timeline=1&intake=1`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain(`ECEWS-ITAMS-${tags[0]}_full-history_${isoDateWAT()}.csv`);
    const rows = parseCsv(r.text.slice(1));
    expect(rows.some((x) => x[0] === 'Asset' && x[1] === 'Supplier / vendor' && x[2] === 'Dell EMC Nigeria')).toBe(true);
    expect(rows.filter((x) => x[0] === 'Chain of custody').map((x) => x[2])).toEqual(['Intake validated', 'Issued']);
    const noTimeline = parseCsv((await admin.get(`/api/assets/${tags[0]}/report?format=csv&timeline=0&intake=0`)).text.slice(1));
    expect(noTimeline.some((x) => x[0] === 'Chain of custody')).toBe(false);
    expect(noTimeline.some((x) => x[1] === 'Supplier / vendor')).toBe(false);
    const pdf = await admin.get(`/api/assets/${tags[0]}/report?format=pdf`).buffer(true).parse(binary);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('permissions: bulk exports are IT Admin only; viewers cannot download anything', async () => {
    const support = await login('IT_SUPPORT');
    const viewer = await login('VIEWER');
    expect((await support.get('/api/reports/asset-register/export?format=csv')).status).toBe(403);
    expect((await support.get(`/api/assets/${tags[0]}/report?format=csv`)).status).toBe(200);
    expect((await viewer.get(`/api/assets/${tags[0]}/report?format=csv`)).status).toBe(403);
    expect((await viewer.get('/api/reports/asset-register/export?format=csv')).status).toBe(403);
    expect((await viewer.get('/api/reports/summary')).status).toBe(200);
    expect((await admin.get('/api/reports/nope/export?format=csv')).status).toBe(400);
    expect((await admin.get('/api/reports/asset-register/export?format=doc')).status).toBe(400);
    expect(await db().auditLog.count({ where: { action: 'report.export' } })).toBeGreaterThan(0);
  });
});

describe('dashboard', () => {
  it('KPIs, needs attention and projects are computed from the database', async () => {
    const d = await admin.get('/api/dashboard');
    expect(d.status).toBe(200);
    expect(d.body.kpis.inStore).toBe(await db().asset.count({ where: { deletedAt: null, status: 'IN_STORE' } }));
    expect(d.body.kpis.issued).toBe(await db().asset.count({ where: { deletedAt: null, status: 'ISSUED' } }));
    expect(d.body.kpis.underRepair).toBe(await db().asset.count({ where: { deletedAt: null, status: 'DAMAGED', repairFormId: { not: null } } }));
    expect(d.body.kpis.awaiting).toBe(await db().form.count({ where: { status: { in: ['AWAITING', 'PENDING_APPROVAL'] } } }));
    const failed = d.body.attention.items.find((x: { tag: string }) => x.tag === tags[2]);
    expect(failed.reason).toBe('FAILED_INTAKE');
    expect(failed.reference).toMatch(/^IN-\d{3}$/);
    const total = d.body.projects.reduce((s: number, p: { count: number }) => s + p.count, 0);
    expect(total).toBe(await db().asset.count({ where: { deletedAt: null } }));
    const viewer = await login('VIEWER');
    expect((await viewer.get('/api/dashboard')).status).toBe(200);
  });
});
