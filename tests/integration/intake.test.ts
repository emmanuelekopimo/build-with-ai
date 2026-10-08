import { describe, expect, it } from 'vitest';
import { db } from '../../src/server/db';
import { intakeBody } from './fixtures';
import { login } from './helpers';

describe('intake (Form 1)', () => {
  it('creates a draft with a reference, auto-saves it and previews tags', async () => {
    const s = await login('IT_SUPPORT');
    const res = await s.post('/api/intakes', { supplier: 'Lenovo Nigeria' });
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^IN-\d{3}$/);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.checks).toHaveLength(7);
    const body = await intakeBody([{}, {}]);
    const saved = await s.patch(`/api/intakes/${res.body.id}`, body);
    expect(saved.status).toBe(200);
    expect(saved.body.lineItems).toHaveLength(2);
    const preview = await s.get('/api/intakes/tag-preview?count=2');
    expect(preview.body.tags).toHaveLength(2);
    expect(preview.body.tags[0]).toMatch(/^ECEWS-IT-\d{4}$/);
  });

  it('refuses to validate an incomplete intake (400) with field errors', async () => {
    const s = await login();
    const draft = await s.post('/api/intakes', { supplier: 'X' });
    const res = await s.post(`/api/intakes/${draft.body.id}/validate`);
    expect(res.status).toBe(400);
    expect(res.body.fields.poReference).toBeDefined();
    expect(res.body.fields.lineItems).toBe('Add at least one line item.');
    expect(res.body.fields['checks.0']).toContain('Answer check 1');
    expect(await db().asset.count()).toBe(0);
  });

  it('splits pass/fail: passed → In Store, failed → Damaged (intake failure), sequential tags, atomic', async () => {
    const s = await login();
    const before = await db().asset.count();
    const draft = await s.post('/api/intakes', await intakeBody([{}, { result: 'FAILED' }, {}]));
    const res = await s.post(`/api/intakes/${draft.body.id}/validate`);
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(2);
    expect(res.body.failed).toBe(1);
    const tags: string[] = res.body.created.map((c: { tag: string }) => c.tag);
    const nums = tags.map((t) => Number(t.slice(-4)));
    expect(nums[1]).toBe(nums[0]! + 1);
    expect(nums[2]).toBe(nums[0]! + 2);
    const assets = await db().asset.findMany({ where: { tag: { in: tags } }, orderBy: { tagNumber: 'asc' } });
    expect(assets.map((a) => a.status)).toEqual(['IN_STORE', 'DAMAGED', 'IN_STORE']);
    expect(assets[1]!.damageOrigin).toBe('INTAKE_FAILURE');
    expect(assets[0]!.damageOrigin).toBeNull();
    expect(assets.every((a) => a.oemSupport)).toBe(true);
    const events = await db().custodyEvent.findMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
    expect(events.map((e) => e.type).sort()).toEqual(['INTAKE_FAILED', 'INTAKE_VALIDATED', 'INTAKE_VALIDATED']);
    expect(await db().asset.count()).toBe(before + 3);

    // Idempotent: re-submitting returns the same result and creates nothing.
    const again = await s.post(`/api/intakes/${draft.body.id}/validate`);
    expect(again.status).toBe(200);
    expect(again.body.alreadyValidated).toBe(true);
    expect(again.body.created.map((c: { tag: string }) => c.tag)).toEqual(tags);
    expect(await db().asset.count()).toBe(before + 3);

    // Validated intakes cannot be edited or discarded.
    expect((await s.patch(`/api/intakes/${draft.body.id}`, await intakeBody([{}]))).status).toBe(409);
    expect((await s.del(`/api/intakes/${draft.body.id}`)).status).toBe(409);
  });

  it('flags a quantity mismatch and rolls back entirely on a duplicate serial (409)', async () => {
    const s = await login();
    const body = await intakeBody([{ serial: 'DUP-1' }]);
    body.checks[0] = { answer: 'NO', remark: 'Short by one' };
    const first = await s.post('/api/intakes', body);
    const ok = await s.post(`/api/intakes/${first.body.id}/validate`);
    expect(ok.body.quantityMismatch).toBe(true);
    const before = await db().asset.count();
    const second = await s.post('/api/intakes', await intakeBody([{ serial: 'NEW-OK-1' }, { serial: 'DUP-1' }]));
    const dup = await s.post(`/api/intakes/${second.body.id}/validate`);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toContain('already registered');
    expect(await db().asset.count()).toBe(before);
    const still = await s.get(`/api/intakes/${second.body.id}`);
    expect(still.body.status).toBe('DRAFT');
  });

  it('discards drafts and forbids viewers (403)', async () => {
    const s = await login();
    const draft = await s.post('/api/intakes', {});
    expect((await s.del(`/api/intakes/${draft.body.id}`)).status).toBe(200);
    expect((await s.get(`/api/intakes/${draft.body.id}`)).status).toBe(404);
    const v = await login('VIEWER');
    expect((await v.post('/api/intakes', {})).status).toBe(403);
    expect((await v.get('/api/intakes/tag-preview')).status).toBe(403);
  });

  it('rejects malformed bodies (400) and unknown ids (404)', async () => {
    const s = await login();
    expect((await s.post('/api/intakes', { lineItems: [{ categoryId: 'nope' }] })).status).toBe(400);
    expect((await s.get('/api/intakes/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await s.get('/api/intakes/not-a-uuid')).status).toBe(400);
  });
});
