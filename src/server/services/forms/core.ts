// Shared helpers for the signable-form engine (Issuance, Return, Movement, Indemnity).
import type { Asset, Form, FormAsset, Party, PersonType, Prisma } from '@prisma/client';
import { SIGN_LINK_DAYS } from '../../../shared/constants';
import type { StaffPerson, VendorPerson } from '../../../shared/formSchemas';
import type { Tx } from '../../db';
import { env } from '../../env';
import { trySendMail, type OutgoingMail } from '../../email/mailer';
import type { AssetLine } from '../../email/templates';
import { addDays, newToken } from '../../lib/tokens';
import { now as clockNow } from '../../lib/clock';

export interface AssetSnapshot {
  tag: string;
  description: string;
  makeModel: string;
  serial: string | null;
  category: string;
  icon: string;
  statusAtSend: string;
  holder: string | null;
  location: string;
  project: string;
}

export async function snapshotAsset(tx: Tx, a: Asset): Promise<AssetSnapshot> {
  const [cat, loc, proj, holder] = await Promise.all([
    tx.category.findUniqueOrThrow({ where: { id: a.categoryId } }),
    tx.location.findUniqueOrThrow({ where: { id: a.locationId } }),
    tx.project.findUniqueOrThrow({ where: { id: a.projectId } }),
    a.currentHolderId ? tx.person.findUnique({ where: { id: a.currentHolderId } }) : null,
  ]);
  return {
    tag: a.tag,
    description: a.description,
    makeModel: a.makeModel,
    serial: a.serial,
    category: cat.name,
    icon: cat.icon,
    statusAtSend: a.status,
    holder: holder?.name ?? null,
    location: loc.name,
    project: proj.name,
  };
}

export const snapshotOf = (fa: Pick<FormAsset, 'snapshot'>): AssetSnapshot => fa.snapshot as unknown as AssetSnapshot;
export const assetLines = (fas: Array<Pick<FormAsset, 'snapshot'>>): AssetLine[] =>
  fas.map((fa) => ({ tag: snapshotOf(fa).tag, makeModel: snapshotOf(fa).makeModel }));

/** People directory (D15): upsert by email so typeahead and holders stay consistent. */
export async function upsertPerson(
  tx: Tx,
  type: PersonType,
  p: Partial<StaffPerson> & Partial<VendorPerson> & { name: string; email: string },
) {
  const data = {
    type,
    name: p.name,
    department: p.department ?? null,
    staffId: p.staffId ?? null,
    phone: p.phone ?? null,
    position: p.position ?? null,
    company: p.company ?? null,
  };
  return tx.person.upsert({
    where: { email: p.email.toLowerCase() },
    update: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null)) as Prisma.PersonUpdateInput,
    create: { ...data, email: p.email.toLowerCase() },
  });
}

export const signLink = (token: string) => `${env().APP_BASE_URL}/sign/${token}`;
export const approveLink = (token: string) => `${env().APP_BASE_URL}/approve/${token}`;

/** Issue a fresh single-use token for a signer slot; revokes any previous one. */
export async function issuePartyToken(tx: Tx, party: Pick<Party, 'id'>, expiresAt?: Date): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = newToken();
  const exp = expiresAt ?? addDays(clockNow(), SIGN_LINK_DAYS);
  await tx.party.update({
    where: { id: party.id },
    data: { tokenHash: hash, tokenIssuedAt: clockNow(), tokenExpiresAt: exp, reminderSentAt: null, expiryWarnedAt: null },
  });
  return { token, expiresAt: exp };
}

export async function issueApprovalToken(tx: Tx, approvalId: string): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = newToken();
  const exp = addDays(clockNow(), SIGN_LINK_DAYS);
  await tx.approval.update({
    where: { id: approvalId },
    data: { tokenHash: hash, tokenExpiresAt: exp, sentAt: clockNow(), status: 'PENDING' },
  });
  return { token, expiresAt: exp };
}

/** Emails are queued inside the transaction and sent only after it commits. */
export class MailQueue {
  readonly items: OutgoingMail[] = [];
  push(m: OutgoingMail) {
    this.items.push(m);
  }
  async flush(): Promise<string[]> {
    const failures: string[] = [];
    for (const m of this.items) {
      const r = await trySendMail(m);
      if (!r.ok) failures.push(Array.isArray(m.to) ? m.to.join(', ') : m.to);
    }
    return failures;
  }
}

export function emailWarning(failures: string[]): string | null {
  return failures.length
    ? `The record was saved, but the email to ${failures.join(', ')} could not be delivered. Check the mail settings, then use Resend.`
    : null;
}

export type FormWithAll = Form & {
  assets: Array<FormAsset & { asset: Asset }>;
  parties: Party[];
  approvals: Prisma.ApprovalGetPayload<object>[];
  childForms: Array<Form & { parties: Party[] }>;
};

export const formInclude = {
  assets: { orderBy: { position: 'asc' }, include: { asset: true } },
  parties: { orderBy: { order: 'asc' } },
  approvals: { orderBy: { order: 'asc' } },
  childForms: { include: { parties: true } },
} satisfies Prisma.FormInclude;

export async function loadForm(tx: Tx, id: string): Promise<FormWithAll> {
  return tx.form.findUniqueOrThrow({ where: { id }, include: formInclude }) as Promise<FormWithAll>;
}

export async function lockForm(tx: Tx, id: string): Promise<void> {
  await tx.$queryRawUnsafe(`SELECT id FROM "Form" WHERE id = $1::uuid FOR UPDATE`, id);
}

export function itContact(): string {
  return env().IT_CONTACT_EMAIL;
}
