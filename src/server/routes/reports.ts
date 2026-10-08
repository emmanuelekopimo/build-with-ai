import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../shared/permissions';
import { ah, clientIp, parse } from '../lib/http';
import { currentUser, requirePermission } from '../middleware/auth';
import { audit } from '../services/audit';
import { dashboard } from '../services/dashboard';
import {
  assetReport,
  assetReportAsCsv,
  assetReportQuery,
  buildReport,
  exportFileName,
  exportQuery,
  REPORTS,
  reportsSummary,
  writeReport,
  type ReportId,
} from '../services/reports';

export const reportsRouter = Router();

reportsRouter.get(
  '/dashboard',
  requirePermission('dashboard.view'),
  ah(async (req, res) => {
    const d = await dashboard();
    // D32: viewers do not see sign-off recipients (personal data).
    res.json(can(currentUser(req).role, 'signoff.view') ? d : { ...d, recent: [] });
  }),
);
reportsRouter.get('/reports/summary', requirePermission('report.view'), ah(async (_req, res) => res.json(await reportsSummary())));

reportsRouter.get(
  '/reports/:report/count',
  requirePermission('report.view'),
  ah(async (req, res) => {
    const { report } = parse(z.object({ report: z.enum(Object.keys(REPORTS) as [ReportId, ...ReportId[]]) }), req.params);
    const q = parse(exportQuery.partial({ format: true }), req.query, 'filters');
    res.json({ count: await (await buildReport(report, { ...q, format: 'csv' })).count() });
  }),
);

reportsRouter.get(
  '/reports/:report/export',
  requirePermission('report.exportBulk'),
  ah(async (req, res) => {
    const { report } = parse(z.object({ report: z.enum(Object.keys(REPORTS) as [ReportId, ...ReportId[]]) }), req.params);
    const q = parse(exportQuery, req.query, 'filters');
    const data = await buildReport(report, q);
    await audit({ userId: currentUser(req).id, action: 'report.export', entityType: 'Report', entityId: report, detail: { ...q }, ipAddress: clientIp(req) });
    await writeReport(res, data, q.format, exportFileName(report, q.format));
  }),
);

reportsRouter.get(
  '/assets/:tag/report',
  requirePermission('report.exportSingle'),
  ah(async (req, res) => {
    const { tag } = parse(z.object({ tag: z.string().regex(/^ECEWS-IT-\d{4,}$/, 'Invalid asset tag.') }), req.params);
    const q = parse(assetReportQuery, req.query, 'options');
    const data = await assetReport(tag, q);
    await audit({ userId: currentUser(req).id, action: 'report.asset', entityType: 'Asset', entityId: tag, detail: { ...q }, ipAddress: clientIp(req) });
    await writeReport(res, q.format === 'csv' ? assetReportAsCsv(data) : data, q.format, exportFileName(data.fileBase, q.format));
  }),
);
