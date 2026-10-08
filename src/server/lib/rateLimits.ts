import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../env';

const msg = (message: string) => ({ error: message });
const skipInTest = () => env().NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST !== '1';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTest,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
  message: msg('Too many sign-in attempts. Wait 15 minutes and try again.'),
});

export const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: msg('Too many reset requests. Try again in an hour.'),
});

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipInTest,
  message: msg('Too many requests. Please wait a few minutes and try again.'),
});
