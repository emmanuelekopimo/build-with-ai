import { Router } from 'express';
import { z } from 'zod';
import { ah, clientIp, parse } from '../lib/http';
import { currentUser, requirePermission } from '../middleware/auth';
import { previewTags } from '../services/numbering';
import { createIntake, discardIntake, getIntake, intakeInput, updateIntake, validateIntake } from '../services/intake';

export const intakesRouter = Router();
const idParam = z.object({ id: z.string().uuid('Invalid intake id.') });

intakesRouter.use('/intakes', requirePermission('intake.manage'));

intakesRouter.get(
  '/intakes/tag-preview',
  ah(async (req, res) => {
    const { count } = parse(z.object({ count: z.coerce.number().int().min(0).max(200).default(1) }), req.query);
    res.json({ tags: await previewTags(count) });
  }),
);

intakesRouter.post(
  '/intakes',
  ah(async (req, res) => {
    res.status(201).json(await createIntake(parse(intakeInput, req.body), currentUser(req)));
  }),
);

intakesRouter.get(
  '/intakes/:id',
  ah(async (req, res) => {
    res.json(await getIntake(parse(idParam, req.params).id));
  }),
);

intakesRouter.patch(
  '/intakes/:id',
  ah(async (req, res) => {
    res.json(await updateIntake(parse(idParam, req.params).id, parse(intakeInput, req.body), currentUser(req)));
  }),
);

intakesRouter.delete(
  '/intakes/:id',
  ah(async (req, res) => {
    await discardIntake(parse(idParam, req.params).id, currentUser(req));
    res.json({ ok: true });
  }),
);

intakesRouter.post(
  '/intakes/:id/validate',
  ah(async (req, res) => {
    res.json(await validateIntake(parse(idParam, req.params).id, currentUser(req), clientIp(req)));
  }),
);
