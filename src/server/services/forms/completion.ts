// What happens when signatures and approvals arrive. Status changes happen only here,
// when a form reaches its completion condition — never when an email is merely sent.
import type { Prisma } from '@prisma/client';
import { FORM_TYPE_LABEL, STATUS_LABEL, isWorkingCondition, type Condition } from '../../../shared/constants';
import type { IssuanceData, MovementData, ReturnData } from '../../../shared/formSchemas';
import { transition } from '../../../shared/statusMachine';
import type { Tx } from '../../db';
import { approvalRequestEmail, signatureRequestEmail } from '../../email/templates';
import { conflict } from '../../lib/errors';
import { assetState, lockAssets } from '../assetLocks';
import { writeCustody } from '../custody';
import { notifyIT } from '../notifications';
import { nextFormReference } from '../numbering';
import {
  approveLink,
  assetLines,
  issueApprovalToken,
  issuePartyToken,
  itContact,
  loadForm,
  lockForm,
  MailQueue,
  signLink,
  snapshotOf,
  upsertPerson,
  type FormWithAll,
} from './core';
import { now as clockNow } from '../../lib/clock';

export interface AfterCommit {
  completedFormIds: string[];
}

const allSigned = (f: { parties: Array<{ needsSignature: boolean; status: string }> }) =>
  f.parties.filter((p) => p.needsSignature).every((p) => p.status === 'SIGNED');
const anySigned = (f: { parties: Array<{ needsSignature: boolean; status: string }> }) =>
  f.parties.some((p) => p.needsSignature && p.status === 'SIGNED');

/** Re-evaluate a form after a signature; completes it (and its parent movement) when everything is in. */
export async function evaluateForm(tx: Tx, formId: string, mails: MailQueue, after: AfterCommit): Promise<void> {
  await lockForm(tx, formId);
  const form = await loadForm(tx, formId);
  if (form.status !== 'AWAITING' && form.status !== 'PARTIAL') return;

  const childrenDone = form.childForms.every((c) => c.status === 'SIGNED');
  const childSigned = form.childForms.some((c) => anySigned(c));
  const selfDone = allSigned(form);

  if (form.type === 'INDEMNITY') {
    if (selfDone) {
      await finishParties(tx, form);
      await tx.form.update({ where: { id: form.id }, data: { status: 'SIGNED', completedAt: clockNow() } });
      after.completedFormIds.push(form.id);
      if (form.parentFormId) await evaluateForm(tx, form.parentFormId, mails, after);
    }
    return;
  }

  if (selfDone && childrenDone) {
    await completeForm(tx, form, after);
  } else if (anySigned(form) || childSigned) {
    if (form.status !== 'PARTIAL') await tx.form.update({ where: { id: form.id }, data: { status: 'PARTIAL' } });
  }
}

async function finishParties(tx: Tx, form: FormWithAll) {
  // IT is counter-signed automatically as issuer / receiver when the form completes.
  const now = clockNow();
  for (const p of form.parties) {
    if (!p.needsSignature) {
      await tx.party.update({ where: { id: p.id }, data: { status: 'SIGNED', signedAt: now, typedName: p.name } });
    }
  }
}

