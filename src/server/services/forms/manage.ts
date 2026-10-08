// IT-side management of sent forms: resend / remind (fresh single-use links), cancel, email copy.
import { z } from 'zod';
import { AUTO_REMINDER_HOURS, OVERDUE_ISSUE_DAYS, type FormType } from '../../../shared/constants';
import { fmtDate, isoDateWAT } from '../../../shared/format';
import { db, withTx, type Tx } from '../../db';
import { trySendMail } from '../../email/mailer';
import { approvalRequestEmail, emailCopyEmail, itNoticeEmail, signatureRequestEmail } from '../../email/templates';
import { env } from '../../env';
import { conflict, notFound } from '../../lib/errors';
import { formPdf, pdfFileName } from '../../pdf/documents';
import { audit } from '../audit';
import { notifyIT } from '../notifications';
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
  type FormWithAll,
} from './core';
import { now as clockNow } from '../../lib/clock';

const RESENDABLE = ['AWAITING', 'PARTIAL', 'EXPIRED', 'PENDING_APPROVAL'];

function routeOf(form: FormWithAll) {
  const d = form.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    from: d.from?.holderName ? `${d.from.holderName} · ${d.from.location}` : (d.from?.location as string | undefined),
    to: d.toLabel as string | undefined,
  };
}

/** Revoke old links, issue fresh ones with a new 7-day window, and email reminders. */
async function resendInTx(tx: Tx, formId: string, user: SessionUser | null, mails: MailQueue): Promise<number> {
  await lockForm(tx, formId);
  const form = await loadForm(tx, formId);
  if (!RESENDABLE.includes(form.status)) {
    throw conflict(`${form.reference} is ${form.status.toLowerCase()} — there is nothing to resend.`);
  }
  let sent = 0;
  let deadline: Date | null = null;
  const pendingApproval = form.approvals.find((a) => a.status === 'PENDING');
  if (pendingApproval) {
    const { token, expiresAt } = await issueApprovalToken(tx, pendingApproval.id);
    deadline = expiresAt;
    const creator = await tx.user.findUniqueOrThrow({ where: { id: form.createdById } });
    const d = form.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = routeOf(form);
    mails.push({
      to: pendingApproval.email,
      ...approvalRequestEmail({
        reference: form.reference,
        approverRole: pendingApproval.role,
        link: approveLink(token),
        assets: assetLines(form.assets),
        from: r.from ?? '',
        to: r.to ?? '',
        reason: String(d.reason ?? ''),
        requestedBy: creator.name,
        expiresAt,
        itContact: itContact(),
      }),
    });
    sent++;
    await tx.form.update({ where: { id: form.id }, data: { status: 'PENDING_APPROVAL', deadline } });
  } else {
    const targets: Array<{ form: FormWithAll; type: FormType }> = [{ form, type: form.type }];
    for (const c of form.childForms) if (RESENDABLE.includes(c.status)) targets.push({ form: await loadForm(tx, c.id), type: c.type });
    for (const t of targets) {
      const pending = t.form.parties.filter((p) => p.needsSignature && p.status === 'PENDING');
      for (const p of pending) {
        const { token, expiresAt } = await issuePartyToken(tx, p);
        deadline = expiresAt;
        const r = routeOf(form);
        mails.push({
          to: p.email!,
          ...signatureRequestEmail({
            type: t.type,
            reference: t.form.reference,
            link: signLink(token),
            assets: assetLines(t.form.assets),
            expiresAt,
            itContact: itContact(),
            reminder: true,
            from: r.from,
            to: r.to,
          }),
        });
        sent++;
      }
      if (pending.length) {
        const signed = t.form.parties.some((p) => p.needsSignature && p.status === 'SIGNED') || t.form.childForms.some((c) => c.parties.some((p) => p.needsSignature && p.status === 'SIGNED'));
        await tx.form.update({ where: { id: t.form.id }, data: { status: signed ? 'PARTIAL' : 'AWAITING', deadline } });
      }
    }
    if (form.status === 'EXPIRED' && sent === 0) {
      // Every signer is done but a child expired earlier — re-evaluate status.
      await tx.form.update({ where: { id: form.id }, data: { status: 'PARTIAL' } });
    }
  }
  if (sent === 0) throw conflict(`${form.reference} has no pending signers to remind.`);
  await audit({ userId: user?.id ?? null, action: 'form.resend', entityType: 'Form', entityId: form.id, detail: { reference: form.reference, links: sent } }, tx);
  return sent;
}

export async function resendForm(formId: string, user: SessionUser) {
  const mails = new MailQueue();
  const sent = await withTx((tx) => resendInTx(tx, formId, user, mails));
  const warning = emailWarning(await mails.flush());
  const form = await db().form.findUniqueOrThrow({ where: { id: formId } });
  return { reference: form.reference, status: form.status, deadline: form.deadline, linksSent: sent, emailWarning: warning };
}

export const remindBody = z.object({ formIds: z.array(z.string().uuid()).min(1, 'Choose at least one document.').max(100) });

