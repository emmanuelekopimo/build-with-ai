import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../../src/server/db';
import { getOutbox } from '../../src/server/email/mailer';
import { login, PASSWORD, testApp, USERS } from './helpers';

describe('auth', () => {
  it('rejects bad credentials with a generic message (401)', async () => {
    const res = await request(testApp()).post('/api/auth/login').send({ email: USERS.IT_ADMIN.email, password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Email or password is incorrect.');
    const unknown = await request(testApp()).post('/api/auth/login').send({ email: 'ghost@ecews.org', password: 'nope' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(res.body.error);
  });

  it('validates the login body (400)', async () => {
    const res = await request(testApp()).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.email).toBeDefined();
  });

  it('logs in with an httpOnly cookie and exposes /me', async () => {
    const res = await request(testApp()).post('/api/auth/login').send({ email: USERS.IT_ADMIN.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('itams_sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const s = await login('IT_SUPPORT');
    const me = await s.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('IT_SUPPORT');
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('requires a session for protected routes (401)', async () => {
    const res = await request(testApp()).get('/api/meta');
    expect(res.status).toBe(401);
  });

  it('enforces CSRF on authenticated mutations (403) and JSON bodies (415)', async () => {
    const s = await login();
    const noToken = await s.agent.post('/api/notifications/read-all').send({});
    expect(noToken.status).toBe(403);
    const form = await s.agent.post('/api/notifications/read-all').set('X-CSRF-Token', s.csrf).type('form').send('a=1');
    expect(form.status).toBe(415);
    const ok = await s.post('/api/notifications/read-all');
    expect(ok.status).toBe(200);
  });

  it('logs out and kills the session', async () => {
    const s = await login();
    expect((await s.post('/api/auth/logout')).status).toBe(200);
    expect((await s.get('/api/auth/me')).status).toBe(401);
  });

  it('forgot password never reveals whether the email exists, and reset invalidates sessions', async () => {
    const s = await login('IT_SUPPORT');
    const a = await request(testApp()).post('/api/auth/forgot').send({ email: 'ghost@ecews.org' });
    const b = await request(testApp()).post('/api/auth/forgot').send({ email: USERS.IT_SUPPORT.email });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.message).toBe(b.body.message);
    const mail = getOutbox().find((m) => m.to === USERS.IT_SUPPORT.email);
    expect(mail).toBeDefined();
    const token = /reset-password\/([A-Za-z0-9_-]{43})/.exec(mail!.text)?.[1];
    expect(token).toBeDefined();

    const weak = await request(testApp()).post('/api/auth/reset').send({ token, password: 'short', confirm: 'short' });
    expect(weak.status).toBe(400);
    const ok = await request(testApp())
      .post('/api/auth/reset')
      .send({ token, password: 'New-password-2026', confirm: 'New-password-2026' });
    expect(ok.status).toBe(200);
    expect((await s.get('/api/auth/me')).status).toBe(401);
    const reuse = await request(testApp())
      .post('/api/auth/reset')
      .send({ token, password: 'Other-password-2026', confirm: 'Other-password-2026' });
    expect(reuse.status).toBe(400);
    const relog = await request(testApp())
      .post('/api/auth/login')
      .send({ email: USERS.IT_SUPPORT.email, password: 'New-password-2026' });
    expect(relog.status).toBe(200);
    expect(await db().passwordReset.count({ where: { usedAt: { not: null } } })).toBe(1);
  });

  it('serves no-index headers on public endpoints', async () => {
    const res = await request(testApp()).get('/api/public/sign/abc');
    expect(res.headers['x-robots-tag']).toContain('noindex');
  });
});

describe('login rate limiting', () => {
  it('locks out after repeated failures (429)', async () => {
    process.env.RATE_LIMIT_TEST = '1';
    try {
      let last = 0;
      for (let i = 0; i < 11; i++) {
        const r = await request(testApp()).post('/api/auth/login').send({ email: 'limit@ecews.org', password: 'bad' });
        last = r.status;
      }
      expect(last).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_TEST;
    }
  });
});