async function completeForm(tx: Tx, form: FormWithAll, after: AfterCommit) {
  const creator = await tx.user.findUniqueOrThrow({ where: { id: form.createdById } });
  const actor = { id: creator.id, name: creator.name };
  const now = clockNow();
  const assetIds = form.assets.map((fa) => fa.assetId);
  await lockAssets(tx, assetIds);
  const assets = new Map((await tx.asset.findMany({ where: { id: { in: assetIds } } })).map((a) => [a.id, a]));
  const locationName = async (id: string) => (await tx.location.findUniqueOrThrow({ where: { id } })).name;
  const personName = async (id: string | null) => (id ? ((await tx.person.findUnique({ where: { id } }))?.name ?? null) : null);
  const ref = { id: form.id, reference: form.reference };
  let summary = '';

  if (form.type === 'ISSUANCE') {
    const d = form.data as unknown as IssuanceData & { recipientPersonId: string };
    for (const fa of form.assets) {
      const a = assets.get(fa.assetId)!;
      const t = transition(assetState(a), { type: 'ISSUE_SIGNED' });
      if (!t.ok) throw conflict(`${a.tag}: ${t.message}`);
      const previous = await tx.custodyEvent.count({ where: { assetId: a.id, type: { in: ['RETURNED', 'REPAIRED'] } } });
      await tx.asset.update({
        where: { id: a.id },
        data: { status: 'ISSUED', damageOrigin: null, currentHolderId: d.recipientPersonId, currentFormId: form.id, condition: 'GOOD' },
      });
      const loc = await locationName(a.locationId);
      await writeCustody(tx, {
        assetId: a.id,
        type: previous > 0 ? 'REISSUED' : 'ISSUED',
        statusAfter: 'ISSUED',
        actor,
        occurredAt: now,
        toHolder: d.recipient.name,
        fromLocation: loc,
        toLocation: loc,
        form: ref,
        detail: { department: d.recipient.department, staffId: d.recipient.staffId, temporary: d.temporary },
      });
      await tx.formAsset.update({ where: { id: fa.id }, data: { active: false, resultingStatus: 'ISSUED' } });
    }
    summary = `asset${form.assets.length === 1 ? '' : 's'} now Issued`;
  } else if (form.type === 'RETURN') {
    const d = form.data as unknown as ReturnData & { receivedBy: string };
    for (const fa of form.assets) {
      const a = assets.get(fa.assetId)!;
      const condition = (fa.condition ?? d.items.find((i) => i.tag === a.tag)?.condition ?? 'GOOD') as Condition;
      const holder = await personName(a.currentHolderId);
      const loc = await locationName(a.locationId);
      if (d.returnerType === 'STAFF') {
        const t = transition(assetState(a), { type: 'RETURN_SIGNED', condition });
        if (!t.ok) throw conflict(`${a.tag}: ${t.message}`);
        await tx.asset.update({
          where: { id: a.id },
          data: {
            status: t.next.status,
            damageOrigin: t.next.status === 'DAMAGED' ? 'RETURNED' : null,
            damagedAt: t.next.status === 'DAMAGED' ? now : null,
            currentHolderId: null,
            currentFormId: null,
            condition,
          },
        });
        await writeCustody(tx, {
          assetId: a.id,
          type: 'RETURNED',
          statusAfter: t.next.status,
          actor,
          occurredAt: now,
          fromHolder: holder,
          fromLocation: loc,
          toLocation: loc,
          form: ref,
          detail: { condition, notes: d.conditionNotes ?? null, receivedBy: d.receivedBy },
        });
      } else {
        const t = transition(assetState(a), { type: 'VENDOR_RETURN_SIGNED', condition });
        if (!t.ok) throw conflict(`${a.tag}: ${t.message}`);
        const repaired = isWorkingCondition(condition);
        await tx.asset.update({
          where: { id: a.id },
          data: {
            status: t.next.status,
            damageOrigin: repaired ? null : (a.damageOrigin ?? 'REPORTED'),
            repairFormId: null,
            currentHolderId: null,
            currentFormId: null,
            condition,
          },
        });
        await writeCustody(tx, {
          assetId: a.id,
          type: repaired ? 'REPAIRED' : 'REPAIR_FAILED',
          statusAfter: t.next.status,
          actor,
          occurredAt: now,
          fromHolder: holder,
          fromLocation: d.returner.company,
          toLocation: loc,
          form: ref,
          detail: { condition, notes: d.conditionNotes ?? null, receivedBy: d.receivedBy, vendor: d.returner.company },
        });
      }
      await tx.formAsset.update({ where: { id: fa.id }, data: { active: false, resultingStatus: isWorkingCondition(condition) ? 'IN_STORE' : 'DAMAGED' } });
    }
    summary = 'return recorded';
  } else if (form.type === 'MOVEMENT') {
    const d = form.data as unknown as MovementData & { from: { holderName: string | null; location: string }; toLabel: string };
    const child = form.childForms[0] ?? null;
    for (const fa of form.assets) {
      const a = assets.get(fa.assetId)!;
      const fromLoc = await locationName(a.locationId);
      const fromHolder = await personName(a.currentHolderId);
      if (d.to.type === 'VENDOR') {
        // Repair approved earlier (inRepair already true); custody passes to the vendor contact.
        const vendor = await upsertPerson(tx, 'VENDOR', d.to.vendor);
        await tx.asset.update({ where: { id: a.id }, data: { currentHolderId: vendor.id, currentFormId: null } });
        await writeCustody(tx, {
          assetId: a.id,
          type: 'SENT_FOR_REPAIR',
          statusAfter: 'DAMAGED',
          actor,
          occurredAt: now,
          fromHolder,
          toHolder: d.to.vendor.company,
          fromLocation: fromLoc,
          toLocation: d.to.vendor.company,
          form: ref,
          detail: { reason: d.reason, responsible: d.responsibleOfficer, expectedReturn: d.expectedReturn ?? null, vendorContact: d.to.vendor.name },
        });
        await tx.formAsset.update({ where: { id: fa.id }, data: { active: false, resultingStatus: 'DAMAGED' } });
        continue;
      }
      const t = transition(assetState(a), { type: 'MOVE_SIGNED' });
      if (!t.ok) throw conflict(`${a.tag}: ${t.message}`);
      const toLocation = await tx.location.findUniqueOrThrow({ where: { name: d.to.location } });
      const patch: Prisma.AssetUncheckedUpdateInput = { locationId: toLocation.id };
      let toHolder = fromHolder;
      if (d.to.type === 'STAFF') {
        const person = await upsertPerson(tx, 'STAFF', d.to.person);
        patch.currentHolderId = person.id;
        // The old issuance is closed; the generated indemnity now governs custody.
        patch.currentFormId = child?.id ?? null;
        toHolder = d.to.person.name;
      }
      await tx.asset.update({ where: { id: a.id }, data: patch });
      await writeCustody(tx, {
        assetId: a.id,
        type: 'MOVED',
        statusAfter: a.status,
        actor,
        occurredAt: now,
        fromHolder,
        toHolder,
        fromLocation: fromLoc,
        toLocation: toLocation.name,
        form: ref,
        detail: { reason: d.reason, responsible: d.responsibleOfficer, indemnity: child?.reference ?? null, department: d.to.type === 'STAFF' ? d.to.person.department : null },
      });
      await tx.formAsset.update({ where: { id: fa.id }, data: { active: false, resultingStatus: a.status } });
    }
    summary = d.to.type === 'VENDOR' ? 'sent for repair' : 'movement recorded';
  }

  await finishParties(tx, form);
  await tx.form.update({ where: { id: form.id }, data: { status: 'SIGNED', completedAt: now } });
  after.completedFormIds.push(form.id);
  const signer = form.parties.find((p) => p.needsSignature)?.name ?? form.childForms[0]?.parties.find((p) => p.needsSignature)?.name ?? 'all parties';
  await notifyIT(
    {
      kind: 'SIGNED',
      message: [{ b: form.reference }, { t: ' signed by ' }, { b: signer }, { t: ` — ${summary}` }],
      link: `/documents/${form.reference}`,
      dedupeKey: `signed:${form.id}`,
    },
    tx,
  );
}

