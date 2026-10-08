import { Router } from 'express';
import { z } from 'zod';
import { ah, clientIp, parse } from '../lib/http';
import { currentUser, requirePermission } from '../middleware/auth';
import {
  deleteAsset,
  deleteBody,
  getAssetDetail,
  listAssets,
  listQuery,
  reportDamage,
  reportDamageBody,
  retireAsset,
  retireBody,
} from '../services/assets';

export const assetsRouter = Router();

const tagParam = z.object({ tag: z.string().regex(/^ECEWS-IT-\d{4,}$/, 'Invalid asset tag.') });

assetsRouter.get(
  '/assets',
  requirePermission('asset.view'),
  ah(async (req, res) => {
    const q = parse(listQuery, req.query, 'filters');
    const user = currentUser(req);
    if (q.for) {
      // Pickers are part of the form workflows.
      if (!['IT_ADMIN', 'IT_SUPPORT'].includes(user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    res.json(await listAssets(q, user));
  }),
);

assetsRouter.get(
  '/assets/:tag',
  requirePermission('asset.view'),
  ah(async (req, res) => {
    const { tag } = parse(tagParam, req.params);
    res.json(await getAssetDetail(tag, currentUser(req)));
  }),
);

assetsRouter.post(
  '/assets/:tag/report-damage',
  requirePermission('asset.reportDamage'),
  ah(async (req, res) => {
    const { tag } = parse(tagParam, req.params);
    res.json(await reportDamage(tag, parse(reportDamageBody, req.body), currentUser(req), clientIp(req)));
  }),
);

assetsRouter.post(
  '/assets/:tag/retire',
  requirePermission('asset.retire'),
  ah(async (req, res) => {
    const { tag } = parse(tagParam, req.params);
    res.json(await retireAsset(tag, parse(retireBody, req.body), currentUser(req), clientIp(req)));
  }),
);

assetsRouter.post(
  '/assets/:tag/delete',
  requirePermission('asset.delete'),
  ah(async (req, res) => {
    const { tag } = parse(tagParam, req.params);
    res.json(await deleteAsset(tag, parse(deleteBody, req.body), currentUser(req), clientIp(req)));
  }),
);
