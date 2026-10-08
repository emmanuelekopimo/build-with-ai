// Public, login-free signing and approval. Invalid, used or expired links never reveal form data.
import { z } from 'zod';
import {
  CONDITION_LABEL,
  FORM_TITLE,
  SIGNING_CONFIRMATION,
  SIGNING_TERMS,
  STATUS_LABEL,
  type AssetStatus,
  type Condition,
} from '../../../shared/constants';
import { db, withTx } from '../../db';
import { receiptEmail } from '../../email/templates';
import { trySendMail } from '../../email/mailer';
import { badRequest, HttpError } from '../../lib/errors';
import { hashToken, looksLikeToken, tokenMatches } from '../../lib/tokens';
import { logger } from '../../lib/logger';
import { formPdf, pdfFileName } from '../../pdf/documents';
import { audit } from '../audit';
import { decideApproval, evaluateForm, type AfterCommit } from './completion';
import { itContact, loadForm, MailQueue, snapshotOf } from './core';
import { now as clockNow } from '../../lib/clock';

export type LinkState = 'invalid' | 'used' | 'expired' | 'closed';

const STATE_MESSAGE: Record<LinkState, string> = {
  invalid: 'This link is not valid. It may have been replaced by a newer link.',
  used: 'This link has already been used. Each link works only once.',
  expired: 'This link has expired.',
  closed: 'This request is no longer open.',
};

export class LinkError extends HttpError {
  constructor(public readonly state: LinkState) {
    super(410, STATE_MESSAGE[state], { state, itContact: itContact() });
  }
}

async function partyForToken(token: string) {
  if (!looksLikeToken(token)) throw new LinkError('invalid');
  const party = await db().party.findUnique({ where: { tokenHash: hashToken(token) }, include: { form: true } });
  if (!party || !tokenMatches(token, party.tokenHash)) throw new LinkError('invalid');
  if (party.usedAt || party.status === 'SIGNED') throw new LinkError('used');
  if (['CANCELLED', 'REJECTED', 'SIGNED'].includes(party.form.status)) throw new LinkError('closed');
  if (party.form.status === 'EXPIRED' || !party.tokenExpiresAt || party.tokenExpiresAt <= clockNow()) throw new LinkError('expired');
  if (party.form.status !== 'AWAITING' && party.form.status !== 'PARTIAL') throw new LinkError('closed');
  return party;
}

export async function getSigningView(token: string) {
  const party = await partyForToken(token);
  const form = await loadForm(db(), party.formId);
  const creator = await db().user.findUniqueOrThrow({ where: { id: form.createdById } });
  const d = form.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const assets = form.assets.map((fa) => {
    const s = snapshotOf(fa);
    return {
      tag: s.tag,
      description: s.description,
      makeModel: s.makeModel,
      serial: s.serial,
      condition: fa.condition ? CONDITION_LABEL[fa.condition as Condition] : null,
      resultingStatus: fa.resultingStatus ? STATUS_LABEL[fa.resultingStatus as AssetStatus] : null,
    };
  });
  let movement: { from: string; to: string; reason: string; date: string } | null = null;
  if (form.type === 'MOVEMENT') {
    movement = {
      from: d.from?.holderName ? `${d.from.holderName} · ${d.from.location}` : String(d.from?.location ?? ''),
      to: String(d.toLabel ?? ''),
      reason: String(d.reason ?? ''),
      date: String(d.movementDate ?? ''),
    };
  }
  return {
    reference: form.reference,
    type: form.type,
    title: FORM_TITLE[form.type],
    sender: `${creator.name} (ECEWS IT Department)`,
    role: party.role,
    signer: { name: party.name, department: party.department, position: party.position },
    assets,
    movement,
    returnDate: form.type === 'RETURN' ? (d.returnDate ?? null) : null,
    terms: SIGNING_TERMS[form.type],
    confirmation: SIGNING_CONFIRMATION[party.role] ?? SIGNING_CONFIRMATION.RECIPIENT,
    expiresAt: party.tokenExpiresAt,
    itContact: itContact(),
  };
}

