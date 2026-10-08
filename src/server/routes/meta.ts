import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { ah, parse } from '../lib/http';
import { requireAuth, requirePermission } from '../middleware/auth';

export const metaRouter = Router();

metaRouter.get(
  '/meta',
  requireAuth,
  ah(async (_req, res) => {
    const [categories, projects, locations] = await Promise.all([
      db().category.findMany({ orderBy: { name: 'asc' } }),
      db().project.findMany({ orderBy: { name: 'asc' } }),
      db().location.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.json({ categories, projects, locations });
  }),
);

const peopleQuery = z.object({
  q: z.string().trim().max(100).default(''),
  type: z.enum(['STAFF', 'VENDOR']).optional(),
});

/** Typeahead over previously entered staff and vendors (D15). */
metaRouter.get(
  '/people',
  requirePermission('people.view'),
  ah(async (req, res) => {
    const { q, type } = parse(peopleQuery, req.query);
    const people = await db().person.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { staffId: { contains: q, mode: 'insensitive' } },
                { company: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 8,
    });
    res.json({ people });
  }),
);
