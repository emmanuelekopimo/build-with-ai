// Signed-document rendering (AB-12). One HTML template feeds the on-screen preview, the PDF and the
// emailed copy, so screen, printout and email can never disagree.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import bwipjs from 'bwip-js/node';
import {
  CONDITION_LABEL,
  ISSUANCE_TERMS,
  STATUS_LABEL,
  TERMS_INTRO,
  type AssetStatus,
  type Condition,
  type FormType,
} from '../../shared/constants';
import { fmtDate, fmtDateTime } from '../../shared/format';
import { db } from '../db';
import { esc } from '../email/templates';
import { notFound } from '../lib/errors';
import { formInclude, snapshotOf, type FormWithAll } from '../services/forms/core';
import { htmlToPdf } from './browser';
import { now as clockNow } from '../lib/clock';

const require = createRequire(import.meta.url);

let assetsCache: { logo: string; fonts: string } | null = null;
function staticAssets() {
  if (!assetsCache) {
    const logo = readFileSync(path.resolve('public/logo.png')).toString('base64');
    const font = (w: number) => {
      const file = require.resolve(`@fontsource/inter/files/inter-latin-${w}-normal.woff2`);
      return `@font-face{font-family:Inter;font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');}`;
    };
    assetsCache = { logo: `data:image/png;base64,${logo}`, fonts: [400, 500, 600, 700, 800].map(font).join('') };
  }
  return assetsCache;
}

export function barcodeSvg(text: string, height = 10): string {
  return bwipjs.toSVG({ bcid: 'code128', text, height, includetext: false, scale: 1 });
}

const TITLE: Record<FormType, string> = {
  ISSUANCE: 'LAPTOP &amp; OTHER IT EQUIPMENT ISSUANCE - INDEMNITY FORM',
  INDEMNITY: 'LAPTOP &amp; OTHER IT EQUIPMENT ISSUANCE - INDEMNITY FORM',
  RETURN: 'IT EQUIPMENT RETURN - ACKNOWLEDGEMENT FORM',
  MOVEMENT: 'IT EQUIPMENT MOVEMENT - TRANSFER RECORD',
};
const FOOTER: Record<FormType, string> = {
  ISSUANCE: 'Form 2 · Indemnity · v1.0',
  INDEMNITY: 'Form 2 · Indemnity · v1.0',
  RETURN: 'Form 4 · Return · v1.0',
  MOVEMENT: 'Form 3 · Movement · v1.0',
};

const css = `
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#111827;font-size:12px;background:#fff}
.page{width:794px;min-height:1123px;padding:56px 56px 40px;display:flex;flex-direction:column}
.head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #096D49}
.head img{height:44px}.sub{font-size:10px;color:#6B7280;margin-top:3px}
.ref{text-align:right}.ref b{display:block;font-size:19px;font-weight:700}.ref span{font-size:12px;color:#4B5563}
h1{font-size:16px;font-weight:700;text-align:center;letter-spacing:.02em;margin:26px 0 22px}
.grid{display:grid;gap:18px 24px;margin-bottom:18px}.g3{grid-template-columns:1fr 1fr 1fr}.g2{grid-template-columns:1.6fr 1fr}
.f label{display:block;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#4B5563;text-transform:uppercase;margin-bottom:3px}
.f div{font-size:12px;padding-bottom:5px;border-bottom:1.5px solid #E5E7EB;min-height:20px}
table{width:100%;border-collapse:separate;border-spacing:0;border:1.5px solid #E5E7EB;margin:6px 0 20px}
th{background:#F9FAFB;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#4B5563;text-align:left;padding:8px 10px;border-bottom:1.5px solid #E5E7EB;border-right:1.5px solid #E5E7EB}
td{font-size:11.5px;padding:8px 10px;border-bottom:1.5px solid #E5E7EB;border-right:1.5px solid #E5E7EB}
tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}
.label{font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#4B5563;text-transform:uppercase;margin:6px 0 4px}
.terms{font-size:11.5px;line-height:1.6}.terms p{margin:0}.terms .intro{margin-bottom:12px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:26px}
.sig .name{font-size:13px;font-weight:600;color:#096D49;padding-bottom:6px;border-bottom:1.5px solid #D1D5DB;margin-top:16px;min-height:26px}
.sig .name.pending{color:#9CA3AF;font-weight:500}
.sig .meta{font-size:9.5px;color:#9CA3AF;margin-top:5px}
.kv{font-size:11.5px;line-height:1.7}
.badge{display:inline-block;border-radius:99px;padding:1px 8px;font-size:10px;font-weight:600}
.b-green{background:#E8F5E9;color:#096D49}.b-red{background:#FEF2F2;color:#DC2626}.b-blue{background:#EFF6FF;color:#2563EB}
.watermark{margin:14px 0 0;padding:8px 12px;border:1.5px dashed #D97706;border-radius:8px;color:#92400E;background:#FFFBEB;font-size:11px}
.spacer{flex:1}
.foot{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;border-top:1.5px solid #E5E7EB;padding-top:12px;margin-top:30px;font-size:9.5px;color:#9CA3AF}
.foot .bc{text-align:center}.foot .bc img{height:34px;display:block;margin:0 auto 4px}.foot .bc span{letter-spacing:.12em;color:#6B7280}
.foot .r{text-align:right}
`;

