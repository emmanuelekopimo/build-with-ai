// npm run seed — builds a realistic, internally consistent dataset by replaying real workflows
// (intake → issuance → movement → return …) through the same services the app uses, with the
// clock pinned to each event's date. Every count on screen is therefore derived from real records.
//
// ECEWS-IT-0001 reproduces the AB-06 timeline exactly (12 Jun → 06 Aug 2026).
// Other activity is placed relative to the day the seed runs, so "this week", "overdue today",
// "expired" and the 90-day overdue rule all have live examples.

process.env.MAIL_TRANSPORT = 'memory';
process.env.JOBS_ENABLED = 'false';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.ITAMS_SKIP_PDF_ON_SIGN = '1';

import argon2 from 'argon2';
import { config } from 'dotenv';
import type { Role } from '@prisma/client';
import { upsertReferenceData } from './reference';

config({ quiet: true } as Parameters<typeof config>[0]);

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Itams-Demo-2026';

async function main() {
  const { db, disconnectDb } = await import('../src/server/db');
  const { setClock } = await import('../src/server/lib/clock');
  const { getOutbox } = await import('../src/server/email/mailer');
  const { createIntake, validateIntake } = await import('../src/server/services/intake');
  const { createForm } = await import('../src/server/services/forms/lifecycle');
  const { submitSignature, submitApproval } = await import('../src/server/services/forms/public');
  const { expireLinksJob, expiringSoonJob, overdueJob } = await import('../src/server/services/forms/manage');
  const { reportDamage, retireAsset } = await import('../src/server/services/assets');
  const { INTAKE_CHECK_QUESTIONS, SIGNING_TERMS } = await import('../src/shared/constants');
  const { isoDateWAT } = await import('../src/shared/format');
  type SessionUser = import('../src/server/services/sessions').SessionUser;

  const prisma = db();
  if ((await prisma.asset.count()) > 0) {
    console.error('The database already contains assets. The seed only runs on an empty database (run migrations on a fresh database first).');
    process.exit(1);
  }

  await upsertReferenceData(prisma);
  const passwordHash = await argon2.hash(SEED_PASSWORD);
  const userDefs: Array<{ email: string; name: string; role: Role; title: string; office: string }> = [
    { email: 'edidiong.okon@ecews.org', name: 'Edidiong Okon', role: 'IT_ADMIN', title: 'IT Admin', office: 'Uyo' },
    { email: 'uwem.ekanem@ecews.org', name: 'Uwem Ekanem', role: 'IT_SUPPORT', title: 'IT Support', office: 'Ikot Ekpene' },
    { email: 'aniekan.udo@ecews.org', name: 'Aniekan Udo', role: 'VIEWER', title: 'Programs Officer', office: 'Uyo' },
  ];
  const users: Record<string, SessionUser> = {};
  for (const u of userDefs) {
    const row = await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } });
    users[u.role] = { id: row.id, name: row.name, email: row.email, role: row.role, title: row.title, office: row.office };
  }
  const admin = users.IT_ADMIN!;
  const support = users.IT_SUPPORT!;

  // ------------------------------------------------------------------ helpers
  const at = (iso: string) => setClock(new Date(iso));
  const today = isoDateWAT();
  /** A WAT timestamp `days` before the seed day, at hh:mm. */
  const ago = (days: number, hm = '10:00') => {
    const d = new Date(`${today}T${hm}:00+01:00`);
    const t = d.getTime() - days * 86400000;
    // Never place an event in the future, whatever time of day the seed runs.
    return new Date(Math.min(t, Date.now() - 5 * 60000 - (7 - Math.min(days, 7)) * 1000)).toISOString();
  };
  const dateAgo = (days: number) => isoDateWAT(new Date(Date.now() - days * 86400000));
  const dateAhead = (days: number) => isoDateWAT(new Date(Date.now() + days * 86400000));
  const seq = async (name: string, last: number) => prisma.$executeRawUnsafe(`SELECT setval('${name}', ${last})`);
  const meta = { ip: '41.203.87.12', ua: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari (seed)' };

  const cats = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  const projects = new Map((await prisma.project.findMany()).map((p) => [p.name, p.id]));
  const allYes = (na: number[] = [4]) => INTAKE_CHECK_QUESTIONS.map((_, i) => ({ answer: (na.includes(i + 1) ? 'NA' : 'YES') as 'YES' | 'NA', remark: null }));

  type Item = { cat: string; make: string; serial: string | null; failed?: boolean; cost?: number; notes?: string };
  async function intake(
    when: string,
    user: SessionUser,
    o: { supplier: string; po: string; project: string; location: string; delivered: string; items: Item[]; checks?: ReturnType<typeof allYes> },
  ): Promise<string[]> {
    at(when);
    const created = await createIntake(
      {
        supplier: o.supplier,
        poReference: o.po,
        projectId: projects.get(o.project)!,
        deliveryLocation: o.location,
        deliveryDate: o.delivered,
        validatedByName: user.name,
        validatedByTitle: user.title,
        validatedDate: when.slice(0, 10),
        lineItems: o.items.map((i) => ({
          categoryId: cats.get(i.cat)!,
          makeModel: i.make,
          serial: i.serial,
          notes: i.notes ?? null,
          result: i.failed ? 'FAILED' : 'PASSED',
          unitCost: i.cost ?? null,
        })),
        checks: o.checks ?? allYes(),
      },
      user,
    );
    const r = await validateIntake(created.id, user, meta.ip);
    return r.created.map((c) => c.tag);
  }

  function lastLink(email: string, kind: 'sign' | 'approve'): string {
    const mails = getOutbox().filter((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(email.toLowerCase()));
    for (let i = mails.length - 1; i >= 0; i--) {
      const m = new RegExp(`/${kind}/([A-Za-z0-9_-]{43})`).exec(mails[i]!.text);
      if (m) return m[1]!;
    }
    throw new Error(`no ${kind} link for ${email}`);
  }
  async function sign(when: string, email: string, name: string, dept: string) {
    at(when);
    const token = lastLink(email, 'sign');
    const party = await prisma.party.findFirstOrThrow({ where: { email: email.toLowerCase(), status: 'PENDING', needsSignature: true }, orderBy: { tokenIssuedAt: 'desc' }, include: { form: true } });
    await submitSignature(token, { typedName: name, departmentRole: dept, termsAccepted: SIGNING_TERMS[party.form.type].map(() => true as const), confirmed: true }, meta);
  }
  async function approve(when: string, email: string, decision: 'APPROVE' | 'REJECT' = 'APPROVE', comment?: string) {
    at(when);
    await submitApproval(lastLink(email, 'approve'), { decision, comment }, meta);
  }

  const CTO = { name: 'Dr. Itoro Bassey', email: 'cto@ecews.org' };
  const ADMIN_OFFICER = { name: 'Mfon Akpan', email: 'admin.officer@ecews.org' };
  const approvers = { cto: CTO, admin: ADMIN_OFFICER };

  const staff = {
    samuel: { name: 'Samuel Etuk', department: 'Human Resources', staffId: 'HR-0231', email: 'samuel.etuk@ecews.org', phone: '+234 803 000 0000', position: 'HR Officer' },
    ima: { name: 'Ima Ubong', department: 'Programs', staffId: 'PR-0112', email: 'ima.ubong@ecews.org', position: 'Programs Officer' },
    grace: { name: 'Grace Offiong', department: 'Finance', staffId: 'FN-0078', email: 'grace.offiong@ecews.org', position: 'Accountant' },
    favour: { name: 'Favour Udom', department: 'HR', staffId: 'HR-0244', email: 'favour.udom@ecews.org', position: 'HR Assistant' },
    blessing: { name: 'Blessing Etuk', department: 'Field Ops', staffId: 'FO-0310', email: 'blessing.etuk@ecews.org', position: 'Field Coordinator' },
    aniekan: { name: 'Aniekan Bassey', department: 'Programs', staffId: 'PR-0130', email: 'aniekan.bassey@ecews.org', position: 'M&E Officer' },
    uduak: { name: 'Uduak Akpan', department: 'M&E', staffId: 'ME-0051', email: 'uduak.akpan@ecews.org', position: 'Data Officer' },
    emem: { name: 'Emem Ekpo', department: 'Finance', staffId: 'FN-0092', email: 'emem.ekpo@ecews.org', position: 'Finance Officer' },
    ubong: { name: 'Ubong Asuquo', department: 'Field Ops', staffId: 'FO-0322', email: 'ubong.asuquo@ecews.org', position: 'Field Officer' },
    nsikak: { name: 'Nsikak Udoh', department: 'ACE-5 Project', staffId: 'AC-0015', email: 'nsikak.udoh@ecews.org', position: 'Project Officer' },
  };
  type Staff = (typeof staff)[keyof typeof staff];
  const deptOf = (s: Staff) => `${s.department} · ${s.position}`;
  const vendor = { company: 'Fixit Computers Ltd', name: 'Okon Effiong', email: 'service@fixitcomputers.ng', phone: '+234 802 111 2233' };

  async function issue(when: string, user: SessionUser, tags: string[], s: Staff, extra: { temporary?: boolean; expectedReturn?: string } = {}) {
    at(when);
    return createForm({ type: 'ISSUANCE', assetTags: tags, data: { recipient: s, temporary: extra.temporary ?? false, expectedReturn: extra.expectedReturn }, send: true }, user);
  }
  async function issueSigned(sent: string, signed: string, user: SessionUser, tags: string[], s: Staff, extra?: { temporary?: boolean; expectedReturn?: string }) {
    const f = await issue(sent, user, tags, s, extra);
    await sign(signed, s.email, s.name, deptOf(s));
    return f;
  }
  async function returnFrom(when: string, user: SessionUser, s: Staff, items: Array<[string, 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED']>, notes?: string) {
    at(when);
    return createForm(
      {
        type: 'RETURN',
        assetTags: items.map((i) => i[0]),
        data: { returnerType: 'STAFF', returner: s, items: items.map(([tag, condition]) => ({ tag, condition })), conditionNotes: notes, returnDate: when.slice(0, 10) },
        send: true,
      },
      user,
    );
  }
  async function movement(when: string, user: SessionUser, tags: string[], data: Record<string, unknown>) {
    at(when);
    return createForm({ type: 'MOVEMENT', assetTags: tags, data: { approvers, movementDate: when.slice(0, 10), ...data }, send: true }, user);
  }

  // ------------------------------------------------------------------ numbering to resemble the paper series
  await seq('ref_iss_seq', 129);
  await seq('ref_rtr_seq', 39);
  await seq('ref_mvt_seq', 24);
  await seq('ref_ind_seq', 7);

  // ------------------------------------------------------------------ intakes
  const in1 = await intake('2026-06-12T10:04:00+01:00', admin, {
    supplier: 'Lenovo Nigeria',
    po: 'PO-1042',
    project: 'HQ Uyo',
    location: 'Uyo HQ Store',
    delivered: '2026-06-10',
    items: [
      { cat: 'Laptop', make: 'Lenovo ThinkPad T14 Gen 3', serial: 'PF-3K2Q1R', cost: 1250000 },
      { cat: 'Wireless Mouse', make: 'Logitech M185', serial: 'LM-8892', cost: 12500 },
    ],
  });
  const [t14, mouse1] = in1 as [string, string];

  const in2 = await intake('2026-06-20T11:30:00+01:00', admin, {
    supplier: 'Dell EMC Nigeria',
    po: 'PO-1050',
    project: 'ACE-5 Uyo',
    location: 'ACE-5 Uyo site',
    delivered: '2026-06-19',
    items: [
      { cat: 'Laptop', make: 'Dell Latitude 7420', serial: 'DL-8XW4T9', cost: 980000 },
      { cat: 'Laptop', make: 'Dell Latitude 7420', serial: 'DL-5V7C2X', cost: 980000 },
      { cat: 'Laptop', make: 'Dell Latitude 7420', serial: 'DL-9K2M4P', cost: 980000 },
      { cat: 'Laptop', make: 'HP EliteBook 840 G9', serial: '5CG-238N1R', cost: 1100000 },
      { cat: 'Laptop', make: 'HP EliteBook 840 G9', serial: '5CG-238N7T', cost: 1100000 },
      { cat: 'Laptop', make: 'HP EliteBook 840 G9', serial: '5CG-240A2Q', cost: 1100000 },
    ],
  });
  const [dl1, dl2, dl3, hp1, hp2, hp3] = in2 as [string, string, string, string, string, string];

  const in3 = await intake('2026-07-02T09:15:00+01:00', support, {
    supplier: 'Slot Systems',
    po: 'PO-1061',
    project: 'Field Ops',
    location: 'Field Ops',
    delivered: '2026-07-01',
    items: [
      { cat: 'Mobile Phone', make: 'iPhone 13 · 128GB', serial: 'DX3-9T7C2', cost: 650000 },
      { cat: 'Mobile Phone', make: 'Samsung Galaxy A53', serial: 'RZ8-NC21T', cost: 320000 },
      { cat: 'Mobile Phone', make: 'Samsung Galaxy A53', serial: 'RZ8-NC22K', cost: 320000 },
      { cat: 'Mobile Phone', make: 'Samsung Galaxy A53', serial: 'RZ8-NC23M', cost: 320000 },
      { cat: 'Tablet', make: 'iPad (10th gen)', serial: 'DMPX-71QL', cost: 540000 },
      { cat: 'Tablet', make: 'iPad (10th gen)', serial: 'DMPX-71QM', cost: 540000 },
    ],
  });
  const [iphone, a53a, a53b, a53c, ipad1, ipad2] = in3 as [string, string, string, string, string, string];

  const in4 = await intake('2026-07-10T14:20:00+01:00', admin, {
    supplier: 'Jumia Business',
    po: 'PO-1066',
    project: 'HQ Uyo',
    location: 'Uyo HQ Store',
    delivered: '2026-07-09',
    items: [
      { cat: 'Projector', make: 'Epson EB-X06', serial: 'V2VQ-88213', cost: 410000 },
      { cat: 'External Monitor', make: 'Dell P2422H', serial: 'CN-05WR2F', failed: true, notes: 'Dead pixel cluster on arrival', cost: 185000 },
      { cat: 'External Monitor', make: 'Dell P2422H', serial: 'CN-07T8K2', cost: 185000 },
      { cat: 'External Monitor', make: 'Dell P2422H', serial: 'CN-07T8K3', cost: 185000 },
      { cat: 'Wireless Mouse', make: 'Logitech M185', serial: 'LM-9013', cost: 12500 },
      { cat: 'Wireless Mouse', make: 'Logitech M185', serial: 'LM-9014', cost: 12500 },
      { cat: 'Wireless Keyboard', make: 'Logitech K380', serial: 'PN-9912AB', cost: 28000 },
      { cat: 'Wireless Keyboard', make: 'Logitech K380', serial: 'PN-9912AC', cost: 28000 },
    ],
  });
  const [projector, monFailed, mon2, , mouse2, mouse3, kb1] = in4 as [string, string, string, string, string, string, string, string];

  const in5 = await intake('2026-08-04T10:40:00+01:00', admin, {
    supplier: 'Dell EMC Nigeria',
    po: 'PO-1080',
    project: 'Eket Office',
    location: 'Eket Office - IT Store',
    delivered: '2026-08-03',
    checks: allYes([4]).map((c, i) => (i === 0 ? { answer: 'NO' as const, remark: 'One Latitude 5420 short — supplier to deliver' } : c)) as ReturnType<typeof allYes>,
    items: [
      { cat: 'Desktop', make: 'Dell OptiPlex 7080', serial: 'DL-OPX-7Q21', cost: 760000 },
      { cat: 'Desktop', make: 'Dell OptiPlex 7080', serial: 'DL-OPX-7Q22', cost: 760000 },
      { cat: 'Laptop', make: 'Dell Latitude 5420', serial: 'DL-54-2R8H', cost: 850000 },
      { cat: 'Laptop', make: 'Dell Latitude 5420', serial: 'DL-54-2R8J', failed: true, notes: 'Keyboard unresponsive', cost: 850000 },
    ],
  });
  const [opx1, , lat54, lat54Failed] = in5 as [string, string, string, string];

  const in5b = await intake('2026-09-15T11:00:00+01:00', admin, {
    supplier: 'HP Nigeria',
    po: 'PO-1085',
    project: 'Field Ops',
    location: 'Field Ops',
    delivered: '2026-09-14',
    items: [
      { cat: 'Laptop', make: 'HP ProBook 450 G10', serial: '5CD-PB450-1', cost: 720000 },
      { cat: 'Laptop', make: 'HP ProBook 450 G10', serial: '5CD-PB450-2', cost: 720000 },
      { cat: 'Laptop', make: 'HP ProBook 450 G10', serial: '5CD-PB450-3', cost: 720000 },
      { cat: 'Laptop', make: 'HP ProBook 450 G10', serial: '5CD-PB450-4', cost: 720000 },
      { cat: 'Tablet', make: 'Samsung Galaxy Tab A8', serial: 'R9-TABA8-01', cost: 260000 },
      { cat: 'Tablet', make: 'Samsung Galaxy Tab A8', serial: 'R9-TABA8-02', cost: 260000 },
      { cat: 'External Monitor', make: 'Dell P2422H', serial: 'CN-07T9A1', cost: 185000 },
      { cat: 'External Monitor', make: 'Dell P2422H', serial: 'CN-07T9A2', cost: 185000 },
      { cat: 'Wireless Keyboard', make: 'Logitech MX Keys', serial: 'MXK-2201', cost: 95000 },
      { cat: 'Wireless Keyboard', make: 'Logitech MX Keys', serial: 'MXK-2202', cost: 95000 },
      { cat: 'Projector', make: 'BenQ MS560', serial: 'BQ-MS560-77', cost: 380000 },
    ],
  });
  const [pb1, pb2, pb3, , tab1, , mon5] = in5b as [string, string, string, string, string, string, string, string, string, string, string];

  const in6 = await intake(ago(20, '09:30'), support, {
    supplier: 'Lenovo Nigeria',
    po: 'PO-1090',
    project: 'Ikot Ekpene',
    location: 'Ikot Ekpene office',
    delivered: dateAgo(21),
    items: [
      { cat: 'Laptop', make: 'Lenovo ThinkPad E14 Gen 4', serial: 'PF-4E14-01', cost: 890000 },
      { cat: 'Laptop', make: 'Lenovo ThinkPad E14 Gen 4', serial: 'PF-4E14-02', cost: 890000 },
      { cat: 'Laptop', make: 'Lenovo ThinkPad E14 Gen 4', serial: 'PF-4E14-03', cost: 890000 },
      { cat: 'Laptop', make: 'MacBook Air M2', serial: 'C02-MBA-M2A', cost: 1450000 },
      { cat: 'Laptop', make: 'MacBook Air M2', serial: 'C02-MBA-M2B', failed: true, notes: 'Wrong spec delivered (8GB, PO says 16GB)', cost: 1450000 },
    ],
  });
  const [e14a, e14b, e14c, mba1, mbaFailed] = in6 as [string, string, string, string, string];

  const in7 = await intake(ago(3, '15:10'), admin, {
    supplier: 'Jumia Business',
    po: 'PO-1094',
    project: 'ACE-5 Uyo',
    location: 'Uyo HQ Store',
    delivered: dateAgo(4),
    items: [
      { cat: 'Accessories', make: 'Dell WD19S Docking Station', serial: 'WD19-CN0X1', cost: 210000 },
      { cat: 'Accessories', make: 'Dell WD19S Docking Station', serial: 'WD19-CN0X2', cost: 210000 },
      { cat: 'Accessories', make: 'UGREEN HDMI cable 2m', serial: null, cost: 6500 },
      { cat: 'Wireless Mouse', make: 'Logitech M185', serial: 'LM-9120', cost: 12500 },
      { cat: 'Wireless Keyboard', make: 'Logitech K380', serial: 'PN-9920AA', cost: 28000 },
    ],
  });
  void in7;

  // ------------------------------------------------------------------ ECEWS-IT-0001: the AB-06 timeline
  await seq('ref_iss_seq', 141);
  await issueSigned('2026-06-28T09:00:00+01:00', '2026-06-28T09:12:00+01:00', admin, [t14, mouse1], staff.samuel); // ISS-0142

  // Ima Ubong and others receive laptops in late June / July.
  await seq('ref_iss_seq', 143);
  await issueSigned('2026-06-29T10:00:00+01:00', '2026-06-29T12:40:00+01:00', admin, [dl1], staff.ima);
  await issueSigned('2026-07-01T09:20:00+01:00', '2026-07-01T11:05:00+01:00', support, [hp1], staff.grace);
  await issueSigned('2026-07-03T08:50:00+01:00', '2026-07-03T09:30:00+01:00', admin, [dl2], staff.aniekan);
  // Temporary issuance signed > 90 days ago → overdue-return alert.
  await issueSigned('2026-07-05T08:30:00+01:00', '2026-07-05T10:15:00+01:00', support, [a53a], staff.ubong, { temporary: true, expectedReturn: '2026-08-05' });
  await issueSigned('2026-07-06T09:00:00+01:00', '2026-07-06T09:45:00+01:00', admin, [a53b], staff.uduak);

  // 14 Jul 15:40 — moved Uyo HQ → Ikot Ekpene, responsible U. Ekanem (location transfer, holder unchanged).
  const mvt1 = await movement('2026-07-14T09:10:00+01:00', admin, [t14], {
    to: { type: 'LOCATION', location: 'Ikot Ekpene office', contact: { name: 'Uwem Ekanem', email: 'uwem.ekanem@ecews.org', role: 'IT Support · Ikot Ekpene' } },
    reason: 'Field assignment',
    responsibleOfficer: 'U. Ekanem',
  });
  void mvt1;
  await approve('2026-07-14T11:00:00+01:00', CTO.email);
  await approve('2026-07-14T13:20:00+01:00', ADMIN_OFFICER.email);
  await sign('2026-07-14T14:55:00+01:00', staff.samuel.email, staff.samuel.name, deptOf(staff.samuel));
  await sign('2026-07-14T15:40:00+01:00', 'uwem.ekanem@ecews.org', 'Uwem Ekanem', 'IT Support · Ikot Ekpene');

  await issueSigned('2026-07-15T10:00:00+01:00', '2026-07-15T13:00:00+01:00', admin, [projector], staff.nsikak);
  await issueSigned('2026-07-20T09:00:00+01:00', '2026-07-20T10:30:00+01:00', admin, [hp2, mouse2], staff.emem);

  // 02 Aug 08:55 — returned in Good condition, received by E. Okon.
  await returnFrom('2026-08-02T08:30:00+01:00', admin, staff.samuel, [
    [t14, 'GOOD'],
    [mouse1, 'GOOD'],
  ], 'screen, battery & ports verified');
  await sign('2026-08-02T08:55:00+01:00', staff.samuel.email, staff.samuel.name, deptOf(staff.samuel));

  // 06 Aug 11:02 — re-issued to Samuel Etuk under ISS-0161.
  await seq('ref_iss_seq', 160);
  await issueSigned('2026-08-06T10:40:00+01:00', '2026-08-06T11:02:00+01:00', admin, [t14], staff.samuel);

  // Projector: damaged at the field, repaired by the vendor, back In Store.
  at('2026-08-10T16:00:00+01:00');
  await returnFrom('2026-08-10T16:00:00+01:00', admin, staff.nsikak, [[projector, 'POOR']], 'Lamp flickers, colour wheel noise');
  await sign('2026-08-10T17:10:00+01:00', staff.nsikak.email, staff.nsikak.name, deptOf(staff.nsikak));
  await movement('2026-08-12T09:00:00+01:00', admin, [projector], { to: { type: 'VENDOR', vendor }, reason: 'Lamp and colour wheel replacement', responsibleOfficer: 'Edidiong Okon', expectedReturn: '2026-08-26', temporary: true });
  await approve('2026-08-12T10:00:00+01:00', CTO.email);
  await approve('2026-08-12T11:30:00+01:00', ADMIN_OFFICER.email);
  await sign('2026-08-12T14:00:00+01:00', vendor.email, vendor.name, 'Fixit Computers Ltd · Service desk');
  at('2026-08-25T10:00:00+01:00');
  await createForm(
    { type: 'RETURN', assetTags: [projector], data: { returnerType: 'VENDOR', returner: vendor, items: [{ tag: projector, condition: 'GOOD' }], conditionNotes: 'New lamp fitted, tested 2h', returnDate: '2026-08-25' }, send: true },
    admin,
  );
  await sign('2026-08-25T11:20:00+01:00', vendor.email, vendor.name, 'Fixit Computers Ltd · Service desk');

  // Emem returns the EliteBook damaged (origin RETURNED) and the mouse in good order.
  await returnFrom('2026-08-28T09:00:00+01:00', support, staff.emem, [
    [hp2, 'DAMAGED'],
    [mouse2, 'GOOD'],
  ], 'Hinge cracked, display flickers');
  await sign('2026-08-28T10:05:00+01:00', staff.emem.email, staff.emem.name, deptOf(staff.emem));

  // Damage reported on an issued laptop; holder stays recorded.
  at('2026-09-03T12:00:00+01:00');
  await reportDamage(dl2, { condition: 'POOR', notes: 'Liquid spill on keyboard, several keys dead' }, admin, meta.ip);

  // Samsung phone: reported damaged then retired (eligible for Repair or Delete).
  at('2026-09-05T10:00:00+01:00');
  await reportDamage(a53c, { condition: 'DAMAGED', notes: 'Cracked screen and swollen battery after a fall' }, support, meta.ip);
  at('2026-09-08T14:00:00+01:00');
  await retireAsset(a53c, { reason: 'BEYOND_ECONOMIC_REPAIR', notes: 'Repair quote exceeds replacement cost' }, admin, meta.ip);
  // Wrong-spec MacBook rejected at intake → retired.
  at(ago(18, '11:00'));
  await retireAsset(mbaFailed, { reason: 'REJECTED_AT_INTAKE', notes: 'Rejected, returned to supplier for the correct spec' }, admin, meta.ip);

  // Failed-intake Latitude goes to the vendor; expected back 5 days ago → overdue repair (in repair).
  await movement(ago(16, '09:00'), admin, [lat54Failed], { to: { type: 'VENDOR', vendor }, reason: 'Keyboard unresponsive — warranty repair', responsibleOfficer: 'Edidiong Okon', expectedReturn: dateAgo(5), temporary: true });
  await approve(ago(16, '11:00'), CTO.email);
  await approve(ago(15, '09:30'), ADMIN_OFFICER.email);
  await sign(ago(15, '14:00'), vendor.email, vendor.name, 'Fixit Computers Ltd · Service desk');

  // EliteBook damaged on return: approved for repair, vendor confirmation pending (Under Repair, Awaiting).
  await movement(ago(6, '10:00'), admin, [hp2], { to: { type: 'VENDOR', vendor }, reason: 'Hinge cracked, display flickers', responsibleOfficer: 'Edidiong Okon', expectedReturn: dateAhead(10), temporary: true });
  await approve(ago(6, '12:00'), CTO.email);
  await approve(ago(5, '09:00'), ADMIN_OFFICER.email);

  // More issuances across the period, including recent ones (signed this week).
  await issueSigned(ago(40, '09:00'), ago(40, '11:00'), support, [e14a], staff.blessing);
  await issueSigned(ago(35, '10:00'), ago(34, '09:10'), admin, [mon2, kb1], staff.uduak);
  await issueSigned(ago(12, '09:30'), ago(12, '15:00'), admin, [e14b], staff.favour);
  await issueSigned(ago(2, '09:05'), ago(2, '10:20'), admin, [mba1], staff.ima);
  await issueSigned(ago(1, '11:00'), ago(1, '11:45'), support, [mouse3], staff.grace);

  await issueSigned('2026-09-16T09:00:00+01:00', '2026-09-16T10:10:00+01:00', admin, [pb1, tab1], staff.ubong);
  await issueSigned('2026-09-17T09:00:00+01:00', '2026-09-17T13:40:00+01:00', support, [pb2], staff.blessing);
  await issueSigned('2026-09-22T10:00:00+01:00', '2026-09-23T08:20:00+01:00', admin, [pb3, mon5], staff.nsikak);

  // Staff → staff movement: Ima hands the Latitude to Favour. Handover signed, new indemnity pending → Partial.
  await movement(ago(4, '09:00'), admin, [dl1], {
    to: { type: 'STAFF', person: staff.favour, location: 'Uyo HQ' },
    reason: 'Reassigned to HR onboarding',
    responsibleOfficer: 'Edidiong Okon · IT Admin · Uyo',
  });
  await approve(ago(4, '10:30'), CTO.email);
  await approve(ago(4, '12:00'), ADMIN_OFFICER.email);
  await sign(ago(3, '09:15'), staff.ima.email, staff.ima.name, deptOf(staff.ima));

  // Awaiting signature: Grace's return, a fresh issuance due today, and an issuance sent this morning.
  await returnFrom(ago(2, '16:48'), admin, staff.grace, [[hp1, 'FAIR']], 'Battery wear 18%, otherwise fine');
  // Sent 7 days ago minus 45 minutes, so the link lapses later today → "overdue today".
  await issue(new Date(Date.now() - 7 * 86400000 + 45 * 60000).toISOString(), admin, [e14c], staff.uduak);
  await issue(ago(0, '09:20'), admin, [iphone], staff.aniekan);

  // Expired: issuance sent 9 days ago, link lapsed.
  await issue(ago(9, '09:00'), support, [ipad1], staff.blessing);

  // Awaiting approval: OptiPlex moving from Eket to HQ.
  await movement(ago(1, '14:00'), admin, [opx1], {
    to: { type: 'LOCATION', location: 'Uyo HQ', contact: { name: 'Edidiong Okon', email: 'edidiong.okon@ecews.org', role: 'IT Admin · Uyo' } },
    reason: 'Reception desktop replacement at HQ',
    responsibleOfficer: 'Edidiong Okon · IT Admin · Uyo',
  });

  // Rejected movement.
  await movement(ago(11, '10:00'), support, [ipad2], {
    to: { type: 'LOCATION', location: 'Eket Office - IT Store', contact: { name: 'Uwem Ekanem', email: 'uwem.ekanem@ecews.org' } },
    reason: 'Stock rebalancing between offices',
    responsibleOfficer: 'Uwem Ekanem · IT Support',
  });
  await approve(ago(11, '13:00'), CTO.email, 'REJECT', 'Not needed — Eket has enough tablets this quarter');

  // Drafts: an issuance being prepared and the IN-009-style intake from the design.
  at(ago(0, '08:40'));
  await createForm({ type: 'ISSUANCE', assetTags: [lat54], data: { recipient: { ...staff.nsikak, staffId: '', email: '' } }, send: false }, support);
  at(ago(0, '08:55'));
  await createIntake(
    {
      supplier: 'Dell EMC Nigeria',
      poReference: 'PO-1098',
      projectId: projects.get('ACE-5 Uyo')!,
      deliveryLocation: 'Eket Office - IT Store',
      deliveryDate: today,
      validatedByName: admin.name,
      validatedByTitle: admin.title,
      validatedDate: today,
      lineItems: [
        { categoryId: cats.get('Laptop')!, makeModel: 'Dell Latitude 7420', serial: '8XW4T9', notes: null, result: 'PASSED', unitCost: 980000 },
        { categoryId: cats.get('Laptop')!, makeModel: 'Dell Latitude 7420', serial: '8XW4U0', notes: null, result: 'PASSED', unitCost: 980000 },
        { categoryId: cats.get('External Monitor')!, makeModel: 'Dell P2422H', serial: 'CN-0119X', notes: 'Dead pixel cluster', result: 'FAILED', unitCost: 185000 },
      ],
      checks: INTAKE_CHECK_QUESTIONS.map((_, i) => ({ answer: i === 3 ? ('NA' as const) : i < 3 ? ('YES' as const) : null, remark: i === 3 ? 'Monitor 0119: dead pixel cluster - flag for resolution' : null })),
    },
    admin,
  );

  // ------------------------------------------------------------------ jobs at real time
  setClock(null);
  await expireLinksJob();
  await expiringSoonJob();
  await overdueJob();

  const [assets, forms, events] = await Promise.all([prisma.asset.count(), prisma.form.count(), prisma.custodyEvent.count()]);
  const byStatus = await prisma.asset.groupBy({ by: ['status'], _count: true });
  console.log(`Seeded ${assets} assets (${byStatus.map((s) => `${s.status} ${s._count}`).join(', ')}), ${forms} forms, ${events} custody events.`);
  console.log(`Users: ${userDefs.map((u) => `${u.email} (${u.role})`).join(', ')} — password: ${SEED_PASSWORD}`);
  void monFailed;
  void hp3;
  void dl3;
  await disconnectDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
