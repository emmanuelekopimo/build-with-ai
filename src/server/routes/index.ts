import { Router } from 'express';
import { authRouter } from './auth';
import { metaRouter } from './meta';
import { notificationsRouter } from './notifications';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/', metaRouter);
apiRouter.use('/', notificationsRouter);