/** Both approvals are in: open signatures (and the indemnity for a receiving staff member). */
export async function startSignatures(tx: Tx, form: FormWithAll, mails: MailQueue): Promise<void> {
  const d = form.data as unknown as MovementData & { from: { holderName: string | null; location: string }; toLabel: string };
  const now = clockNow();
  const lines = assetLines(form.assets);
  const fromLabel = d.from.holderName ? `${d.from.holderName} · ${d.from.location}` : d.from.location;

  if (d.to.type === 'VENDOR') {
    const ids = form.assets.map((fa) => fa.assetId);
    await lockAssets(tx, ids);
    for (const a of await tx.asset.findMany({ where: { id: { in: ids } } })) {
      const t = transition(assetState(a), { type: 'REPAIR_APPROVED' });
      if (!t.ok) throw conflict(`${a.tag}: ${t.message}`);
      await tx.asset.update({ where: { id: a.id }, data: { repairFormId: form.id } });
    }
  }

  let deadline: Date | null = null;
  for (const p of form.parties.filter((x) => x.needsSignature)) {
    const { token, expiresAt } = await issuePartyToken(tx, p);
    deadline = expiresAt;
    mails.push({
      to: p.email!,
      ...signatureRequestEmail({ type: 'MOVEMENT', reference: form.reference, link: signLink(token), assets: lines, expiresAt, itContact: itContact(), from: fromLabel, to: d.toLabel }),
    });
  }

  if (d.to.type === 'STAFF') {
    const reference = await nextFormReference(tx, 'INDEMNITY');
    const child = await tx.form.create({
      data: {
        type: 'INDEMNITY',
        reference,
        status: 'AWAITING',
        createdById: form.createdById,
        parentFormId: form.id,
        sentAt: now,
        createdAt: now,
        data: { recipient: d.to.person, parentReference: form.reference, toLocation: d.to.location } as unknown as Prisma.InputJsonValue,
      },
    });
    for (const fa of form.assets) {
      await tx.formAsset.create({ data: { formId: child.id, assetId: fa.assetId, position: fa.position, active: false, snapshot: fa.snapshot as Prisma.InputJsonValue } });
    }
    const recipient = await tx.party.create({
      data: { formId: child.id, role: 'RECIPIENT', name: d.to.person.name, email: d.to.person.email.toLowerCase(), department: d.to.person.department, position: d.to.person.position ?? null, order: 0 },
    });
    const issuer = form.parties.find((p) => p.role === 'ISSUER');
    await tx.party.create({
      data: { formId: child.id, role: 'ISSUER', name: issuer?.name ?? 'ECEWS IT', position: issuer?.position, userId: issuer?.userId, needsSignature: false, status: 'RECORDED', order: 1 },
    });
    const { token, expiresAt } = await issuePartyToken(tx, recipient);
    deadline = expiresAt;
    await tx.form.update({ where: { id: child.id }, data: { deadline: expiresAt } });
    mails.push({
      to: recipient.email!,
      ...signatureRequestEmail({ type: 'INDEMNITY', reference, link: signLink(token), assets: lines, expiresAt, itContact: itContact() }),
    });
  }
  await tx.form.update({ where: { id: form.id }, data: { status: 'AWAITING', deadline } });
}