interface PartyView {
  role: string;
  name: string;
  signedAt: Date | null;
  status: string;
  position: string | null;
}

function sigBlock(title: string, p: PartyView | undefined, kind: 'signer' | 'it'): string {
  if (!p) return '';
  const signed = p.status === 'SIGNED' && p.signedAt;
  const meta =
    kind === 'signer'
      ? signed
        ? `E-signature · terms agreed · ${fmtDateTime(p.signedAt)}`
        : 'Awaiting e-signature'
      : `${esc(p.position ?? 'ECEWS IT')} · ${signed ? `counter-signed ${fmtDate(p.signedAt)}` : 'recorded on send'}`;
  return `<div class="sig"><div class="label">${title}</div><div class="name${signed || kind === 'it' ? '' : ' pending'}">${esc(signed || kind === 'it' ? p.name : p.name)}</div><div class="meta">${meta}</div></div>`;
}

function statusBadge(s: AssetStatus | null | undefined): string {
  if (!s) return '';
  const cls = s === 'IN_STORE' ? 'b-green' : s === 'DAMAGED' ? 'b-red' : 'b-blue';
  return `<span class="badge ${cls}">${STATUS_LABEL[s]}</span>`;
}

export function renderFormHtml(form: FormWithAll, opts: { generatedAt?: Date } = {}): string {
  const { logo, fonts } = staticAssets();
  const d = form.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const type = form.type;
  const snaps = form.assets.map((fa) => ({ ...snapshotOf(fa), condition: fa.condition as Condition | null, resulting: fa.resultingStatus as AssetStatus | null }));
  const firstTag = snaps[0]?.tag ?? '';
  const generated = opts.generatedAt ?? clockNow();
  const signer = form.parties.find((p) => p.needsSignature);
  const it = form.parties.find((p) => !p.needsSignature);
  const field = (label: string, value?: string | null) => `<div class="f"><label>${label}</label><div>${esc(value ?? '')}</div></div>`;

  let people = '';
  let tableHead = '<th style="width:48px">QTY</th><th>ASSET DESCRIPTION</th><th>SERIAL NUMBER</th><th>MAKE / MODEL</th><th>ASSET TAG</th>';
  let rows = snaps.map((s) => `<tr><td>1</td><td>${esc(s.description)}</td><td>${esc(s.serial ?? '-')}</td><td>${esc(s.makeModel)}</td><td>${esc(s.tag)}</td></tr>`).join('');
  let body = '';
  let sigs = '';

  if (type === 'ISSUANCE' || type === 'INDEMNITY') {
    const r = d.recipient ?? {};
    people = `<div class="grid g3">${field('Full name', r.name)}${field('Staff / position', r.position ?? r.staffId)}${field('Department', r.department)}</div>
      <div class="grid g2">${field('Email', r.email)}${field('Phone', r.phone ?? '-')}</div>`;
    const intro =
      type === 'INDEMNITY'
        ? `<p class="intro">Generated by movement <b>${esc(String(d.parentReference ?? ''))}</b>: the receiving staff member takes custody under the same terms.</p>`
        : '';
    body = `<div class="label">Terms &amp; conditions</div><div class="terms">${intro}<p class="intro">${esc(TERMS_INTRO)}</p>${ISSUANCE_TERMS.map((t) => `<p><b>${esc(t.title)}:</b> ${esc(t.text)}</p>`).join('')}</div>`;
    sigs = `<div class="sigs">${sigBlock("Receiver's acknowledgment", signer, 'signer')}${sigBlock('Issued by - IT Department', it, 'it')}</div>`;
  } else if (type === 'RETURN') {
    const r = d.returner ?? {};
    const vendor = d.returnerType === 'VENDOR';
    people = `<div class="grid g3">${field(vendor ? 'Vendor contact' : 'Full name', r.name)}${field(vendor ? 'Company' : 'Staff ID', vendor ? r.company : r.staffId)}${field(vendor ? 'Phone' : 'Department', vendor ? (r.phone ?? '-') : r.department)}</div>
      <div class="grid g2">${field('Email', r.email)}${field('Return date', fmtDate(d.returnDate))}</div>`;
    tableHead = '<th style="width:48px">QTY</th><th>ASSET DESCRIPTION</th><th>SERIAL NUMBER</th><th>ASSET TAG</th><th>CONDITION</th><th>RESULTING STATUS</th>';
    rows = snaps
      .map((s) => `<tr><td>1</td><td>${esc(s.description)} · ${esc(s.makeModel)}</td><td>${esc(s.serial ?? '-')}</td><td>${esc(s.tag)}</td><td>${s.condition ? CONDITION_LABEL[s.condition] : '-'}</td><td>${statusBadge(s.resulting)}</td></tr>`)
      .join('');
    body = `<div class="label">Condition notes</div><div class="terms"><p>${esc(d.conditionNotes || 'None recorded.')}</p><p style="margin-top:10px">Items in Good or Fair condition return to In Store. Items in Poor or Damaged condition are recorded as Damaged${vendor ? ' and the repair is closed' : ''}.</p></div>`;
    sigs = `<div class="sigs">${sigBlock(vendor ? 'Returned by - vendor' : 'Returned by', signer, 'signer')}${sigBlock('Received by - IT Department', it, 'it')}</div>`;
  } else {
    const to = d.to ?? {};
    const from = d.from ?? {};
    const toWho = to.type === 'STAFF' ? `${to.person?.name} · ${to.person?.department}` : to.type === 'VENDOR' ? `${to.vendor?.company} (${to.vendor?.name})` : to.contact?.name;
    const toLoc = to.type === 'VENDOR' ? to.vendor?.company : to.location;
    people = `<div class="grid g2">${field('From - current holder', from.holderName ? `${from.holderName}${from.holderDepartment ? ` · ${from.holderDepartment}` : ''}` : 'IT Store')}${field('To', toWho)}</div>
      <div class="grid g3">${field('From location', from.location)}${field('To location', toLoc)}${field('Movement date', fmtDate(d.movementDate))}</div>
      <div class="grid g2">${field('Reason for transfer', d.reason)}${field('Responsible IT officer', d.responsibleOfficer)}</div>
      ${d.expectedReturn ? `<div class="grid g2">${field('Expected return', fmtDate(d.expectedReturn))}${field('Temporary', d.temporary ? 'Yes' : 'No')}</div>` : ''}`;
    const approvals = form.approvals
      .map((a) => `<p><b>${a.role === 'CTO' ? 'CTO' : 'Admin Officer'}:</b> ${esc(a.name ?? a.email)} · ${a.status === 'APPROVED' ? `approved ${fmtDateTime(a.decidedAt)}` : a.status === 'REJECTED' ? `rejected ${fmtDateTime(a.decidedAt)}${a.comment ? ` — ${esc(a.comment)}` : ''}` : 'pending'}</p>`)
      .join('');
    const child = form.childForms[0];
    body = `<div class="label">Approvals</div><div class="terms kv">${approvals}${child ? `<p style="margin-top:8px">New issuance indemnity <b>${esc(child.reference)}</b> generated for the receiving staff member.</p>` : ''}</div>`;
    const signerBlocks = form.parties
      .filter((p) => p.needsSignature)
      .map((p) => sigBlock(p.role === 'HANDOVER' ? 'Handed over by' : 'Received by', p, 'signer'))
      .join('');
    sigs = `<div class="sigs">${signerBlocks}${sigBlock('Recorded by - IT Department', it, 'it')}</div>`;
  }

  const pending =
    form.status !== 'SIGNED'
      ? `<div class="watermark">Status: ${esc(form.status === 'PENDING_APPROVAL' ? 'Awaiting approval' : form.status.charAt(0) + form.status.slice(1).toLowerCase())} — this copy is not yet fully signed.</div>`
      : '';
  const bc = `data:image/svg+xml;base64,${Buffer.from(barcodeSvg(`${form.reference} ${firstTag}`.trim())).toString('base64')}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(form.reference)}</title><style>${fonts}${css}</style></head><body><div class="page">
  <div class="head"><div><img src="${logo}" alt="ECEWS-ITAMS"><div class="sub">Excellence Community Education Welfare Scheme · IT Asset Management</div></div>
  <div class="ref"><b>${esc(form.reference)}</b><span>Generated ${fmtDateTime(generated)}</span></div></div>
  <h1>${TITLE[type]}</h1>${pending}
  ${people}
  <table><thead><tr>${tableHead}</tr></thead><tbody>${rows}</tbody></table>
  ${body}
  ${sigs}
  <div class="spacer"></div>
  <div class="foot"><div>ECEWS ITAMS · ${FOOTER[type]}</div><div class="bc"><img src="${bc}" alt=""><span>${esc(form.reference)}${firstTag ? ` · ${esc(firstTag)}` : ''}</span></div><div class="r">Page 1 of 1</div></div>
  </div></body></html>`;
}