export const signBody = z.object({
  typedName: z.string().trim().min(2, 'Type your full name as your signature.').max(120),
  departmentRole: z.string().trim().min(2, 'Enter your department / role.').max(160),
  termsAccepted: z.array(z.literal(true, { errorMap: () => ({ message: 'Tick every term to continue.' }) })),
  confirmed: z.literal(true, { errorMap: () => ({ message: 'Tick the confirmation to sign.' }) }),
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function submitSignature(token: string, body: z.infer<typeof signBody>, meta: { ip: string; ua?: string }) {
  const party = await partyForToken(token);
  const terms = SIGNING_TERMS[party.form.type];
  if (body.termsAccepted.length !== terms.length) throw badRequest('Tick every term to continue.');
  if (norm(body.typedName) !== norm(party.name)) {
    throw badRequest(`Type your full name exactly as it appears on the form: ${party.name}.`, { fields: { typedName: `Type ${party.name}` } });
  }
  const mails = new MailQueue();
  const after: AfterCommit = { completedFormIds: [] };
  const signedAt = clockNow();
  await withTx(async (tx) => {
    // Lock the slot and re-check inside the transaction: a link can only ever be used once.
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; usedAt: Date | null; tokenHash: string | null; tokenExpiresAt: Date | null }>>(
      `SELECT id, "usedAt", "tokenHash", "tokenExpiresAt" FROM "Party" WHERE id = $1::uuid FOR UPDATE`,
      party.id,
    );
    const row = rows[0];
    if (!row || row.usedAt) throw new LinkError('used');
    if (!tokenMatches(token, row.tokenHash)) throw new LinkError('invalid');
    if (!row.tokenExpiresAt || row.tokenExpiresAt <= signedAt) throw new LinkError('expired');
    await tx.party.update({
      where: { id: party.id },
      data: {
        status: 'SIGNED',
        usedAt: signedAt,
        signedAt,
        typedName: body.typedName,
        signerDepartmentRole: body.departmentRole,
        ipAddress: meta.ip,
        userAgent: meta.ua?.slice(0, 300) ?? null,
      },
    });
    await audit({ action: 'form.signed', entityType: 'Form', entityId: party.formId, detail: { role: party.role, reference: party.form.reference }, ipAddress: meta.ip }, tx);
    await evaluateForm(tx, party.formId, mails, after);
  });
  await afterSigning(after, mails, { email: party.email, name: party.name, formId: party.formId, signedAt });
  const form = await db().form.findUniqueOrThrow({ where: { id: party.formId } });
  return { reference: form.reference, status: form.status };
}

/** After commit: store PDFs for completed forms, send the receipt (with PDF when complete). */
async function afterSigning(after: AfterCommit, mails: MailQueue, signer: { email: string | null; name: string; formId: string; signedAt: Date }) {
  await mails.flush();
  // The seed replays hundreds of signatures; it skips eager PDFs (they render on first download).
  if (process.env.ITAMS_SKIP_PDF_ON_SIGN === '1') return;
  for (const id of after.completedFormIds) {
    try {
      await formPdf(id, { regenerate: true });
    } catch (err) {
      // The PDF is regenerated on demand when downloaded; log so IT can see the failure.
      logger().error({ err: (err as Error).message, formId: id }, 'pdf generation failed after signing');
    }
  }
  if (!signer.email) return;
  const form = await db().form.findUniqueOrThrow({ where: { id: signer.formId } });
  const complete = form.status === 'SIGNED';
  let attachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined;
  if (complete) {
    try {
      attachments = [{ filename: pdfFileName(form.reference), content: await formPdf(form.id), contentType: 'application/pdf' }];
    } catch (err) {
      logger().error({ err: (err as Error).message }, 'receipt pdf failed');
    }
  }
  await trySendMail({
    to: signer.email,
    ...receiptEmail({ reference: form.reference, type: form.type, signerName: signer.name, signedAt: signer.signedAt, complete }),
    attachments,
  });
}

async function approvalForToken(token: string) {
  if (!looksLikeToken(token)) throw new LinkError('invalid');
  const approval = await db().approval.findUnique({ where: { tokenHash: hashToken(token) }, include: { form: true } });
  if (!approval || !tokenMatches(token, approval.tokenHash)) throw new LinkError('invalid');
  if (approval.status === 'APPROVED' || approval.status === 'REJECTED') throw new LinkError('used');
  if (approval.form.status === 'EXPIRED' || !approval.tokenExpiresAt || approval.tokenExpiresAt <= clockNow()) throw new LinkError('expired');
  if (approval.form.status !== 'PENDING_APPROVAL' || approval.status !== 'PENDING') throw new LinkError('closed');
  return approval;
}

export async function getApprovalView(token: string) {
  const approval = await approvalForToken(token);
  const form = await loadForm(db(), approval.formId);
  const creator = await db().user.findUniqueOrThrow({ where: { id: form.createdById } });
  const d = form.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    reference: form.reference,
    role: approval.role,
    approverName: approval.name,
    sender: `${creator.name} (ECEWS IT Department)`,
    from: d.from?.holderName ? `${d.from.holderName} · ${d.from.location}` : String(d.from?.location ?? ''),
    to: String(d.toLabel ?? ''),
    toType: d.to?.type ?? null,
    reason: String(d.reason ?? ''),
    responsibleOfficer: String(d.responsibleOfficer ?? ''),
    movementDate: d.movementDate ?? null,
    expectedReturn: d.expectedReturn ?? null,
    previous: form.approvals.filter((a) => a.order < approval.order).map((a) => ({ role: a.role, name: a.name ?? a.email, status: a.status, decidedAt: a.decidedAt })),
    assets: form.assets.map((fa) => {
      const s = snapshotOf(fa);
      return { tag: s.tag, description: s.description, makeModel: s.makeModel, serial: s.serial };
    }),
    expiresAt: approval.tokenExpiresAt,
    itContact: itContact(),
  };
}

export const approveBody = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), comment: z.string().trim().max(1000).optional() })
  .refine((b) => b.decision === 'APPROVE' || (b.comment && b.comment.length >= 5), {
    message: 'Give a reason for the rejection (at least 5 characters).',
    path: ['comment'],
  });

export async function submitApproval(token: string, body: z.infer<typeof approveBody>, meta: { ip: string; ua?: string }) {
  const approval = await approvalForToken(token);
  const mails = new MailQueue();
  const r = await withTx(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ status: string; tokenHash: string | null }>>(
      `SELECT status, "tokenHash" FROM "Approval" WHERE id = $1::uuid FOR UPDATE`,
      approval.id,
    );
    if (!rows[0] || rows[0].status !== 'PENDING') throw new LinkError('used');
    if (!tokenMatches(token, rows[0].tokenHash)) throw new LinkError('invalid');
    const res = await decideApproval(tx, approval.id, body.decision, body.comment, meta, mails);
    await audit({ action: `form.${body.decision === 'APPROVE' ? 'approved' : 'rejected'}`, entityType: 'Form', entityId: approval.formId, detail: { role: approval.role }, ipAddress: meta.ip }, tx);
    return res;
  });
  await mails.flush();
  return { reference: approval.form.reference, ...r };
}