/** CTO approves → Admin Officer is asked. Admin approves → signatures start. Either rejects → Rejected. */
export async function decideApproval(
  tx: Tx,
  approvalId: string,
  decision: 'APPROVE' | 'REJECT',
  comment: string | undefined,
  meta: { ip: string; ua?: string },
  mails: MailQueue,
): Promise<{ formStatus: string }> {
  const approval = await tx.approval.findUniqueOrThrow({ where: { id: approvalId } });
  await lockForm(tx, approval.formId);
  const form = await loadForm(tx, approval.formId);
  if (form.status !== 'PENDING_APPROVAL') throw conflict('This movement is no longer awaiting approval.');
  const now = clockNow();
  await tx.approval.update({
    where: { id: approvalId },
    data: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedAt: now, comment: comment ?? null, tokenHash: null, ipAddress: meta.ip, userAgent: meta.ua?.slice(0, 300) },
  });
  const who = approval.role === 'CTO' ? 'CTO' : 'Admin Officer';
  if (decision === 'REJECT') {
    await tx.form.update({ where: { id: form.id }, data: { status: 'REJECTED', rejectedReason: comment ?? null, completedAt: now } });
    await tx.formAsset.updateMany({ where: { formId: form.id }, data: { active: false } });
    await tx.approval.updateMany({ where: { formId: form.id, status: { in: ['WAITING', 'PENDING'] } }, data: { tokenHash: null } });
    await notifyIT(
      { kind: 'REJECTED', message: [{ b: form.reference }, { t: ` rejected by the ${who}` }, ...(comment ? [{ t: `: ${comment}` }] : [])], link: `/signoffs?ref=${form.reference}` },
      tx,
    );
    return { formStatus: 'REJECTED' };
  }
  const next = form.approvals.find((a) => a.order > approval.order && a.status === 'WAITING');
  if (next) {
    const d = form.data as unknown as MovementData & { from: { holderName: string | null; location: string }; toLabel: string };
    const { token, expiresAt } = await issueApprovalToken(tx, next.id);
    await tx.form.update({ where: { id: form.id }, data: { deadline: expiresAt } });
    const creator = await tx.user.findUniqueOrThrow({ where: { id: form.createdById } });
    mails.push({
      to: next.email,
      ...approvalRequestEmail({
        reference: form.reference,
        approverRole: next.role,
        link: approveLink(token),
        assets: assetLines(form.assets),
        from: d.from.holderName ? `${d.from.holderName} · ${d.from.location}` : d.from.location,
        to: d.toLabel,
        reason: d.reason,
        requestedBy: creator.name,
        expiresAt,
        itContact: itContact(),
      }),
    });
    await notifyIT({ kind: 'APPROVED', message: [{ b: form.reference }, { t: ` approved by the ${who} — sent to the Admin Officer` }], link: `/signoffs?ref=${form.reference}` }, tx);
    return { formStatus: 'PENDING_APPROVAL' };
  }
  await startSignatures(tx, await loadForm(tx, form.id), mails);
  await notifyIT({ kind: 'APPROVED', message: [{ b: form.reference }, { t: ' fully approved — signature emails sent' }], link: `/signoffs?ref=${form.reference}` }, tx);
  return { formStatus: 'AWAITING' };
}

export function describeAssets(form: FormWithAll): string {
  const first = form.assets[0] ? snapshotOf(form.assets[0]) : null;
  if (!first) return FORM_TYPE_LABEL[form.type];
  return form.assets.length > 1 ? `${first.makeModel} +${form.assets.length - 1}` : first.makeModel;
}

export const statusWord = (s: keyof typeof STATUS_LABEL) => STATUS_LABEL[s];
