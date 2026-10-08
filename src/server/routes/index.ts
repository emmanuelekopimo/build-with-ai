import { Router } from 'express';
import { assetsRouter } from './assets';
import { authRouter } from './auth';
import { formsRouter } from './forms';
import { intakesRouter } from './intakes';
import { publicRouter } from './public';
import { reportsRouter } from './reports';
import { metaRouter } from './meta';
import { notificationsRouter } from './notifications';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/', metaRouter);
apiRouter.use('/', notificationsRouter);
apiRouter.use('/', assetsRouter);
apiRouter.use('/', intakesRouter);
apiRouter.use('/', formsRouter);
apiRouter.use('/', reportsRouter);
apiRouter.use('/public', publicRouter);
