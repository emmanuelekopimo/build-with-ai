// Email bodies. Wording mirrors the previews shown in the modals
// (Issuance confirmation, Re-send, Confirm return, Movement send, Forgot password).

import { FORM_DOC_NAME, type FormType } from '../../shared/constants';
import { fmtDate } from '../../shared/format';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

function layout(title: string, bodyHtml: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F9FAFB;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827">
<div style="height:8px;background:#096D49"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E5E7EB;border-radius:16px">
<tr><td style="padding:24px 28px">
<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#096D49;text-transform:uppercase;margin-bottom:8px">ECEWS-ITAMS</div>
<h1 style="font-size:18px;line-height:1.35;margin:0 0 10px;color:#111827">${esc(title)}</h1>
${bodyHtml}
</td></tr></table>
<p style="max-width:560px;font-size:12px;color:#6B7280;line-height:1.5;margin:16px auto 0">${footer}</p>
</td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:#096D49;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(label)}</a></p>`;

const p = (html: string) => `<p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 10px">${html}</p>`;

export interface AssetLine {
  tag: string;
  makeModel: string;
}

function assetPhrase(assets: AssetLine[]): { html: string; text: string } {
  if (assets.length === 1) {
    const a = assets[0]!;
    return { html: `<b>${esc(a.makeModel)}</b> (${esc(a.tag)})`, text: `${a.makeModel} (${a.tag})` };
  }
  const list = assets.map((a) => `${a.makeModel} (${a.tag})`);
  return { html: `<b>${assets.length} items</b>: ${esc(list.join(', '))}`, text: `${assets.length} items: ${list.join(', ')}` };
}

function linkFooter(itContact: string, expiresAt: Date): string {
  return `This link was sent to your email by the ECEWS IT Department. It is single-use and valid until <b>${fmtDate(expiresAt)}</b>. If you were not expecting this, contact IT immediately at ${esc(itContact)}.`;
}

export function signatureRequestEmail(o: {
  type: FormType;
  reference: string;
  link: string;
  assets: AssetLine[];
  expiresAt: Date;
  itContact: string;
  reminder?: boolean;
  role?: 'RECIPIENT' | 'RETURNER' | 'HANDOVER' | 'COUNTERPARTY';
  returnDate?: Date;
  from?: string;
  to?: string;
}): Rendered {
  const doc = FORM_DOC_NAME[o.type];
  const a = assetPhrase(o.assets);
  const isConfirm = o.type === 'RETURN' || o.type === 'MOVEMENT';
  const label = isConfirm ? 'Review & confirm' : 'Review & sign';
  const verb = isConfirm ? 'confirm' : 'sign';
  let subject: string;
  let lead: string;
  let leadText: string;
  if (o.reminder) {
    subject = `Reminder: please ${verb} ${o.reference} - ${doc}`;
    lead = `You're receiving a fresh <b>single-use link</b> to review and ${verb} the form for ${a.html}.`;
    leadText = `You're receiving a fresh single-use link to review and ${verb} the form for ${a.text}.`;
  } else if (o.type === 'RETURN') {
    subject = `Please confirm: ${o.reference} - ${doc}`;
    const n = o.assets.length;
    const when = o.returnDate ? fmtDate(o.returnDate) : fmtDate(new Date());
    lead = `From <b>ECEWS IT Department</b> · confirm the ${n} ${n === 1 ? 'item' : 'items'} below ${n === 1 ? 'was' : 'were'} received back by IT on <b>${when}</b>: ${a.html}.`;
    leadText = `From ECEWS IT Department · confirm the ${n} item(s) below were received back by IT on ${when}: ${a.text}.`;
  } else if (o.type === 'MOVEMENT') {
    subject = `Please confirm: ${o.reference} - ${doc}`;
    const route = o.from && o.to ? ` from <b>${esc(o.from)}</b> to <b>${esc(o.to)}</b>` : '';
    lead = `From <b>ECEWS IT Department</b> · confirm the transfer of ${a.html}${route}.`;
    leadText = `From ECEWS IT Department · confirm the transfer of ${a.text}${o.from && o.to ? ` from ${o.from} to ${o.to}` : ''}.`;
  } else {
    subject = `Please sign: ${o.reference} - ${doc}`;
    lead = `From <b>ECEWS IT Department</b> · you are asked to confirm receipt of: ${a.html}.`;
    leadText = `From ECEWS IT Department · you are asked to confirm receipt of: ${a.text}.`;
  }
  const noAccount = isConfirm
    ? `No account or login is needed - the link opens the ${o.type === 'RETURN' ? 'return form' : 'movement record'} for your typed ${o.type === 'RETURN' ? 'signature' : 'confirmation'}.`
    : 'No account or login is needed - the link below opens the form for your typed signature.';
  const html = layout(subject, p(lead) + p(noAccount) + button(o.link, label), linkFooter(o.itContact, o.expiresAt));
  const text = `${subject}\n\n${leadText}\n${noAccount}\n\n${label}: ${o.link}\n\nThis link is single-use and valid until ${fmtDate(o.expiresAt)}. If you were not expecting this, contact IT at ${o.itContact}.`;
  return { subject, html, text };
}

export function approvalRequestEmail(o: {
  reference: string;
  approverRole: 'CTO' | 'ADMIN_OFFICER';
  link: string;
  assets: AssetLine[];
  from: string;
  to: string;
  reason: string;
  requestedBy: string;
  expiresAt: Date;
  itContact: string;
}): Rendered {
  const who = o.approverRole === 'CTO' ? 'CTO' : 'Admin Officer';
  const a = assetPhrase(o.assets);
  const subject = `Approval needed: ${o.reference} - Equipment movement`;
  const body =
    p(`From <b>ECEWS IT Department</b> · ${esc(o.requestedBy)} requests your approval as <b>${who}</b> for the movement of ${a.html} from <b>${esc(o.from)}</b> to <b>${esc(o.to)}</b>.`) +
    p(`<b>Reason:</b> ${esc(o.reason)}`) +
    p('No account or login is needed - the link opens the movement so you can approve or reject it.') +
    button(o.link, 'Review & approve');
  const text = `${subject}\n\n${o.requestedBy} requests your approval as ${who} for the movement of ${a.text} from ${o.from} to ${o.to}.\nReason: ${o.reason}\n\nReview & approve: ${o.link}\n\nSingle-use link, valid until ${fmtDate(o.expiresAt)}.`;
  return { subject, html: layout(subject, body, linkFooter(o.itContact, o.expiresAt)), text };
}

export function receiptEmail(o: { reference: string; type: FormType; signerName: string; signedAt: Date; complete: boolean }): Rendered {
  const subject = `Signature received: ${o.reference} - ${FORM_DOC_NAME[o.type]}`;
  const tail = o.complete
    ? 'The signed copy is attached for your records.'
    : 'The document is waiting on another signer. You will not need to do anything else.';
  const body = p(`Thank you, ${esc(o.signerName)}. Your signature on <b>${esc(o.reference)}</b> was recorded on ${fmtDate(o.signedAt)}.`) + p(tail);
  return {
    subject,
    html: layout(subject, body, 'The signed copy goes straight back to the IT Department. No account was needed.'),
    text: `${subject}\n\nThank you, ${o.signerName}. Your signature on ${o.reference} was recorded on ${fmtDate(o.signedAt)}.\n${tail}`,
  };
}

export function emailCopyEmail(o: { reference: string; type: FormType; signedAt: Date | null }): Rendered {
  const subject = `Copy: ${o.reference} - ${FORM_DOC_NAME[o.type]}`;
  const body =
    p(`Attached is the PDF of <b>${esc(o.reference)}</b>${o.signedAt ? `, signed ${fmtDate(o.signedAt)}` : ''}.`) +
    p('The PDF is regenerated from the same record - screen, printout and email copy can never disagree.');
  return { subject, html: layout(subject, body, 'Sent by the ECEWS IT Department.'), text: `${subject}\n\nAttached is the PDF of ${o.reference}.` };
}

export function passwordResetEmail(o: { name: string; link: string }): Rendered {
  const subject = 'Reset your ITAMS password';
  const body =
    p(`Hello ${esc(o.name)}, we received a request to reset your ECEWS-ITAMS password.`) +
    button(o.link, 'Choose a new password') +
    p('The link is single-use and valid for 24 hours. If you did not ask for this, you can ignore this email.');
  return {
    subject,
    html: layout(subject, body, 'ITAMS accounts are IT-unit only.'),
    text: `${subject}\n\nReset link (single-use, 24 hours): ${o.link}`,
  };
}

export function itNoticeEmail(o: { subject: string; lines: string[]; link: string; label: string }): Rendered {
  const body = o.lines.map((l) => p(esc(l))).join('') + button(o.link, o.label);
  return { subject: o.subject, html: layout(o.subject, body, 'ECEWS-ITAMS notification.'), text: `${o.subject}\n\n${o.lines.join('\n')}\n\n${o.link}` };
}
