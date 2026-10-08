import { db } from '../../src/server/db';
import type { Session } from './helpers';

export async function refs() {
  const [categories, projects, locations] = await Promise.all([
    db().category.findMany(),
    db().project.findMany(),
    db().location.findMany(),
  ]);
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const proj = (name: string) => projects.find((p) => p.name === name)!.id;
  return { cat, proj, locations };
}

let serialCounter = 1000;
export const nextSerial = () => `SN-${serialCounter++}`;

export async function intakeBody(items: Array<{ result?: 'PASSED' | 'FAILED'; category?: string; makeModel?: string; serial?: string | null; unitCost?: number }>) {
  const { cat, proj } = await refs();
  return {
    supplier: 'Dell EMC Nigeria',
    poReference: 'PO-1098',
    projectId: proj('ACE-5 Uyo'),
    deliveryLocation: 'Eket Office - IT Store',
    deliveryDate: '2026-08-14',
    validatedByName: 'Edidiong Okon',
    validatedByTitle: 'IT Admin',
    validatedDate: '2026-08-14',
    lineItems: items.map((i) => ({
      categoryId: cat(i.category ?? 'Laptop'),
      makeModel: i.makeModel ?? 'Dell Latitude 7420',
      serial: i.serial === undefined ? nextSerial() : i.serial,
      notes: null,
      result: i.result ?? 'PASSED',
      unitCost: i.unitCost ?? null,
    })),
    checks: Array.from({ length: 7 }, (_, q) => ({ answer: q === 3 ? 'NA' : 'YES', remark: null as string | null })),
  };
}

/** Creates and validates an intake; returns the created tags in order. */
export async function intakeAssets(s: Session, items: Parameters<typeof intakeBody>[0]): Promise<string[]> {
  const created = await s.post('/api/intakes', await intakeBody(items));
  if (created.status !== 201) throw new Error(`intake create failed ${created.status} ${JSON.stringify(created.body)}`);
  const v = await s.post(`/api/intakes/${created.body.id}/validate`);
  if (v.status !== 200) throw new Error(`validate failed ${v.status} ${JSON.stringify(v.body)}`);
  return v.body.created.map((c: { tag: string }) => c.tag);
}

import { getOutbox } from '../../src/server/email/mailer';

/** Latest link of a kind sent to an address (from the in-memory mail outbox). */
export function lastLink(to: string, kind: 'sign' | 'approve' = 'sign'): string {
  const mails = getOutbox().filter((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(to.toLowerCase()));
  for (let i = mails.length - 1; i >= 0; i--) {
    const m = new RegExp(`/${kind}/([A-Za-z0-9_-]{43})`).exec(mails[i]!.text);
    if (m) return m[1]!;
  }
  throw new Error(`no ${kind} link for ${to}`);
}

export const STAFF = {
  samuel: { name: 'Samuel Etuk', department: 'Human Resources', staffId: 'HR-0231', email: 'samuel.etuk@ecews.org', phone: '+234 803 000 0000' },
  ima: { name: 'Ima Ubong', department: 'Programs', staffId: 'PR-0112', email: 'ima.ubong@ecews.org' },
};

export const signBodyFor = (name: string, terms: number) => ({
  typedName: name,
  departmentRole: 'Human Resources · HR Officer',
  termsAccepted: Array.from({ length: terms }, () => true),
  confirmed: true,
});
