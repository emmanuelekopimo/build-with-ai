import { describe, expect, it } from 'vitest';
import { login, PASSWORD } from './helpers';
import request from 'supertest';
import { testApp } from './helpers';

describe('user management (IT_ADMIN only)', () => {
  it('lists, creates, updates and deactivates users; others get 403', async () => {
    const admin = await login();
    const support = await login('IT_SUPPORT');
    expect((await support.get('/api/users')).status).toBe(403);
    const list = await admin.get('/api/users');
    expect(list.body.users.length).toBe(3);
    expect(list.body.users[0].passwordHash).toBeUndefined();
    const bad = await admin.post('/api/users', { name: 'X', email: 'nope', role: 'BOSS', title: 'x', office: 'y', password: 'short' });
    expect(bad.status).toBe(400);
    const created = await admin.post('/api/users', { name: 'Mfon Udo', email: 'mfon.udo@ecews.org', role: 'IT_SUPPORT', title: 'IT Support', office: 'Eket', password: 'Strong-pass-123' });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/users', { name: 'Mfon Udo', email: 'mfon.udo@ecews.org', role: 'IT_SUPPORT', title: 'IT Support', office: 'Eket', password: 'Strong-pass-123' })).status).toBe(409);
    const mfon = request.agent(testApp());
    expect((await mfon.post('/api/auth/login').send({ email: 'mfon.udo@ecews.org', password: 'Strong-pass-123' })).status).toBe(200);
    const off = await admin.patch(`/api/users/${created.body.user.id}`, { active: false });
    expect(off.body.user.active).toBe(false);
    expect((await mfon.get('/api/auth/me')).status).toBe(401);
    expect((await mfon.post('/api/auth/login').send({ email: 'mfon.udo@ecews.org', password: 'Strong-pass-123' })).status).toBe(401);
    expect((await admin.patch(`/api/users/${admin.userId}`, { active: false })).status).toBe(400);
    expect(PASSWORD).toBeTruthy();
  });
});

describe('scheduler', () => {
  it('runs a job once and refuses a concurrent run of the same job', async () => {
    const { runLocked } = await import('../../src/server/jobs/scheduler');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const first = runLocked('test-job', () => gate);
    await new Promise((r) => setTimeout(r, 200));
    const second = await runLocked('test-job', async () => undefined);
    release();
    expect(second).toBe(false);
    expect(await first).toBe(true);
    expect(await runLocked('test-job', async () => undefined)).toBe(true);
  });
});
