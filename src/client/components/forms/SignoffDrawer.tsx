import { useQuery } from '@tanstack/react-query';
import { Ban, Check, Clock, Download, FileText, PenLine, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FORM_STATUS_LABEL, PARTY_ROLE_LABEL } from '../../../shared/constants';
import { fmtDate, fmtDateTime, fmtDayMonth } from '../../../shared/format';
import { api, ApiError, download } from '../../lib/api';
import { categoryIcon } from '../../lib/icons';
import { errorMessage, queryClient } from '../../lib/query';
import { RESENDABLE, type FormDetail, type FormParty } from '../../lib/formTypes';
import { Badge, FormStatusBadge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ErrorState, InfoNote, ItemCard, KeyValueBox, Skeleton } from '../ui/Layout';
import { Drawer, Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { EmailPreview } from './Bits';

export function invalidateForms() {
  for (const k of ['signoffs', 'signoff-summary', 'form', 'nav-counts', 'registry', 'asset', 'assets', 'dashboard', 'notifications'])
    void queryClient.invalidateQueries({ queryKey: [k] });
}

function SignerCard({ p, formStatus }: { p: FormParty; formStatus: string }) {
  const signed = p.status === 'SIGNED';
  const label = p.needsSignature
    ? `${PARTY_ROLE_LABEL[p.role] ?? p.role} · ${signed ? 'Signed' : formStatus === 'PENDING_APPROVAL' ? 'After approval' : 'Awaiting'}`
    : PARTY_ROLE_LABEL[p.role];
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</div>
        <div className="truncate text-xl font-semibold text-brand">{p.name}</div>
        <div className="truncate text-sm text-gray-600">
          {p.needsSignature
            ? signed
              ? `Signed ${fmtDateTime(p.signedAt)} WAT`
              : `Not yet signed · link sent by email${p.linkExpiresAt ? ` · valid to ${fmtDayMonth(p.linkExpiresAt)}` : ''}`
            : `${p.position ?? 'IT'} · recorded as ${p.role === 'RECEIVER' ? 'receiver' : 'issuer'}`}
        </div>
      </div>
      {p.needsSignature ? (
        signed ? (
          <Badge tone="green" dot={false} icon={<Check className="h-3.5 w-3.5" />} size="sm">
            Signed
          </Badge>
        ) : (
          <Badge tone="green" dot={false} icon={<Clock className="h-3.5 w-3.5" />} size="sm" className="border border-brand/20">
            Pending
          </Badge>
        )
      ) : (
        <Badge tone="green" dot={false} icon={<Check className="h-3.5 w-3.5" />} size="sm">
          {signed ? 'Counter-signed' : 'On send'}
        </Badge>
      )}
    </div>
  );
}

export interface ResendTarget {
  id: string;
  reference: string;
  status: FormDetail['status'];
  sentAt: string | null;
  type: FormDetail['type'];
  recipientName: string;
  asset: { tag: string | null; makeModel: string; more: number };
}

const DOC_NAME: Record<string, string> = {
  ISSUANCE: 'Issuance & indemnity form',
  INDEMNITY: 'Issuance & indemnity form',
  RETURN: 'Return confirmation',
  MOVEMENT: 'Equipment movement',
};

