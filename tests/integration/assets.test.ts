import { describe, expect, it } from 'vitest';
import { db } from '../../src/server/db';
import { intakeAssets } from './fixtures';
import { login } from './helpers';

describe('asset registry', () => {
  it('lists with filters, search, sorting and pagination; excludes soft-deleted', async () => {
    const s = await login();
    const tags = await intakeAssets(s, [{}, {}, { result: 'FAILED' }, { category: 'Mobile Phone', makeModel: 'iPhone 13' }]);
    const all = await s.get('/api/assets?pageSize=2');
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.total).toBeGreaterThanOrEqual(4);
    const damaged = await s.get('/api/assets?status=DAMAGED');
    expect(damaged.body.items.every((a: { status: string }) => a.status === 'DAMAGED')).toBe(true);
    expect(damaged.body.items.some((a: { tag: string }) => a.tag === tags[2])).toBe(true);
    const search = await s.get('/api/assets?q=iphone');
    expect(search.body.items.map((a: { tag: string }) => a.tag)).toEqual([tags[3]]);
    const desc = await s.get('/api/assets?sort=tag&dir=desc&pageSize=1');
    expect(desc.body.items[0].tag).toBe(tags[3]);
    const bad = await s.get('/api/assets?status=IN_STOCK');
    expect(bad.status).toBe(400);
  });

  it('picker mode marks availability and only offers the right states', async () => {
    const s = await login();
    const [inStore, , failed] = await intakeAssets(s, [{}, {}, { result: 'FAILED' }]);
    const pick = await s.get('/api/assets?for=ISSUANCE&pageSize=100');
    const tags = pick.body.items.map((a: { tag: string }) => a.tag);
    expect(tags).toContain(inStore);
    expect(tags).not.toContain(failed);
    expect(pick.body.items.every((a: { available: boolean }) => a.available)).toBe(true);
    const vendor = await s.get('/api/assets?for=MOVEMENT_VENDOR&pageSize=100');
    expect(vendor.body.items.map((a: { tag: string }) => a.tag)).toContain(failed);
    const viewer = await login('VIEWER');
    expect((await viewer.get('/api/assets?for=ISSUANCE')).status).toBe(403);
    expect((await viewer.get('/api/assets')).status).toBe(200);
  });

  it('detail returns header, actions per state, timeline and intake snapshot; 404 for unknown', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const d = await s.get(`/api/assets/${tag}`);
    expect(d.status).toBe(200);
    expect(d.body.asset.status).toBe('IN_STORE');
    expect(d.body.actions.map((a: { action: string }) => a.action)).toEqual(['ISSUE', 'REPORT_DAMAGE']);
    expect(d.body.actions[0].primary).toBe(true);
    expect(d.body.timeline[0].type).toBe('INTAKE_VALIDATED');
    expect(d.body.intake.supplier).toBe('Dell EMC Nigeria');
    expect(d.body.totals).toEqual({ intake: 1, issuances: 0, movements: 0, returns: 0 });
    expect((await s.get('/api/assets/ECEWS-IT-9999')).status).toBe(404);
    expect((await s.get('/api/assets/not-a-tag')).status).toBe(400);
  });

  it('report damage: validates notes, moves to Damaged with origin REPORTED, rejects twice (409)', async () => {
    const s = await login('IT_SUPPORT');
    const [tag] = await intakeAssets(s, [{}]);
    const short = await s.post(`/api/assets/${tag}/report-damage`, { condition: 'POOR', notes: 'short' });
    expect(short.status).toBe(400);
    const good = await s.post(`/api/assets/${tag}/report-damage`, { condition: 'GOOD', notes: 'Screen cracked badly' });
    expect(good.status).toBe(400); // Good is not offered when reporting damage
    const ok = await s.post(`/api/assets/${tag}/report-damage`, { condition: 'DAMAGED', notes: 'Screen cracked, bottom-left corner' });
    expect(ok.status).toBe(200);
    const a = await db().asset.findUniqueOrThrow({ where: { tag } });
    expect(a.status).toBe('DAMAGED');
    expect(a.damageOrigin).toBe('REPORTED');
    const again = await s.post(`/api/assets/${tag}/report-damage`, { condition: 'POOR', notes: 'Screen cracked again here' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Cannot report damage on an asset that is Damaged.');
    const d = await s.get(`/api/assets/${tag}`);
    // IT Support does not see Retire (hidden, §4.3).
    expect(d.body.actions.map((x: { action: string }) => x.action)).toEqual(['SEND_FOR_REPAIR']);
    const v = await login('VIEWER');
    expect((await v.post(`/api/assets/${tag}/report-damage`, { condition: 'POOR', notes: 'Viewer cannot do this' })).status).toBe(403);
  });

  it('retire: admin only, Damaged only, writes custody', async () => {
    const admin = await login();
    const support = await login('IT_SUPPORT');
    const [tag, storeTag] = await intakeAssets(admin, [{ result: 'FAILED' }, {}]);
    const body = { reason: 'REJECTED_AT_INTAKE', notes: 'Rejected, returned to supplier' };
    expect((await support.post(`/api/assets/${tag}/retire`, body)).status).toBe(403);
    expect((await admin.post(`/api/assets/${storeTag}/retire`, body)).status).toBe(409);
    expect((await admin.post(`/api/assets/${tag}/retire`, { reason: 'NOPE', notes: 'x' })).status).toBe(400);
    const ok = await admin.post(`/api/assets/${tag}/retire`, body);
    expect(ok.status).toBe(200);
    const a = await db().asset.findUniqueOrThrow({ where: { tag } });
    expect(a.status).toBe('RETIRED');
    expect(a.damageOrigin).toBeNull();
    const d = await admin.get(`/api/assets/${tag}`);
    expect(d.body.actions.map((x: { action: string }) => x.action)).toEqual(['REPAIR', 'DELETE']);
    expect(d.body.timeline.at(-1).type).toBe('RETIRED');
  });

  it('delete: Retired only, type-the-tag confirmation, soft delete keeps history', async () => {
    const admin = await login();
    const [tag] = await intakeAssets(admin, [{ result: 'FAILED' }]);
    const del = { confirmTag: tag, reason: 'Disposed after audit' };
    expect((await admin.post(`/api/assets/${tag}/delete`, del)).status).toBe(409); // still Damaged
    await admin.post(`/api/assets/${tag}/retire`, { reason: 'OBSOLETE', notes: 'Old model, not worth fixing' });
    expect((await admin.post(`/api/assets/${tag}/delete`, { ...del, confirmTag: 'ECEWS-IT-0000' })).status).toBe(400);
    const support = await login('IT_SUPPORT');
    expect((await support.post(`/api/assets/${tag}/delete`, del)).status).toBe(403);
    expect((await admin.post(`/api/assets/${tag}/delete`, del)).status).toBe(200);
    const list = await admin.get('/api/assets?pageSize=100&status=RETIRED');
    expect(list.body.items.map((a: { tag: string }) => a.tag)).not.toContain(tag);
    const deleted = await admin.get('/api/assets?status=DELETED');
    expect(deleted.body.items.map((a: { tag: string }) => a.tag)).toContain(tag);
    expect((await support.get('/api/assets?status=DELETED')).status).toBe(403);
    expect((await support.get(`/api/assets/${tag}`)).status).toBe(404);
    const a = await db().asset.findUniqueOrThrow({ where: { tag }, include: { custodyEvents: true } });
    expect(a.deletedAt).not.toBeNull();
    expect(a.custodyEvents.map((e) => e.type)).toEqual(expect.arrayContaining(['INTAKE_FAILED', 'RETIRED', 'DELETED']));
    expect((await admin.post(`/api/assets/${tag}/delete`, del)).status).toBe(409);
  });

  it('custody events are append-only at the database level', async () => {
    const e = await db().custodyEvent.findFirstOrThrow();
    await expect(db().custodyEvent.update({ where: { id: e.id }, data: { actorName: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(db().custodyEvent.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
  });

  it('database rejects impossible states (CHECK constraints)', async () => {
    const a = await db().asset.findFirstOrThrow({ where: { status: 'IN_STORE' } });
    await expect(db().asset.update({ where: { id: a.id }, data: { status: 'ISSUED' } })).rejects.toThrow();
    await expect(db().asset.update({ where: { id: a.id }, data: { damageOrigin: 'REPORTED' } })).rejects.toThrow();
  });
});
