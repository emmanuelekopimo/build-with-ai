import { Router } from 'express';
import { assetsRouter } from './assets';
import { authRouter } from './auth';
import { intakesRouter } from './intakes';
import { metaRouter } from './meta';
import { notificationsRouter } from './notifications';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/', metaRouter);
apiRouter.use('/', notificationsRouter);
apiRouter.use('/', assetsRouter);
apiRouter.use('/', intakesRouter);