/** Re-send signature request (Background+Shadow-4). */
export function ResendModal({ form, open, onOpenChange }: { form: ResendTarget; open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = form.status === 'PENDING_APPROVAL' ? 'awaiting approval' : FORM_STATUS_LABEL[form.status];
  const confirmKind = form.type === 'RETURN' || form.type === 'MOVEMENT';
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Re-send signature request?"
      subtitle={`${form.reference} · ${form.recipientName} · currently ${state}${form.sentAt ? ` (sent ${fmtDayMonth(form.sentAt)} ${fmtDateTime(form.sentAt).split(' · ')[1]})` : ''}`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            icon={<Send className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ reference: string; emailWarning: string | null; linksSent: number }>(`/forms/${form.id}/resend`, { body: {} });
                toast.success(`${r.reference}: fresh link${r.linksSent === 1 ? '' : 's'} sent · deadline extended by 7 days`);
                if (r.emailWarning) toast.error(r.emailWarning);
                invalidateForms();
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Re-send link
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-md font-medium text-gray-700">Email preview</div>
        <EmailPreview
          subject={form.status === 'PENDING_APPROVAL' ? `Approval needed: ${form.reference} - Equipment movement` : `Reminder: please ${confirmKind ? 'confirm' : 'sign'} ${form.reference} - ${DOC_NAME[form.type]}`}
          button={form.status === 'PENDING_APPROVAL' ? 'Review & approve' : confirmKind ? 'Review & confirm' : 'Review & sign'}
        >
          <p>
            You&apos;re receiving a fresh <b className="text-gray-800">single-use link</b> to review and {form.status === 'PENDING_APPROVAL' ? 'approve' : 'sign'} the form for{' '}
            <b className="text-gray-800">{form.asset.makeModel}</b> ({form.asset.tag}
            {form.asset.more ? ` +${form.asset.more}` : ''}).
          </p>
        </EmailPreview>
        <InfoNote icon={Send}>Re-send issues a new single-use link and extends the deadline by 7 days. Reminder is auto-sent after 48h.</InfoNote>
      </div>
    </Modal>
  );
}

export function SignoffDrawer({ formId, open, onOpenChange }: { formId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [resend, setResend] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['form', formId], queryFn: () => api<FormDetail>(`/forms/${formId}`), enabled: !!formId && open });
  const f = q.data;
  const first = f?.assets[0];

  const viewPdf = async () => {
    if (!f) return;
    try {
      await download(`/forms/${f.id}/pdf`, `ECEWS-ITAMS-${f.reference}.pdf`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open the PDF.');
    }
  };

  let footer = null;
  if (f) {
    if (f.status === 'DRAFT') {
      footer = (
        <>
          <Button variant="outline" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setCancel(true)}>
            Discard draft
          </Button>
          <Button size="lg" icon={<PenLine className="h-4 w-4" />} onClick={() => navigate(`/forms/${f.id}/edit?from=/signoffs`)}>
            Resume draft
          </Button>
        </>
      );
    } else if (f.status === 'SIGNED') {
      footer = (
        <>
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void viewPdf()}>
            PDF
          </Button>
          <Button size="lg" icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/documents/${f.reference}`)}>
            View document
          </Button>
        </>
      );
    } else if (RESENDABLE.includes(f.status)) {
      footer = (
        <>
          <Button variant="ghost" size="sm" className="mr-auto text-red hover:bg-red-light hover:text-red" icon={<Ban className="h-4 w-4" />} onClick={() => setCancel(true)}>
            Cancel form
          </Button>
          <Button variant="outline" size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/documents/${f.reference}`)}>
            View PDF
          </Button>
          <Button size="lg" icon={<Send className="h-4 w-4" />} onClick={() => setResend(true)}>
            {f.status === 'PARTIAL' ? 'Remind' : 'Resend reminder'}
          </Button>
        </>
      );
    } else {
      footer = (
        <Button variant="outline" size="sm" icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/documents/${f.reference}`)}>
          View document
        </Button>
      );
    }
  }

  const doCancel = async () => {
    if (!f) return;
    setBusy(true);
    try {
      if (f.status === 'DRAFT') await api(`/forms/${f.id}`, { method: 'DELETE', body: {} });
      else await api(`/forms/${f.id}/cancel`, { body: {} });
      toast.info(f.status === 'DRAFT' ? `Draft ${f.reference} discarded` : `${f.reference} cancelled · links revoked`);
      invalidateForms();
      setCancel(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={f ? `Sign-off · ${f.reference}` : 'Sign-off'}
        subtitle={f ? `${f.title.replace(/ \(Form \d\)/, '')} - ${first?.makeModel ?? ''}${f.assets.length > 1 ? ` +${f.assets.length - 1}` : ''}` : undefined}
        footer={footer}
      >
        {q.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : q.error ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : f ? (
          <div className="space-y-5">
            <KeyValueBox
              rows={[
                ['Recipient', `${f.recipient.name}${f.recipient.sub ? ` · ${f.recipient.sub}` : ''}`],
                ['Sent', f.sentAt ? `${fmtDateTime(f.sentAt)}${f.deadline && f.status !== 'SIGNED' ? ` · link valid to ${fmtDayMonth(f.deadline)}` : ''}` : 'Not sent (draft)'],
                ['Status', <FormStatusBadge key="s" status={f.status} label={f.status === 'AWAITING' ? 'Awaiting signature' : undefined} />],
                ...(f.completedAt && f.status === 'SIGNED' ? ([['Completed', fmtDateTime(f.completedAt)]] as Array<[string, string]>) : []),
                ...(f.rejectedReason ? ([['Reason', f.rejectedReason]] as Array<[string, string]>) : []),
              ]}
            />
            {f.approvals.length ? (
              <div>
                <h3 className="mb-2 text-md font-medium text-gray-700">Approvals</h3>
                <div className="space-y-2">
                  {f.approvals.map((a) => (
                    <div key={a.role} className="flex items-center justify-between rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3">
                      <div>
                        <div className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{a.role === 'CTO' ? 'CTO' : 'Admin Officer'}</div>
                        <div className="text-md font-semibold text-gray-900">{a.name ?? a.email}</div>
                        <div className="text-sm text-gray-500">{a.decidedAt ? fmtDateTime(a.decidedAt) : a.status === 'PENDING' ? `Link sent ${a.sentAt ? fmtDayMonth(a.sentAt) : ''}` : 'Waits for the CTO'}</div>
                        {a.comment ? <div className="text-sm text-red">“{a.comment}”</div> : null}
                      </div>
                      {a.status === 'APPROVED' ? (
                        <Badge tone="green">Approved</Badge>
                      ) : a.status === 'REJECTED' ? (
                        <Badge tone="red">Rejected</Badge>
                      ) : a.status === 'PENDING' ? (
                        <Badge tone="amber">Pending</Badge>
                      ) : (
                        <Badge tone="gray">Waiting</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-md font-medium text-gray-700">Signers</h3>
              <div className="space-y-3">
                {f.parties.length === 0 ? <p className="text-md text-gray-500">Signer slots are created when the form is sent.</p> : null}
                {f.parties.map((p) => (
                  <SignerCard key={p.id} p={p} formStatus={f.status} />
                ))}
                {f.children.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/signoffs?ref=${c.reference}`)}
                    className="flex w-full items-center justify-between rounded-md border-2 border-dashed border-gray-300 px-4 py-3 text-left text-md hover:bg-gray-50"
                  >
                    <span>
                      New issuance indemnity <b>{c.reference}</b>
                    </span>
                    <FormStatusBadge status={c.status} />
                  </button>
                ))}
                {f.parent ? (
                  <p className="text-sm text-gray-500">
                    Generated by movement <b>{f.parent.reference}</b> ({FORM_STATUS_LABEL[f.parent.status].toLowerCase()}).
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-md font-medium text-gray-700">Document</h3>
              <div className="space-y-3">
                {f.assets.map((a) => (
                  <ItemCard
                    key={a.tag}
                    icon={categoryIcon(a.icon)}
                    title={a.makeModel}
                    sub={`SN ${a.serial ?? '-'} · tag ${a.tag}`}
                    right={a.deleted ? <Badge tone="gray">Deleted</Badge> : <StatusBadge status={a.currentStatus} inRepair={a.inRepair} />}
                  />
                ))}
              </div>
            </div>
            {RESENDABLE.includes(f.status) ? (
              <InfoNote icon={ShieldCheck}>Resend sends a fresh single-use link and extends the deadline by 7 days.</InfoNote>
            ) : f.status === 'EXPIRED' ? null : null}
            {f.status === 'SIGNED' && f.expectedReturn ? <p className="text-sm text-gray-500">Expected return {fmtDate(f.expectedReturn)}.</p> : null}
          </div>
        ) : null}
      </Drawer>
      {f && RESENDABLE.includes(f.status) ? (
        <ResendModal
          form={{ id: f.id, reference: f.reference, status: f.status, sentAt: f.sentAt, type: f.type, recipientName: f.recipient.name, asset: { tag: first?.tag ?? null, makeModel: first?.makeModel ?? '', more: Math.max(0, f.assets.length - 1) } }}
          open={resend}
          onOpenChange={setResend}
        />
      ) : null}
      {f ? (
        <Modal
          open={cancel}
          onOpenChange={setCancel}
          title={f.status === 'DRAFT' ? 'Discard this draft?' : `Cancel ${f.reference}?`}
          subtitle={`${f.reference} · ${f.recipient.name}`}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setCancel(false)}>
                Keep it
              </Button>
              <Button variant="danger" size="lg" loading={busy} icon={f.status === 'DRAFT' ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />} onClick={() => void doCancel()}>
                {f.status === 'DRAFT' ? 'Discard draft' : 'Cancel form'}
              </Button>
            </>
          }
        >
          <InfoNote icon={Ban}>
            {f.status === 'DRAFT'
              ? 'Discarding removes this draft. Nothing was sent, so no asset is affected.'
              : `All signature and approval links for ${f.reference}${f.children.length ? ` and ${f.children.map((c) => c.reference).join(', ')}` : ''} stop working and the assets are released. Asset statuses do not change. The record is kept as Cancelled.`}
          </InfoNote>
        </Modal>
      ) : null}
    </>
  );
}
