// Create, edit, discard and send forms. Sending takes the one-active-form lock (D12, D13).
import { Prisma, type Asset, type Form, type Person } from '@prisma/client';
import { isWorkingCondition, type FormType } from '../../../shared/constants';
import {
  formWrite,
  strictSchema,
  type FormWrite,
  type IssuanceData,
  type MovementData,
  type NewFormType,
  type ReturnData,
} from '../../../shared/formSchemas';
import { can } from '../../../shared/permissions';
import { formEligibility, transition, type FormSlot } from '../../../shared/statusMachine';
import { db, withTx, type Tx } from '../../db';
import { approvalRequestEmail, signatureRequestEmail } from '../../email/templates';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/http';
import { activeLocks, assetState, lockAssets, lockMessage } from '../assetLocks';
import { audit } from '../audit';
import { writeCustody } from '../custody';
import { nextFormReference } from '../numbering';
import type { SessionUser } from '../sessions';
import {
  approveLink,
  assetLines,
  emailWarning,
  issueApprovalToken,
  issuePartyToken,
  itContact,
  loadForm,
  lockForm,
  MailQueue,
  signLink,
  snapshotAsset,
  upsertPerson,
} from './core';
import { now as clockNow } from '../../lib/clock';

async function assetsByTags(tx: Tx, tags: string[]): Promise<Asset[]> {
  if (!tags.length) return [];
  const assets = await tx.asset.findMany({ where: { tag: { in: tags }, deletedAt: null } });
  const missing = tags.filter((t) => !assets.some((a) => a.tag === t));
  if (missing.length) throw badRequest(`Asset ${missing.join(', ')} was not found.`, { fields: { assetTags: `Unknown asset: ${missing.join(', ')}` } });
  return tags.map((t) => assets.find((a) => a.tag === t)!);
}

async function writeAssets(tx: Tx, formId: string, assets: Asset[]) {
  await tx.formAsset.deleteMany({ where: { formId } });
  let position = 0;
  for (const a of assets) {
    await tx.formAsset.create({
      data: { formId, assetId: a.id, position: position++, snapshot: (await snapshotAsset(tx, a)) as unknown as Prisma.InputJsonValue },
    });
  }
}

export interface FormResult {
  id: string;
  reference: string;
  type: FormType;
  status: Form['status'];
  emailWarning: string | null;
}

/** POST /forms — creates a draft, and sends it in the same transaction when `send` is true. */
export async function createForm(body: FormWrite, user: SessionUser, idempotencyKey?: string): Promise<FormResult> {
  if (idempotencyKey) {
    const existing = await db().form.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.createdById !== user.id) throw conflict('This request key was already used.');
      return { id: existing.id, reference: existing.reference, type: existing.type, status: existing.status, emailWarning: null };
    }
  }
  const mails = new MailQueue();
  let result: FormResult;
  try {
    result = await withTx(async (tx) => {
      const assets = await assetsByTags(tx, body.assetTags);
      // Take the row locks before inserting FormAsset rows (whose FK takes a key-share lock),
      // otherwise two concurrent sends for the same asset deadlock instead of one getting a 409.
      if (body.send) await lockAssets(tx, assets.map((a) => a.id));
      const reference = await nextFormReference(tx, body.type);
      const form = await tx.form.create({
        data: {
          type: body.type,
          reference,
          status: 'DRAFT',
          createdById: user.id,
          data: body.data as Prisma.InputJsonValue,
          idempotencyKey: idempotencyKey ?? null,
          createdAt: clockNow(),
        },
      });
      await writeAssets(tx, form.id, assets);
      await audit({ userId: user.id, action: 'form.create', entityType: 'Form', entityId: form.id, detail: { reference } }, tx);
      if (body.send) await sendInTx(tx, form.id, user, mails);
      const f = await tx.form.findUniqueOrThrow({ where: { id: form.id } });
      return { id: f.id, reference: f.reference, type: f.type, status: f.status, emailWarning: null };
    });
  } catch (err) {
    // A concurrent duplicate with the same idempotency key lost the race: return the winner.
    if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && String(err.meta?.target).includes('idempotencyKey')) {
      const existing = await db().form.findUniqueOrThrow({ where: { idempotencyKey } });
      return { id: existing.id, reference: existing.reference, type: existing.type, status: existing.status, emailWarning: null };
    }
    throw mapLockRace(err);
  }
  result.emailWarning = emailWarning(await mails.flush());
  return result;
}

