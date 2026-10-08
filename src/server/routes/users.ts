// IT_ADMIN user management (D33): API only; no screen exists in the design package.
import argon2 from 'argon2';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { ah, clientIp, parse } from '../lib/http';
import { currentUser, requirePermission } from '../middleware/auth';
import { audit } from '../services/audit';

export const usersRouter = Router();
usersRouter.use('/users', requirePermission('user.manage'));

const select = { id: true, name: true, email: true, role: true, title: true, office: true, active: true, createdAt: true } as const;
const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200)
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

usersRouter.get('/users', ah(async (_req, res) => res.json({ users: await db().user.findMany({ select, orderBy: { name: 'asc' } }) })));

const createBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['IT_ADMIN', 'IT_SUPPORT', 'VIEWER']),
  title: z.string().trim().min(2).max(80),
  office: z.string().trim().min(2).max(80),
  password,
});

usersRouter.post(
  '/users',
  ah(async (req, res) => {
    const b = parse(createBody, req.body);
    if (await db().user.findUnique({ where: { email: b.email } })) throw conflict('A user with this email already exists.');
    const { password: pw, ...rest } = b;
    const user = await db().user.create({ data: { ...rest, passwordHash: await argon2.hash(pw) }, select });
    await audit({ userId: currentUser(req).id, action: 'user.create', entityType: 'User', entityId: user.id, detail: { email: user.email, role: user.role }, ipAddress: clientIp(req) });
    res.status(201).json({ user });
  }),
);

const patchBody = z
  .object({
    role: z.enum(['IT_ADMIN', 'IT_SUPPORT', 'VIEWER']).optional(),
    title: z.string().trim().min(2).max(80).optional(),
    office: z.string().trim().min(2).max(80).optional(),
    active: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change.');

usersRouter.patch(
  '/users/:id',
  ah(async (req, res) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(patchBody, req.body);
    const me = currentUser(req);
    const target = await db().user.findUnique({ where: { id } });
    if (!target) throw notFound('User not found.');
    if (id === me.id && (b.active === false || (b.role && b.role !== 'IT_ADMIN'))) throw badRequest('You cannot deactivate or demote your own account.');
    const { password: pw, ...rest } = b;
    const user = await db().$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { ...rest, ...(pw ? { passwordHash: await argon2.hash(pw) } : {}) }, select });
      // Role changes, deactivation and password changes end existing sessions.
      if (pw || b.active === false || b.role) await tx.session.deleteMany({ where: { userId: id } });
      return u;
    });
    await audit({ userId: me.id, action: 'user.update', entityType: 'User', entityId: id, detail: { ...rest, passwordChanged: !!pw }, ipAddress: clientIp(req) });
    res.json({ user });
  }),
);