export async function bulkRemind(formIds: string[], user: SessionUser) {
  const results: Array<{ id: string; reference?: string; ok: boolean; error?: string }> = [];
  // A movement's resend already covers its generated indemnity — never email the same signer twice.
  const parents = new Map((await db().form.findMany({ where: { id: { in: formIds } }, select: { id: true, parentFormId: true, reference: true } })).map((f) => [f.id, f]));
  for (const id of formIds) {
    const f = parents.get(id);
    if (f?.parentFormId && formIds.includes(f.parentFormId)) {
      results.push({ id, reference: f.reference, ok: true });
      continue;
    }
    try {
      const r = await resendForm(id, user);
      results.push({ id, reference: r.reference, ok: !r.emailWarning, error: r.emailWarning ?? undefined });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  return { sent: results.filter((r) => r.ok).length, results };
}

export async function cancelForm(formId: string, user: SessionUser) {
  return withTx(async (tx) => {
    const start = await tx.form.findUnique({ where: { id: formId } });
    if (!start) throw notFound('Form not found.');
    // Cancelling a generated indemnity cancels its movement (they are one transaction).
    const rootId = start.parentFormId ?? start.id;
    await lockForm(tx, rootId);
    const root = await loadForm(tx, rootId);
    if (!['PENDING_APPROVAL', 'AWAITING', 'PARTIAL', 'EXPIRED'].includes(root.status)) {
      throw conflict(`${root.reference} is ${root.status.toLowerCase()} and cannot be cancelled.`);
    }
    const ids = [root.id, ...root.childForms.map((c) => c.id)];
    const now = clockNow();
    await tx.form.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED', cancelledAt: now } });
    await tx.formAsset.updateMany({ where: { formId: { in: ids } }, data: { active: false } });
    await tx.party.updateMany({ where: { formId: { in: ids } }, data: { tokenHash: null } });
    await tx.approval.updateMany({ where: { formId: root.id }, data: { tokenHash: null } });
    // An approved-but-unsigned repair movement no longer holds the asset in repair.
    await tx.asset.updateMany({ where: { repairFormId: root.id }, data: { repairFormId: null } });
    await audit({ userId: user.id, action: 'form.cancel', entityType: 'Form', entityId: root.id, detail: { reference: root.reference } }, tx);
    return { reference: root.reference, status: 'CANCELLED' as const };
  });
}

export const emailCopyBody = z.object({
  to: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  alsoSigner: z.boolean().default(false),
});

export async function emailCopy(formId: string, body: z.infer<typeof emailCopyBody>, user: SessionUser) {
  const form = await loadForm(db(), formId);
  if (form.status === 'DRAFT') throw conflict('Drafts have no document to send yet.');
  const pdf = await formPdf(formId, { regenerate: form.status === 'SIGNED' });
  const signer = form.parties.find((p) => p.needsSignature && p.email);
  const to = [body.to, ...(body.alsoSigner && signer?.email ? [signer.email] : [])];
  const mail = emailCopyEmail({ reference: form.reference, type: form.type, signedAt: form.completedAt });
  const failures: string[] = [];
  for (const addr of [...new Set(to)]) {
    const r = await trySendMail({ to: addr, ...mail, attachments: [{ filename: pdfFileName(form.reference), content: pdf, contentType: 'application/pdf' }] });
    if (!r.ok) failures.push(addr);
  }
  await audit({ userId: user.id, action: 'form.email_copy', entityType: 'Form', entityId: formId, detail: { to } });
  return { sentTo: to.filter((t) => !failures.includes(t)), emailWarning: emailWarning(failures) };
}

// ---------------------------------------------------------------- scheduled jobs

/** Links past their expiry move the form to Expired (Sign-offs → Expired tab). */
export async function expireLinksJob(now = clockNow()): Promise<number> {
  const parties = await db().party.findMany({
    where: { status: 'PENDING', needsSignature: true, tokenExpiresAt: { lt: now }, form: { status: { in: ['AWAITING', 'PARTIAL'] } } },
    select: { formId: true },
  });
  const approvals = await db().approval.findMany({
    where: { status: 'PENDING', tokenExpiresAt: { lt: now }, form: { status: 'PENDING_APPROVAL' } },
    select: { formId: true },
  });
  const ids = [...new Set([...parties, ...approvals].map((p) => p.formId))];
  for (const id of ids) {
    await withTx(async (tx) => {
      await lockForm(tx, id);
      const f = await tx.form.findUniqueOrThrow({ where: { id } });
      if (!['AWAITING', 'PARTIAL', 'PENDING_APPROVAL'].includes(f.status)) return;
      await tx.form.update({ where: { id }, data: { status: 'EXPIRED' } });
      await notifyIT(
        { kind: 'EXPIRED', message: [{ t: 'Sign-off ' }, { b: f.reference }, { t: ' link expired — re-send it' }], link: `/signoffs?tab=EXPIRED&ref=${f.reference}`, dedupeKey: `expired:${id}:${f.deadline?.toISOString() ?? ''}` },
        tx,
      );
    });
  }
  return ids.length;
}

/** One automatic reminder 48 h after a link is issued (fresh link, same expiry). */
export async function autoReminderJob(now = clockNow()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_REMINDER_HOURS * 3600000);
  const due = await db().party.findMany({
    where: {
      status: 'PENDING',
      needsSignature: true,
      reminderSentAt: null,
      tokenIssuedAt: { lte: cutoff },
      tokenExpiresAt: { gt: now },
      form: { status: { in: ['AWAITING', 'PARTIAL'] } },
    },
    include: { form: true },
  });
  let count = 0;
  for (const p of due) {
    const mails = new MailQueue();
    await withTx(async (tx) => {
      const form = await loadForm(tx, p.formId);
      const { token, expiresAt } = await issuePartyToken(tx, p, p.tokenExpiresAt!);
      await tx.party.update({ where: { id: p.id }, data: { reminderSentAt: now } });
      const r = routeOf(form);
      mails.push({
        to: p.email!,
        ...signatureRequestEmail({ type: form.type, reference: form.reference, link: signLink(token), assets: assetLines(form.assets), expiresAt, itContact: itContact(), reminder: true, from: r.from, to: r.to }),
      });
    });
    await mails.flush();
    count++;
  }
  return count;
}

/** "Sign-off ISS-0142 link expires in 24h — remind Samuel Etuk". */
export async function expiringSoonJob(now = clockNow()): Promise<number> {
  const soon = new Date(now.getTime() + 24 * 3600000);
  const parties = await db().party.findMany({
    where: { status: 'PENDING', needsSignature: true, expiryWarnedAt: null, tokenExpiresAt: { gt: now, lte: soon }, form: { status: { in: ['AWAITING', 'PARTIAL'] } } },
    include: { form: true },
  });
  for (const p of parties) {
    await notifyIT({
      kind: 'LINK_EXPIRING',
      message: [{ t: 'Sign-off ' }, { b: p.form.reference }, { t: ' link expires in 24h — remind ' }, { b: p.name }],
      link: `/signoffs?ref=${p.form.reference}`,
      dedupeKey: `expiring:${p.id}:${p.tokenExpiresAt?.toISOString()}`,
    });
    await db().party.update({ where: { id: p.id }, data: { expiryWarnedAt: now } });
  }
  return parties.length;
}

/** Overdue temporary issuances (≥ 90 days) and vendor repairs past their expected return (D27). */
export async function overdueJob(now = clockNow()): Promise<number> {
  let count = 0;
  const cutoff = new Date(now.getTime() - OVERDUE_ISSUE_DAYS * 86400000);
  const issued = await db().asset.findMany({
    where: { status: 'ISSUED', deletedAt: null, currentFormId: { not: null } },
    select: { id: true, tag: true, currentFormId: true },
  });
  const forms = new Map(
    (await db().form.findMany({ where: { id: { in: issued.map((a) => a.currentFormId!) }, temporary: true, completedAt: { lte: cutoff } } })).map((f) => [f.id, f]),
  );
  for (const a of issued) {
    const f = forms.get(a.currentFormId!);
    if (!f?.completedAt) continue;
    const days = Math.floor((now.getTime() - f.completedAt.getTime()) / 86400000);
    await notifyIT({
      kind: 'OVERDUE_RETURN',
      message: [{ b: a.tag }, { t: ' overdue return — ' }, { b: `${days} days` }, { t: ' issued' }],
      link: `/assets/${a.tag}`,
      dedupeKey: `overdue:${f.id}:${a.id}`,
    });
    count++;
  }
  const today = isoDateWAT(now);
  const repairs = await db().asset.findMany({ where: { repairFormId: { not: null }, deletedAt: null }, select: { tag: true, repairFormId: true } });
  for (const a of repairs) {
    const f = await db().form.findUnique({ where: { id: a.repairFormId! }, include: { createdBy: true } });
    if (!f?.expectedReturn || isoDateWAT(f.expectedReturn) >= today || f.status !== 'SIGNED') continue;
    const d = f.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const vendor = String(d.to?.vendor?.company ?? 'the vendor');
    await notifyIT({
      kind: 'OVERDUE_RETURN',
      message: [{ b: a.tag }, { t: ` overdue back from ${vendor} — expected ${fmtDate(f.expectedReturn)}` }],
      link: `/assets/${a.tag}`,
      dedupeKey: `repair-overdue:${f.id}:${a.tag}:${today}`,
    });
    if (f.overdueNotifiedAt === null || isoDateWAT(f.overdueNotifiedAt) !== today) {
      await trySendMail({
        to: f.createdBy.email,
        ...itNoticeEmail({
          subject: `Overdue repair return: ${a.tag} (${f.reference})`,
          lines: [`${a.tag} was expected back from ${vendor} on ${fmtDate(f.expectedReturn)}.`, 'Follow up with the vendor, then record the return with Receive back.'],
          link: `${env().APP_BASE_URL}/assets/${a.tag}`,
          label: 'Open the asset',
        }),
      });
      await db().form.update({ where: { id: f.id }, data: { overdueNotifiedAt: now } });
    }
    count++;
  }
  return count;
}