export async function loadFormForDocument(idOrRef: { id?: string; reference?: string }): Promise<FormWithAll> {
  const form = await db().form.findFirst({
    where: idOrRef.id ? { id: idOrRef.id } : { reference: idOrRef.reference },
    include: formInclude,
  });
  if (!form) throw notFound('Document not found.');
  return form as FormWithAll;
}

/** PDF bytes for a form: stored copy for signed forms, freshly rendered otherwise (or when `regenerate`). */
export async function formPdf(formId: string, opts: { regenerate?: boolean } = {}): Promise<Buffer> {
  const form = await loadFormForDocument({ id: formId });
  if (form.status === 'SIGNED' && !opts.regenerate) {
    const stored = await db().formDocument.findUnique({ where: { formId } });
    if (stored) return Buffer.from(stored.pdf);
  }
  const generatedAt = form.status === 'SIGNED' ? (form.completedAt ?? clockNow()) : clockNow();
  const pdf = await htmlToPdf(renderFormHtml(form, { generatedAt }));
  if (form.status === 'SIGNED') {
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    await db().formDocument.upsert({ where: { formId }, update: { pdf, sha256, generatedAt: clockNow() }, create: { formId, pdf, sha256 } });
  }
  return pdf;
}

export function pdfFileName(reference: string): string {
  return `ECEWS-ITAMS-${reference.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}
