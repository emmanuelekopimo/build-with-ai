// Login-free endpoints for signers and approvers. Rate-limited, no cookies, never indexed.
import { Router } from 'express';
import { z } from 'zod';
import { ah, clientIp, parse } from '../lib/http';
import { publicLimiter } from '../lib/rateLimits';
import { approveBody, getApprovalView, getSigningView, signBody, submitApproval, submitSignature } from '../services/forms/public';

export const publicRouter = Router();
publicRouter.use(publicLimiter);
const tokenParam = z.object({ token: z.string().max(100) });

publicRouter.get('/sign/:token', ah(async (req, res) => res.json(await getSigningView(parse(tokenParam, req.params).token))));
publicRouter.post(
  '/sign/:token',
  ah(async (req, res) => {
    const { token } = parse(tokenParam, req.params);
    res.json(await submitSignature(token, parse(signBody, req.body), { ip: clientIp(req), ua: req.headers['user-agent'] }));
  }),
);
publicRouter.get('/approve/:token', ah(async (req, res) => res.json(await getApprovalView(parse(tokenParam, req.params).token))));
publicRouter.post(
  '/approve/:token',
  ah(async (req, res) => {
    const { token } = parse(tokenParam, req.params);
    res.json(await submitApproval(token, parse(approveBody, req.body), { ip: clientIp(req), ua: req.headers['user-agent'] }));
  }),
);
