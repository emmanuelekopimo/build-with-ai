import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../../src/server/db';
import { getOutbox } from '../../src/server/email/mailer';
import { intakeAssets, lastLink, signBodyFor, STAFF } from './fixtures';
import { login, testApp, type Session } from './helpers';

const pub = () => request(testApp());

async function issue(s: Session, tags: string[], who: { name: string; email: string; department: string; staffId: string; phone?: string } = STAFF.samuel, extra: Record<string, unknown> = {}) {
  const res = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: tags, data: { recipient: who, ...extra }, send: true });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; reference: string; status: string };
}

async function sign(email: string, name: string, terms = 3) {
  const token = lastLink(email);
  return pub().post(`/api/public/sign/${token}`).send(signBodyFor(name, terms));
}

describe('issuance (Form 2)', () => {
  it('sends for signature, keeps the asset In Store but locked until signed, then issues it', async () => {
    const s = await login();
    const [tag, tag2] = await intakeAssets(s, [{}, { category: 'Wireless Mouse', makeModel: 'Logitech M185' }]);
    const form = await issue(s, [tag!, tag2!]);
    expect(form.reference).toMatch(/^ISS-\d{4}$/);
    expect(form.status).toBe('AWAITING');
    const mail = getOutbox().at(-1)!;
    expect(mail.subject).toBe(`Please sign: ${form.reference} - Issuance & indemnity form`);
    expect(mail.text).toContain('http://itams.test/sign/');

    const a = await db().asset.findUniqueOrThrow({ where: { tag } });
    expect(a.status).toBe('IN_STORE');
    const detail = await s.get(`/api/assets/${tag}`);
    expect(detail.body.activeForm.reference).toBe(form.reference);
    expect(detail.body.actions.every((x: { enabled: boolean }) => !x.enabled)).toBe(true);

    // Public view shows the document; a wrong typed name is rejected.
    const token = lastLink(STAFF.samuel.email);
    const view = await pub().get(`/api/public/sign/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.reference).toBe(form.reference);
    expect(view.body.assets).toHaveLength(2);
    expect(view.headers['x-robots-tag']).toContain('noindex');
    expect(view.headers['set-cookie']).toBeUndefined();
    const wrong = await pub().post(`/api/public/sign/${token}`).send(signBodyFor('Someone Else', 3));
    expect(wrong.status).toBe(400);
    const missingTerms = await pub().post(`/api/public/sign/${token}`).send({ ...signBodyFor('Samuel Etuk', 2) });
    expect(missingTerms.status).toBe(400);

    const ok = await pub().post(`/api/public/sign/${token}`).set('User-Agent', 'vitest-agent').send(signBodyFor('samuel  etuk', 3));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('SIGNED');
    const issued = await db().asset.findUniqueOrThrow({ where: { tag }, include: { currentHolder: true } });
    expect(issued.status).toBe('ISSUED');
    expect(issued.currentHolder?.name).toBe('Samuel Etuk');
    const f = await db().form.findUniqueOrThrow({ where: { id: form.id }, include: { parties: true, document: true } });
    const recipient = f.parties.find((p) => p.role === 'RECIPIENT')!;
    expect(recipient.ipAddress).toBeTruthy();
    expect(recipient.userAgent).toBe('vitest-agent');
    expect(f.parties.find((p) => p.role === 'ISSUER')!.status).toBe('SIGNED');
    expect(Buffer.from(f.document!.pdf).subarray(0, 4).toString()).toBe('%PDF');
    const receipt = getOutbox().find((m) => m.subject.startsWith(`Signature received: ${form.reference}`));
    expect(receipt?.attachments?.[0]?.filename).toBe(`ECEWS-ITAMS-${form.reference}.pdf`);

    // Reusing the link reveals nothing.
    const reuse = await pub().get(`/api/public/sign/${token}`);
    expect(reuse.status).toBe(410);
    expect(reuse.body.state).toBe('used');
    expect(reuse.body.reference).toBeUndefined();
    const reuseSign = await pub().post(`/api/public/sign/${token}`).send(signBodyFor('Samuel Etuk', 3));
    expect(reuseSign.status).toBe(410);
  });

  it('rejects tampered and malformed tokens without leaking data', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    await issue(s, [tag!]);
    const token = lastLink(STAFF.samuel.email);
    const tampered = (token[5] === 'a' ? 'b' : 'a');
    const t2 = token.slice(0, 5) + tampered + token.slice(6);
    for (const bad of [t2, 'short', 'x'.repeat(43)]) {
      const r = await pub().get(`/api/public/sign/${bad}`);
      expect(r.status).toBe(410);
      expect(r.body.state).toBe('invalid');
      expect(Object.keys(r.body).sort()).toEqual(['error', 'itContact', 'state']);
    }
  });

  it('only In Store assets can be issued; an asset can be on only one active form (409)', async () => {
    const s = await login();
    const [tag, failed] = await intakeAssets(s, [{}, { result: 'FAILED' }]);
    const bad = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [failed], data: { recipient: STAFF.samuel }, send: true });
    expect(bad.status).toBe(409);
    expect(bad.body.error).toContain('Only In Store assets can be issued');
    await issue(s, [tag!]);
    const second = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.ima }, send: true });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already on ISS-\d{4} \(awaiting\)/);
    // Nothing half-written: the failed attempt created no form.
    expect(await db().form.count({ where: { data: { path: ['recipient', 'email'], equals: STAFF.ima.email } } })).toBe(0);
  });

  it('concurrency: two simultaneous forms for the same asset — exactly one succeeds', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const results = await Promise.all([
      s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.samuel }, send: true }),
      s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.ima }, send: true }),
    ]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    const asset = await db().asset.findUniqueOrThrow({ where: { tag } });
    expect(await db().formAsset.count({ where: { assetId: asset.id, active: true } })).toBe(1);
  });

  it('idempotency key: a double submit creates one form', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const key = '7c3a1d0e-1111-4c4c-9a9a-123456789abc';
    const body = { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.samuel }, send: true };
    const [a, b] = await Promise.all([s.post('/api/forms', body, { 'Idempotency-Key': key }), s.post('/api/forms', body, { 'Idempotency-Key': key })]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
  });

  it('validates the payload (400) and permissions (403 for viewers)', async () => {
    const s = await login('IT_SUPPORT');
    const [tag] = await intakeAssets(s, [{}]);
    const res = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: { name: 'X' } }, send: true });
    expect(res.status).toBe(400);
    const v = await login('VIEWER');
    expect((await v.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: {} })).status).toBe(403);
    expect((await v.get('/api/signoffs')).status).toBe(403);
  });

  it('drafts: save, edit, send later, discard; drafts do not lock assets', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const d = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: { name: 'Sam' } } });
    expect(d.status).toBe(201);
    expect(d.body.status).toBe('DRAFT');
    const other = await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: {} });
    expect(other.status).toBe(201);
    expect((await s.post(`/api/forms/${d.body.id}/send`)).status).toBe(400);
    expect((await s.patch(`/api/forms/${d.body.id}`, { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.samuel } })).status).toBe(200);
    const sent = await s.post(`/api/forms/${d.body.id}/send`);
    expect(sent.body.status).toBe('AWAITING');
    expect((await s.post(`/api/forms/${other.body.id}/send`)).status).toBe(400); // incomplete payload first
    expect((await s.del(`/api/forms/${d.body.id}`)).status).toBe(409);
    expect((await s.del(`/api/forms/${other.body.id}`)).status).toBe(200);
  });
});

describe('expiry, resend and cancel', () => {
  it('expired links show the expired state; resend issues a fresh 7-day link and revokes the old one', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const form = await issue(s, [tag!]);
    const oldToken = lastLink(STAFF.samuel.email);
    await db().party.updateMany({ where: { formId: form.id, role: 'RECIPIENT' }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    const { expireLinksJob } = await import('../../src/server/services/forms/manage');
    expect(await expireLinksJob()).toBe(1);
    expect((await db().form.findUniqueOrThrow({ where: { id: form.id } })).status).toBe('EXPIRED');
    const exp = await pub().get(`/api/public/sign/${oldToken}`);
    expect(exp.status).toBe(410);
    expect(exp.body.state).toBe('expired');
    // Still locked while expired.
    expect((await s.post('/api/forms', { type: 'ISSUANCE', assetTags: [tag], data: { recipient: STAFF.ima }, send: true })).status).toBe(409);

    const r = await s.post(`/api/forms/${form.id}/resend`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('AWAITING');
    expect(new Date(r.body.deadline).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400000);
    const newToken = lastLink(STAFF.samuel.email);
    expect(newToken).not.toBe(oldToken);
    expect((await pub().get(`/api/public/sign/${oldToken}`)).body.state).toBe('invalid');
    expect(getOutbox().at(-1)!.subject).toMatch(/^Reminder: please sign/);
    expect((await pub().post(`/api/public/sign/${newToken}`).send(signBodyFor('Samuel Etuk', 3))).status).toBe(200);
  });

  it('cancel releases the lock and invalidates links; signed forms cannot be cancelled', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const form = await issue(s, [tag!]);
    const token = lastLink(STAFF.samuel.email);
    expect((await s.post(`/api/forms/${form.id}/cancel`)).status).toBe(200);
    expect((await pub().get(`/api/public/sign/${token}`)).status).toBe(410);
    const again = await issue(s, [tag!], STAFF.ima);
    await sign(STAFF.ima.email, STAFF.ima.name);
    expect((await s.post(`/api/forms/${again.id}/cancel`)).status).toBe(409);
    expect((await s.post(`/api/forms/${again.id}/resend`)).status).toBe(409);
  });

  it('auto-reminder after 48h sends one fresh link with the same expiry', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const form = await issue(s, [tag!]);
    const before = await db().party.findFirstOrThrow({ where: { formId: form.id, role: 'RECIPIENT' } });
    await db().party.update({ where: { id: before.id }, data: { tokenIssuedAt: new Date(Date.now() - 49 * 3600000) } });
    const { autoReminderJob } = await import('../../src/server/services/forms/manage');
    expect(await autoReminderJob()).toBe(1);
    expect(await autoReminderJob()).toBe(0);
    const after = await db().party.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.tokenExpiresAt?.getTime()).toBe(before.tokenExpiresAt?.getTime());
    expect(after.tokenHash).not.toBe(before.tokenHash);
  });

  it('bulk reminders report per document', async () => {
    const s = await login();
    const [t1, t2] = await intakeAssets(s, [{}, {}]);
    const a = await issue(s, [t1!]);
    const b = await issue(s, [t2!], STAFF.ima);
    await sign(STAFF.ima.email, STAFF.ima.name);
    const r = await s.post('/api/forms/remind', { formIds: [a.id, b.id] });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(1);
    expect(r.body.results.find((x: { id: string }) => x.id === b.id).ok).toBe(false);
  });
});

describe('return (Form 4)', () => {
  it('Good/Fair → In Store, Poor/Damaged → Damaged (RETURNED); only after the acknowledgment is signed', async () => {
    const s = await login();
    const [laptop, mouse] = await intakeAssets(s, [{}, { category: 'Wireless Mouse', makeModel: 'Logitech M185' }]);
    await issue(s, [laptop!, mouse!]);
    await sign(STAFF.samuel.email, STAFF.samuel.name);
    // Returner must hold the assets.
    const wrong = await s.post('/api/forms', {
      type: 'RETURN',
      assetTags: [laptop],
      data: { returnerType: 'STAFF', returner: STAFF.ima, items: [{ tag: laptop, condition: 'GOOD' }], returnDate: '2026-08-14' },
      send: true,
    });
    expect(wrong.status).toBe(409);
    const res = await s.post('/api/forms', {
      type: 'RETURN',
      assetTags: [laptop, mouse],
      data: {
        returnerType: 'STAFF',
        returner: STAFF.samuel,
        items: [
          { tag: laptop, condition: 'GOOD' },
          { tag: mouse, condition: 'DAMAGED' },
        ],
        conditionNotes: 'Laptop screen and battery verified, mouse wheel broken',
        returnDate: '2026-08-14',
      },
      send: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^RTR-/);
    expect((await db().asset.findUniqueOrThrow({ where: { tag: laptop } })).status).toBe('ISSUED');
    expect(getOutbox().at(-1)!.subject).toBe(`Please confirm: ${res.body.reference} - Return confirmation`);
    const signed = await sign(STAFF.samuel.email, STAFF.samuel.name, 2);
    expect(signed.status).toBe(200);
    const l = await db().asset.findUniqueOrThrow({ where: { tag: laptop } });
    const m = await db().asset.findUniqueOrThrow({ where: { tag: mouse } });
    expect([l.status, l.currentHolderId]).toEqual(['IN_STORE', null]);
    expect([m.status, m.damageOrigin, m.currentHolderId]).toEqual(['DAMAGED', 'RETURNED', null]);
    // Re-issuing a returned asset is recorded as Re-issued.
    await issue(s, [laptop!]);
    await sign(STAFF.samuel.email, STAFF.samuel.name);
    const d = await s.get(`/api/assets/${laptop}`);
    expect(d.body.timeline.map((e: { type: string }) => e.type)).toEqual(['INTAKE_VALIDATED', 'ISSUED', 'RETURNED', 'REISSUED']);
    expect(d.body.totals).toEqual({ intake: 1, issuances: 2, movements: 0, returns: 1 });
  });
});

describe('movement (Form 3) with CTO → Admin approval', () => {
  const approvers = { cto: { name: 'CTO Person', email: 'cto@ecews.org' }, admin: { name: 'Admin Officer', email: 'admin.officer@ecews.org' } };

  it('staff → staff: CTO then Admin approve, handover + new indemnity signed, holder and location change', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const iss = await issue(s, [tag!]);
    await sign(STAFF.samuel.email, STAFF.samuel.name);
    const res = await s.post('/api/forms', {
      type: 'MOVEMENT',
      assetTags: [tag],
      data: {
        to: { type: 'STAFF', person: STAFF.ima, location: 'Ikot Ekpene office' },
        reason: 'Field assignment - project ACE-5',
        responsibleOfficer: 'Uwem Ekanem · IT Support · Ikot Ekpene',
        movementDate: '2026-08-14',
        approvers,
      },
      send: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    // Admin is not asked before the CTO decides.
    expect(() => lastLink('admin.officer@ecews.org', 'approve')).toThrow();
    const ctoToken = lastLink('cto@ecews.org', 'approve');
    const view = await pub().get(`/api/public/approve/${ctoToken}`);
    expect(view.body.role).toBe('CTO');
    const reject = await pub().post(`/api/public/approve/${ctoToken}`).send({ decision: 'REJECT' });
    expect(reject.status).toBe(400); // reason required
    expect((await pub().post(`/api/public/approve/${ctoToken}`).send({ decision: 'APPROVE' })).status).toBe(200);
    expect((await pub().post(`/api/public/approve/${ctoToken}`).send({ decision: 'APPROVE' })).status).toBe(410);
    const adminToken = lastLink('admin.officer@ecews.org', 'approve');
    const admin = await pub().post(`/api/public/approve/${adminToken}`).send({ decision: 'APPROVE' });
    expect(admin.body.formStatus).toBe('AWAITING');

    const ind = await db().form.findFirstOrThrow({ where: { parentFormId: res.body.id } });
    expect(ind.reference).toMatch(/^IND-\d{4}$/);
    expect((await sign(STAFF.samuel.email, STAFF.samuel.name, 2)).status).toBe(200); // handover
    expect((await db().form.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('PARTIAL');
    expect((await sign(STAFF.ima.email, STAFF.ima.name, 3)).status).toBe(200); // new indemnity
    const mvt = await db().form.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(mvt.status).toBe('SIGNED');
    const a = await db().asset.findUniqueOrThrow({ where: { tag }, include: { currentHolder: true, location: true } });
    expect(a.status).toBe('ISSUED');
    expect(a.currentHolder?.name).toBe('Ima Ubong');
    expect(a.location.name).toBe('Ikot Ekpene office');
    expect(a.currentFormId).toBe(ind.id); // old issuance closed
    expect(a.currentFormId).not.toBe(iss.id);
  });

  it('rejection ends the movement and releases the lock', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    const res = await s.post('/api/forms', {
      type: 'MOVEMENT',
      assetTags: [tag],
      data: { to: { type: 'LOCATION', location: 'Uyo HQ Store', contact: { name: 'Uwem Ekanem', email: 'uwem.ekanem@ecews.org' } }, reason: 'Stock rebalancing', responsibleOfficer: 'Uwem Ekanem', movementDate: '2026-08-14', approvers },
      send: true,
    });
    expect(res.status).toBe(201);
    const ctoToken = lastLink('cto@ecews.org', 'approve');
    await pub().post(`/api/public/approve/${ctoToken}`).send({ decision: 'APPROVE' });
    const adminToken = lastLink('admin.officer@ecews.org', 'approve');
    const r = await pub().post(`/api/public/approve/${adminToken}`).send({ decision: 'REJECT', comment: 'Not budgeted this quarter' });
    expect(r.body.formStatus).toBe('REJECTED');
    const f = await db().form.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(f.rejectedReason).toBe('Not budgeted this quarter');
    expect(await db().formAsset.count({ where: { formId: f.id, active: true } })).toBe(0);
    expect(await db().notification.count({ where: { kind: 'REJECTED' } })).toBeGreaterThan(0);
  });

  it('send for repair → in repair after approval; vendor return Good → In Store; Poor → stays Damaged', async () => {
    const s = await login();
    const [t1, t2] = await intakeAssets(s, [{ result: 'FAILED' }, { result: 'FAILED' }]);
    const vendor = { company: 'Fixit Ltd', name: 'Okon Fixit', email: 'service@fixit.ng' };
    const noReturnDate = await s.post('/api/forms', {
      type: 'MOVEMENT',
      assetTags: [t1],
      data: { to: { type: 'VENDOR', vendor }, reason: 'Screen replacement', responsibleOfficer: 'Uwem', movementDate: '2026-08-14', approvers },
      send: true,
    });
    expect(noReturnDate.status).toBe(400);
    for (const tag of [t1, t2]) {
      const res = await s.post('/api/forms', {
        type: 'MOVEMENT',
        assetTags: [tag],
        data: { to: { type: 'VENDOR', vendor }, reason: 'Screen replacement', responsibleOfficer: 'Uwem', movementDate: '2026-08-14', expectedReturn: '2026-09-01', approvers },
        send: true,
      });
      expect(res.status).toBe(201);
      await pub().post(`/api/public/approve/${lastLink('cto@ecews.org', 'approve')}`).send({ decision: 'APPROVE' });
      await pub().post(`/api/public/approve/${lastLink('admin.officer@ecews.org', 'approve')}`).send({ decision: 'APPROVE' });
      const a = await db().asset.findUniqueOrThrow({ where: { tag } });
      expect(a.repairFormId).toBe(res.body.id); // Under Repair once approved
      expect((await sign(vendor.email, vendor.name, 2)).status).toBe(200);
    }
    const inRepair = await s.get('/api/assets?status=IN_REPAIR');
    expect(inRepair.body.items.map((x: { tag: string }) => x.tag).sort()).toEqual([t1, t2].sort());
    const d = await s.get(`/api/assets/${t1}`);
    expect(d.body.actions.map((x: { action: string }) => x.action)).toEqual(['RECEIVE_BACK', 'RETIRE']);
    // Staff can't return an in-repair item; the vendor can.
    for (const [tag, condition] of [
      [t1, 'GOOD'],
      [t2, 'POOR'],
    ] as const) {
      const r = await s.post('/api/forms', {
        type: 'RETURN',
        assetTags: [tag],
        data: { returnerType: 'VENDOR', returner: vendor, items: [{ tag, condition }], returnDate: '2026-08-20' },
        send: true,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect((await sign(vendor.email, vendor.name, 2)).status).toBe(200);
    }
    const a1 = await db().asset.findUniqueOrThrow({ where: { tag: t1 } });
    const a2 = await db().asset.findUniqueOrThrow({ where: { tag: t2 } });
    expect([a1.status, a1.repairFormId, a1.currentHolderId]).toEqual(['IN_STORE', null, null]);
    expect([a2.status, a2.repairFormId]).toEqual(['DAMAGED', null]);
    const ev = await s.get(`/api/assets/${t2}`);
    expect(ev.body.timeline.at(-1).type).toBe('REPAIR_FAILED');
    expect(ev.body.actions.map((x: { action: string }) => x.action)).toEqual(['SEND_FOR_REPAIR', 'RETIRE']);
  });

  it('repair of a retired asset: reinstatement commits with the movement (admin only)', async () => {
    const admin = await login();
    const support = await login('IT_SUPPORT');
    const [tag] = await intakeAssets(admin, [{ result: 'FAILED' }]);
    await admin.post(`/api/assets/${tag}/retire`, { reason: 'OBSOLETE', notes: 'Old, retired for now' });
    const body = {
      type: 'MOVEMENT',
      assetTags: [tag],
      data: { to: { type: 'VENDOR', vendor: { company: 'Fixit Ltd', name: 'Okon Fixit', email: 'service@fixit.ng' } }, reason: 'Try a repair', responsibleOfficer: 'Uwem', movementDate: '2026-08-14', expectedReturn: '2026-09-01', approvers, reinstate: true },
      send: true,
    };
    expect((await support.post('/api/forms', body)).status).toBe(403);
    expect((await db().asset.findUniqueOrThrow({ where: { tag } })).status).toBe('RETIRED');
    const draft = await admin.post('/api/forms', { ...body, send: false });
    expect((await db().asset.findUniqueOrThrow({ where: { tag } })).status).toBe('RETIRED'); // drafts change nothing
    await admin.del(`/api/forms/${draft.body.id}`);
    const res = await admin.post('/api/forms', body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const a = await db().asset.findUniqueOrThrow({ where: { tag }, include: { custodyEvents: true } });
    expect(a.status).toBe('DAMAGED');
    expect(a.custodyEvents.map((e) => e.type)).toContain('REINSTATED_FOR_REPAIR');
  });
});

describe('sign-offs and registries', () => {
  it('lists tabs with computed counts, searches, and shows the registries', async () => {
    const s = await login();
    const summary = await s.get('/api/signoffs/summary');
    expect(summary.status).toBe(200);
    const all = await s.get('/api/signoffs?tab=ALL&pageSize=100');
    expect(all.body.total).toBe(summary.body.tabs.ALL);
    const signed = await s.get('/api/signoffs?tab=SIGNED&pageSize=100');
    expect(signed.body.items.every((r: { status: string }) => r.status === 'SIGNED')).toBe(true);
    expect(signed.body.total).toBe(summary.body.tabs.SIGNED);
    const search = await s.get('/api/signoffs?q=Ima');
    expect(search.body.items.length).toBeGreaterThan(0);
    const reg = await s.get('/api/registries/issuance');
    expect(reg.status).toBe(200);
    expect(reg.body.items[0]).toHaveProperty('holder');
    const mv = await s.get('/api/registries/movement');
    expect(mv.body.items[0]).toHaveProperty('movedTo');
    expect((await s.get('/api/registries/nope')).status).toBe(400);
    const one = signed.body.items[0];
    const doc = await s.get(`/api/forms/${one.id}/pdf`);
    expect(doc.status).toBe(200);
    expect(doc.headers['content-type']).toBe('application/pdf');
    const copy = await s.post(`/api/forms/${one.id}/email-copy`, { to: 'edidiong.okon@ecews.org', alsoSigner: true });
    expect(copy.status).toBe(200);
    expect(copy.body.sentTo.length).toBe(2);
  });
});

describe('bulk reminders with a movement and its indemnity', () => {
  it('reminds each signer once and reports what the movement waits on', async () => {
    const s = await login();
    const [tag] = await intakeAssets(s, [{}]);
    await issue(s, [tag!]);
    await sign(STAFF.samuel.email, STAFF.samuel.name);
    const approvers = { cto: { email: 'cto@ecews.org' }, admin: { email: 'admin.officer@ecews.org' } };
    const m = await s.post('/api/forms', {
      type: 'MOVEMENT',
      assetTags: [tag],
      data: { to: { type: 'STAFF', person: STAFF.ima, location: 'Uyo HQ' }, reason: 'Reassignment to Programs', responsibleOfficer: 'Edidiong Okon', movementDate: '2026-08-14', approvers },
      send: true,
    });
    await pub().post(`/api/public/approve/${lastLink('cto@ecews.org', 'approve')}`).send({ decision: 'APPROVE' });
    await pub().post(`/api/public/approve/${lastLink('admin.officer@ecews.org', 'approve')}`).send({ decision: 'APPROVE' });
    await sign(STAFF.samuel.email, STAFF.samuel.name, 2);
    const ind = await db().form.findFirstOrThrow({ where: { parentFormId: m.body.id } });
    const list = await s.get('/api/signoffs?tab=AWAITING&pageSize=100');
    const row = list.body.items.find((r: { id: string }) => r.id === m.body.id);
    expect(row.status).toBe('PARTIAL');
    expect(row.waitingOn).toEqual(['Ima Ubong']);
    const before = getOutbox().filter((x) => x.to === STAFF.ima.email).length;
    const r = await s.post('/api/forms/remind', { formIds: [m.body.id, ind.id] });
    expect(r.status).toBe(200);
    expect(getOutbox().filter((x) => x.to === STAFF.ima.email).length).toBe(before + 1);
  });
});
