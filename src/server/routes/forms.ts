import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../lib/http';
import { currentUser, requirePermission } from '../middleware/auth';
import { formPdf, pdfFileName, renderFormHtml, loadFormForDocument } from '../pdf/documents';
import { audit } from '../services/audit';
import { createForm, discardDraft, parseFormWrite, sendForm, updateDraft } from '../services/forms/lifecycle';
import { bulkRemind, cancelForm, emailCopy, emailCopyBody, remindBody, resendForm } from '../services/forms/manage';
import { getFormDetail, listRegistry, listSignoffs, registryQuery, signoffQuery, signoffSummary } from '../services/forms/views';

export const formsRouter = Router();
const idParam = z.object({ id: z.string().uuid('Invalid form id.') });
const idem = z.string().uuid('Idempotency-Key must be a UUID.').optional();

formsRouter.get('/signoffs', requirePermission('signoff.view'), ah(async (req, res) => res.json(await listSignoffs(parse(signoffQuery, req.query)))));
formsRouter.get('/signoffs/summary', requirePermission('signoff.view'), ah(async (_req, res) => res.json(await signoffSummary())));

formsRouter.get(
  '/registries/:kind',
  requirePermission('form.manage'),
  ah(async (req, res) => {
    const { kind } = parse(z.object({ kind: z.enum(['issuance', 'return', 'movement']) }), req.params);
    res.json(await listRegistry(kind, parse(registryQuery, req.query)));
  }),
);

formsRouter.post(
  '/forms',
  requirePermission('form.manage'),
  ah(async (req, res) => {
    const key = parse(idem, req.header('Idempotency-Key') ?? undefined);
    const r = await createForm(parseFormWrite(req.body), currentUser(req), key);
    res.status(201).json(r);
  }),
);

formsRouter.post(
  '/forms/remind',
  requirePermission('form.manage'),
  ah(async (req, res) => res.json(await bulkRemind(parse(remindBody, req.body).formIds, currentUser(req)))),
);

formsRouter.get(
  '/forms/by-ref/:reference',
  requirePermission('signoff.view'),
  ah(async (req, res) => {
    const { reference } = parse(z.object({ reference: z.string().regex(/^(ISS|RTR|MVT|IND)-\d{4,}$/, 'Invalid reference.') }), req.params);
    res.json(await getFormDetail({ reference }));
  }),
);

formsRouter.get('/forms/:id', requirePermission('signoff.view'), ah(async (req, res) => res.json(await getFormDetail({ id: parse(idParam, req.params).id }))));

formsRouter.patch(
  '/forms/:id',
  requirePermission('form.manage'),
  ah(async (req, res) => res.json(await updateDraft(parse(idParam, req.params).id, parseFormWrite(req.body), currentUser(req)))),
);

formsRouter.delete(
  '/forms/:id',
  requirePermission('form.manage'),
  ah(async (req, res) => {
    await discardDraft(parse(idParam, req.params).id, currentUser(req));
    res.json({ ok: true });
  }),
);

formsRouter.post('/forms/:id/send', requirePermission('form.manage'), ah(async (req, res) => res.json(await sendForm(parse(idParam, req.params).id, currentUser(req)))));
formsRouter.post('/forms/:id/resend', requirePermission('form.manage'), ah(async (req, res) => res.json(await resendForm(parse(idParam, req.params).id, currentUser(req)))));
formsRouter.post('/forms/:id/cancel', requirePermission('form.manage'), ah(async (req, res) => res.json(await cancelForm(parse(idParam, req.params).id, currentUser(req)))));
formsRouter.post(
  '/forms/:id/email-copy',
  requirePermission('form.manage'),
  ah(async (req, res) => res.json(await emailCopy(parse(idParam, req.params).id, parse(emailCopyBody, req.body), currentUser(req)))),
);

formsRouter.get(
  '/forms/:id/document',
  requirePermission('signoff.view'),
  ah(async (req, res) => {
    const form = await loadFormForDocument({ id: parse(idParam, req.params).id });
    res.json({ html: renderFormHtml(form, { generatedAt: form.completedAt ?? new Date() }) });
  }),
);

formsRouter.get(
  '/forms/:id/pdf',
  requirePermission('signoff.view'),
  ah(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const form = await loadFormForDocument({ id });
    const pdf = await formPdf(id);
    await audit({ userId: currentUser(req).id, action: 'form.pdf_download', entityType: 'Form', entityId: id });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${pdfFileName(form.reference)}"`);
    res.send(pdf);
  }),
);