export async function updateDraft(id: string, body: FormWrite, user: SessionUser): Promise<FormResult> {
  return withTx(async (tx) => {
    await lockForm(tx, id);
    const form = await tx.form.findUnique({ where: { id } });
    if (!form) throw notFound('Form not found.');
    if (form.status !== 'DRAFT') throw conflict(`${form.reference} has already been sent and can no longer be edited.`);
    if (form.type !== body.type) throw badRequest('The form type cannot be changed.');
    const assets = await assetsByTags(tx, body.assetTags);
    await tx.form.update({ where: { id }, data: { data: body.data as Prisma.InputJsonValue } });
    await writeAssets(tx, id, assets);
    await audit({ userId: user.id, action: 'form.update_draft', entityType: 'Form', entityId: id }, tx);
    return { id, reference: form.reference, type: form.type, status: form.status, emailWarning: null };
  });
}

export async function discardDraft(id: string, user: SessionUser): Promise<void> {
  await withTx(async (tx) => {
    await lockForm(tx, id);
    const form = await tx.form.findUnique({ where: { id } });
    if (!form) throw notFound('Form not found.');
    if (form.status !== 'DRAFT') throw conflict(`${form.reference} is not a draft. Cancel it instead.`);
    await tx.form.delete({ where: { id } });
    await audit({ userId: user.id, action: 'form.discard_draft', entityType: 'Form', entityId: id, detail: { reference: form.reference } }, tx);
  });
}

export async function sendForm(id: string, user: SessionUser): Promise<FormResult> {
  const mails = new MailQueue();
  let result: FormResult;
  try {
    result = await withTx(async (tx) => {
      await lockForm(tx, id);
      const form = await tx.form.findUnique({ where: { id } });
      if (!form) throw notFound('Form not found.');
      if (form.status === 'DRAFT') await sendInTx(tx, id, user, mails);
      const f = await tx.form.findUniqueOrThrow({ where: { id } });
      return { id, reference: f.reference, type: f.type, status: f.status, emailWarning: null };
    });
  } catch (err) {
    throw mapLockRace(err);
  }
  result.emailWarning = emailWarning(await mails.flush());
  return result;
}

/** The partial unique index fired: another form grabbed the asset between our check and insert. */
function mapLockRace(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && String(err.meta?.target ?? '').includes('assetId')) {
    return conflict('One of these assets was just put on another form. Refresh and check the asset’s status.');
  }
  return err;
}

const holderMatches = (holder: Person | null, email: string, company?: string) =>
  !!holder &&
  (holder.email.toLowerCase() === email.toLowerCase() ||
    (company !== undefined && !!holder.company && holder.company.toLowerCase() === company.toLowerCase()));

