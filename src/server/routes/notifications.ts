import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { notFound } from '../lib/errors';
import { ah, parse } from '../lib/http';
import { currentUser, requireAuth } from '../middleware/auth';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/notifications',
  requireAuth,
  ah(async (req, res) => {
    const user = currentUser(req);
    const [items, unread] = await Promise.all([
      db().notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db().notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    res.json({ items, unread });
  }),
);

notificationsRouter.post(
  '/notifications/read-all',
  requireAuth,
  ah(async (req, res) => {
    const user = currentUser(req);
    await db().notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/notifications/:id/read',
  requireAuth,
  ah(async (req, res) => {
    const user = currentUser(req);
    const { id } = parse(z.object({ id: z.string().uuid('Invalid notification id.') }), req.params);
    const r = await db().notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
    if (r.count === 0) throw notFound('Notification not found.');
    res.json({ ok: true });
  }),
);

notificationsRouter.get(
  '/nav-counts',
  requireAuth,
  ah(async (req, res) => {
    const user = currentUser(req);
    const [signoffsAwaiting, unreadNotifications] = await Promise.all([
      db().form.count({ where: { status: { in: ['AWAITING', 'PARTIAL', 'PENDING_APPROVAL'] } } }),
      db().notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    res.json({ signoffsAwaiting, unreadNotifications });
  }),
);
