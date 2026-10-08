import argon2 from 'argon2';
import { Router } from 'express';
import { z } from 'zod';
import { RESET_LINK_HOURS } from '../../shared/constants';
import { db } from '../db';
import { env, isProd } from '../env';
import { passwordResetEmail } from '../email/templates';
import { trySendMail } from '../email/mailer';
import { badRequest, unauthorized } from '../lib/errors';
import { ah, clientIp, parse } from '../lib/http';
import { forgotLimiter, loginLimiter } from '../lib/rateLimits';
import { addHours, hashToken, looksLikeToken, newToken } from '../lib/tokens';
import { audit } from '../services/audit';
import { createSession, destroySession, SESSION_COOKIE, toSessionUser } from '../services/sessions';

export const authRouter = Router();

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env().COOKIE_SECURE ?? isProd(),
  path: '/',
});

// A fixed hash so unknown emails cost the same time as known ones.
let dummyHash: string | null = null;
async function dummyVerify(password: string) {
  dummyHash ??= await argon2.hash('not-a-real-password-for-timing');
  await argon2.verify(dummyHash, password).catch(() => false);
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(200),
});

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await db().user.findUnique({ where: { email } });
    let valid = false;
    if (user && user.active) valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    else await dummyVerify(password);
    if (!user || !valid) {
      await audit({ action: 'auth.login_failed', detail: { email }, ipAddress: clientIp(req) });
      throw unauthorized('Email or password is incorrect.');
    }
    const s = await createSession(user.id, clientIp(req), req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, s.token, { ...cookieOpts(), expires: s.expiresAt });
    await audit({ userId: user.id, action: 'auth.login', ipAddress: clientIp(req) });
    res.json({ user: toSessionUser(user), csrfToken: s.csrfToken, sessionExpiresAt: s.expiresAt });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await destroySession(token);
    if (req.user) await audit({ userId: req.user.id, action: 'auth.logout', ipAddress: clientIp(req) });
    res.clearCookie(SESSION_COOKIE, cookieOpts());
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  ah(async (req, res) => {
    if (!req.user || !req.sessionInfo) throw unauthorized('Not signed in.');
    res.json({ user: req.user, csrfToken: req.sessionInfo.csrfToken, sessionExpiresAt: req.sessionInfo.expiresAt });
  }),
);

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') });

authRouter.post(
  '/forgot',
  forgotLimiter,
  ah(async (req, res) => {
    const { email } = parse(forgotSchema, req.body);
    const user = await db().user.findUnique({ where: { email } });
    if (user && user.active) {
      const { token, hash } = newToken();
      await db().passwordReset.create({
        data: { tokenHash: hash, userId: user.id, expiresAt: addHours(new Date(), RESET_LINK_HOURS) },
      });
      const mail = passwordResetEmail({ name: user.name, link: `${env().APP_BASE_URL}/reset-password/${token}` });
      await trySendMail({ to: user.email, ...mail });
      await audit({ userId: user.id, action: 'auth.reset_requested', ipAddress: clientIp(req) });
    }
    // Never reveal whether the email exists.
    res.json({ ok: true, message: 'If that email belongs to an ITAMS account, a reset link is on its way.' });
  }),
);

const resetSchema = z
  .object({
    token: z.string(),
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .max(200)
      .regex(/[A-Za-z]/, 'Include at least one letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });

authRouter.post(
  '/reset',
  forgotLimiter,
  ah(async (req, res) => {
    const body = parse(resetSchema, req.body);
    const invalid = badRequest('This reset link is invalid or has expired. Request a new one from the sign-in page.');
    if (!looksLikeToken(body.token)) throw invalid;
    const reset = await db().passwordReset.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw invalid;
    const passwordHash = await argon2.hash(body.password);
    await db().$transaction([
      db().passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      db().user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      // Session invalidation on password reset.
      db().session.deleteMany({ where: { userId: reset.userId } }),
    ]);
    await audit({ userId: reset.userId, action: 'auth.password_reset', ipAddress: clientIp(req) });
    res.json({ ok: true });
  }),
);