/** Validate, lock, and move a DRAFT to its first active status. Runs inside the caller's transaction. */
export async function sendInTx(tx: Tx, formId: string, user: SessionUser, mails: MailQueue): Promise<void> {
  const form = await loadForm(tx, formId);
  const type = form.type as NewFormType;
  const data = parse(strictSchema(type), form.data, 'form');
  if (form.assets.length === 0) throw badRequest('Add at least one asset.', { fields: { assetTags: 'Add at least one asset.' } });

  const assetIds = form.assets.map((fa) => fa.assetId);
  await lockAssets(tx, assetIds);
  const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const locks = await activeLocks(tx, assetIds);
  const holders = new Map(
    (await tx.person.findMany({ where: { id: { in: assets.map((a) => a.currentHolderId).filter((x): x is string => !!x) } } })).map((p) => [p.id, p]),
  );

  let slot: FormSlot;
  if (type === 'ISSUANCE') slot = { form: 'ISSUANCE' };
  else if (type === 'RETURN') slot = { form: 'RETURN', returner: (data as ReturnData).returnerType };
  else {
    const m = data as MovementData;
    slot = { form: 'MOVEMENT', to: m.to.type, reinstate: m.reinstate };
    if (m.reinstate && !can(user.role, 'asset.reinstate')) throw forbidden('Only IT Admin can reinstate retired assets for repair.');
  }

  for (const fa of form.assets) {
    const a = byId.get(fa.assetId)!;
    if (a.deletedAt) throw conflict(`${a.tag} has been deleted.`);
    const lock = locks.get(a.id);
    if (lock && lock.formId !== form.id) throw conflict(lockMessage(a.tag, lock), { blockingReference: lock.reference });
    const elig = formEligibility(assetState(a), slot);
    if (!elig.ok) throw conflict(`${a.tag}: ${elig.message}`);
  }

  // Fresh snapshots at send time so the document shows what was handed over.
  for (const fa of form.assets) {
    await tx.formAsset.update({
      where: { id: fa.id },
      data: { active: true, snapshot: (await snapshotAsset(tx, byId.get(fa.assetId)!)) as unknown as Prisma.InputJsonValue },
    });
  }

  const now = clockNow();
  const lines = assetLines(form.assets.map((fa) => ({ snapshot: fa.snapshot })));
  const it = { name: user.name, position: `${user.title} · ${user.office}`, userId: user.id };

  if (type === 'ISSUANCE') {
    const d = data as IssuanceData;
    const person = await upsertPerson(tx, 'STAFF', d.recipient);
    const recipient = await tx.party.create({
      data: { formId, role: 'RECIPIENT', name: d.recipient.name, email: person.email, department: d.recipient.department, position: d.recipient.position ?? null, order: 0 },
    });
    await tx.party.create({
      data: { formId, role: 'ISSUER', name: it.name, position: it.position, userId: it.userId, needsSignature: false, status: 'RECORDED', order: 1 },
    });
    const { token, expiresAt } = await issuePartyToken(tx, recipient);
    await tx.form.update({
      where: { id: formId },
      data: {
        status: 'AWAITING',
        sentAt: now,
        deadline: expiresAt,
        temporary: d.temporary,
        expectedReturn: d.expectedReturn ? new Date(`${d.expectedReturn}T00:00:00Z`) : null,
        data: { ...d, recipientPersonId: person.id } as Prisma.InputJsonValue,
      },
    });
    mails.push({ to: person.email, ...signatureRequestEmail({ type: 'ISSUANCE', reference: form.reference, link: signLink(token), assets: lines, expiresAt, itContact: itContact() }) });
  } else if (type === 'RETURN') {
    const d = data as ReturnData;
    const tags = form.assets.map((fa) => byId.get(fa.assetId)!.tag);
    for (const it of d.items) if (!tags.includes(it.tag)) throw badRequest(`${it.tag} has a condition but is not on the form.`);
    for (const t of tags) if (!d.items.some((it) => it.tag === t)) throw badRequest(`Assess the condition of ${t}.`, { fields: { [`condition.${t}`]: 'Choose the condition.' } });
    for (const fa of form.assets) {
      const a = byId.get(fa.assetId)!;
      const holder = a.currentHolderId ? (holders.get(a.currentHolderId) ?? null) : null;
      const ok = d.returnerType === 'STAFF' ? holderMatches(holder, d.returner.email) : holderMatches(holder, d.returner.email, d.returner.company);
      if (!ok) throw conflict(`${a.tag} is held by ${holder?.name ?? 'nobody'}, not ${d.returner.name}. Return it on that person’s form.`);
      const condition = d.items.find((i) => i.tag === a.tag)!.condition;
      await tx.formAsset.update({ where: { id: fa.id }, data: { condition, resultingStatus: isWorkingCondition(condition) ? 'IN_STORE' : 'DAMAGED' } });
    }
    const person = await upsertPerson(tx, d.returnerType, d.returner);
    const returner = await tx.party.create({
      data: {
        formId,
        role: 'RETURNER',
        name: d.returner.name,
        email: person.email,
        department: d.returnerType === 'STAFF' ? d.returner.department : d.returner.company,
        order: 0,
      },
    });
    await tx.party.create({
      data: { formId, role: 'RECEIVER', name: it.name, position: it.position, userId: it.userId, needsSignature: false, status: 'RECORDED', order: 1 },
    });
    const { token, expiresAt } = await issuePartyToken(tx, returner);
    await tx.form.update({
      where: { id: formId },
      data: { status: 'AWAITING', sentAt: now, deadline: expiresAt, data: { ...d, returnerPersonId: person.id, receivedBy: user.name } as Prisma.InputJsonValue },
    });
    mails.push({
      to: person.email,
      ...signatureRequestEmail({ type: 'RETURN', reference: form.reference, link: signLink(token), assets: lines, expiresAt, itContact: itContact(), returnDate: new Date(`${d.returnDate}T12:00:00Z`) }),
    });
  } else {
    const d = data as MovementData;
    const first = byId.get(form.assets[0]!.assetId)!;
    for (const fa of form.assets) {
      const a = byId.get(fa.assetId)!;
      if (a.currentHolderId !== first.currentHolderId || a.locationId !== first.locationId)
        throw conflict('All assets on one movement must have the same current holder and location. Split them into separate movements.');
    }
    const fromHolder = first.currentHolderId ? (holders.get(first.currentHolderId) ?? null) : null;
    const fromLocation = await tx.location.findUniqueOrThrow({ where: { id: first.locationId } });
    let toLabel: string;
    if (d.to.type === 'STAFF') {
      if (fromHolder && fromHolder.email === d.to.person.email.toLowerCase()) throw conflict(`${d.to.person.name} already holds these assets.`);
      if (!(await tx.location.findUnique({ where: { name: d.to.location } }))) throw badRequest('Choose a destination location from the list.');
      toLabel = `${d.to.person.name} · ${d.to.location}`;
    } else if (d.to.type === 'LOCATION') {
      if (d.to.location === fromLocation.name) throw conflict(`The assets are already at ${d.to.location}.`);
      if (!(await tx.location.findUnique({ where: { name: d.to.location } }))) throw badRequest('Choose a destination location from the list.');
      toLabel = d.to.location;
    } else {
      toLabel = d.to.vendor.company;
    }

    // D25: reinstatement of retired assets is committed together with the movement.
    if (d.reinstate) {
      for (const fa of form.assets) {
        const a = byId.get(fa.assetId)!;
        if (a.status !== 'RETIRED') continue;
        const t = transition(assetState(a), { type: 'REINSTATE' });
        if (!t.ok) throw conflict(t.message);
        await tx.asset.update({ where: { id: a.id }, data: { status: 'DAMAGED', damageOrigin: 'REPORTED', damagedAt: now, retireReason: null, retiredAt: null } });
        await writeCustody(tx, {
          assetId: a.id,
          type: 'REINSTATED_FOR_REPAIR',
          statusAfter: 'DAMAGED',
          actor: { id: user.id, name: user.name },
          occurredAt: now,
          form: { id: formId, reference: form.reference },
          detail: {},
        });
      }
    }

    let order = 0;
    if (fromHolder && fromHolder.type === 'STAFF') {
      await tx.party.create({
        data: { formId, role: 'HANDOVER', name: fromHolder.name, email: fromHolder.email, department: fromHolder.department, order: order++ },
      });
    }
    if (d.to.type === 'LOCATION') {
      await tx.party.create({
        data: { formId, role: 'COUNTERPARTY', name: d.to.contact.name, email: d.to.contact.email.toLowerCase(), department: d.to.contact.role ?? d.to.location, order: order++ },
      });
    } else if (d.to.type === 'VENDOR') {
      const v = await upsertPerson(tx, 'VENDOR', d.to.vendor);
      await tx.party.create({
        data: { formId, role: 'COUNTERPARTY', name: d.to.vendor.name, email: v.email, department: d.to.vendor.company, order: order++ },
      });
    } else {
      await upsertPerson(tx, 'STAFF', d.to.person);
    }
    await tx.party.create({
      data: { formId, role: 'ISSUER', name: it.name, position: it.position, userId: it.userId, needsSignature: false, status: 'RECORDED', order: order++ },
    });
    const cto = await tx.approval.create({ data: { formId, role: 'CTO', name: d.approvers.cto.name ?? null, email: d.approvers.cto.email, order: 1 } });
    await tx.approval.create({ data: { formId, role: 'ADMIN_OFFICER', name: d.approvers.admin.name ?? null, email: d.approvers.admin.email, order: 2 } });
    const { token, expiresAt } = await issueApprovalToken(tx, cto.id);
    await tx.form.update({
      where: { id: formId },
      data: {
        status: 'PENDING_APPROVAL',
        sentAt: now,
        deadline: expiresAt,
        temporary: d.temporary,
        expectedReturn: d.expectedReturn ? new Date(`${d.expectedReturn}T00:00:00Z`) : null,
        data: {
          ...d,
          from: {
            holderId: fromHolder?.id ?? null,
            holderName: fromHolder?.name ?? null,
            holderDepartment: fromHolder?.department ?? null,
            location: fromLocation.name,
          },
          toLabel,
        } as Prisma.InputJsonValue,
      },
    });
    mails.push({
      to: d.approvers.cto.email,
      ...approvalRequestEmail({
        reference: form.reference,
        approverRole: 'CTO',
        link: approveLink(token),
        assets: lines,
        from: fromHolder ? `${fromHolder.name} · ${fromLocation.name}` : fromLocation.name,
        to: toLabel,
        reason: d.reason,
        requestedBy: user.name,
        expiresAt,
        itContact: itContact(),
      }),
    });
  }
  await audit({ userId: user.id, action: 'form.send', entityType: 'Form', entityId: formId, detail: { reference: form.reference } }, tx);
}

export function parseFormWrite(body: unknown): FormWrite {
  return parse(formWrite, body);
}
