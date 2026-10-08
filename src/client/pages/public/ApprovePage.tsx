import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fmtDate, fmtDateTime } from '../../../shared/format';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field, TextArea } from '../../components/ui/Controls';
import { api, ApiError } from '../../lib/api';
import { Eyebrow, LinkProblem, PublicCard, PublicShell } from './PublicShell';

interface ApprovalView {
  reference: string;
  role: 'CTO' | 'ADMIN_OFFICER';
  approverName: string | null;
  sender: string;
  from: string;
  to: string;
  toType: 'STAFF' | 'LOCATION' | 'VENDOR' | null;
  reason: string;
  responsibleOfficer: string;
  movementDate: string | null;
  expectedReturn: string | null;
  previous: Array<{ role: string; name: string; status: string; decidedAt: string | null }>;
  assets: Array<{ tag: string; description: string; makeModel: string; serial: string | null }>;
  expiresAt: string;
  itContact: string;
}

/** Login-free approval page for the CTO and the Admin Officer (composed from the AB-11 layout). */
export function ApprovePage() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['approve', token], queryFn: () => api<ApprovalView>(`/public/approve/${token}`), retry: false, refetchOnWindowFocus: false });
  const [comment, setComment] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'REJECT') => api<{ formStatus: string }>(`/public/approve/${token}`, { body: { decision, comment: comment || undefined } }),
  });
  const v = q.data;
  const who = v?.role === 'CTO' ? 'CTO' : 'Admin Officer';

  if (q.isLoading)
    return (
      <PublicShell>
        <PublicCard>
          <div className="skeleton h-6 w-60" />
        </PublicCard>
      </PublicShell>
    );
  if (q.error) {
    const e = q.error instanceof ApiError ? q.error : null;
    return (
      <PublicShell>
        <LinkProblem state={e?.data.state as string | undefined} message={e?.status === 410 ? e.message : 'We could not open this link right now. Try again shortly.'} itContact={e?.data.itContact as string | undefined} />
      </PublicShell>
    );
  }
  if (!v) return null;
  if (decide.isSuccess) {
    const approved = decide.variables === 'APPROVE';
    return (
      <PublicShell>
        <PublicCard className="text-center">
          <span className={`mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full ${approved ? 'bg-green-100 text-brand' : 'bg-red-light text-red'}`} aria-hidden>
            {approved ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
          </span>
          <h1 className="text-lg font-bold text-gray-900">{approved ? 'Thank you - approval recorded' : 'Rejection recorded'}</h1>
          <p className="mx-auto mt-2 max-w-[440px] text-md text-gray-500">
            {approved
              ? v.role === 'CTO'
                ? 'The Admin Officer is asked to approve next. IT is notified.'
                : 'Signature emails now go to the people involved. IT is notified.'
              : 'The movement has ended as Rejected and IT has been notified with your reason.'}
          </p>
        </PublicCard>
      </PublicShell>
    );
  }
  const err = decide.error instanceof ApiError ? decide.error : null;
  return (
    <PublicShell>
      <PublicCard>
        <Eyebrow>Approval request · {who}</Eyebrow>
        <h1 className="mt-2 text-xl font-extrabold text-gray-900">Review &amp; approve - Movement (Form 3)</h1>
        <p className="mt-3 text-md leading-[1.6] text-gray-600">
          {v.sender} asks you, as {who}
          {v.approverName ? ` (${v.approverName})` : ''}, to approve this equipment movement. No account is needed.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ['Reference', v.reference],
            ['Movement date', fmtDate(v.movementDate)],
            ['From', v.from],
            ['To', v.to],
            ['Reason', v.reason],
            ['Responsible IT officer', v.responsibleOfficer],
            ...(v.expectedReturn ? [['Expected return', fmtDate(v.expectedReturn)]] : []),
          ].map(([k, val]) => (
            <div key={k} className="rounded-md border-2 border-gray-200 px-3 py-2.5">
              <dt className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{k}</dt>
              <dd className="mt-0.5 text-md font-semibold text-gray-900">{val}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-5 divide-y-2 divide-gray-100 rounded-md border-2 border-gray-200">
          {v.assets.map((a) => (
            <li key={a.tag} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-md">
              <span>
                <b>{a.makeModel}</b> · {a.description}
              </span>
              <span className="text-gray-500">
                {a.tag}
                {a.serial ? ` · SN ${a.serial}` : ''}
              </span>
            </li>
          ))}
        </ul>
        {v.previous.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {v.previous.map((p) => (
              <Badge key={p.role} tone="green">
                {p.role === 'CTO' ? 'CTO' : 'Admin Officer'} {p.name} approved {p.decidedAt ? fmtDateTime(p.decidedAt) : ''}
              </Badge>
            ))}
          </div>
        ) : null}
      </PublicCard>
      <PublicCard>
        <Eyebrow>Your decision</Eyebrow>
        <Field label="Comment" optional htmlFor="comment" hint="Required if you reject: tell IT why." className="mt-4">
          <TextArea id="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {err ? (
          <p role="alert" className="mt-3 rounded-sm bg-red-light px-3 py-2 text-sm font-medium text-red">
            {err.message}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="danger" size="lg" loading={decide.isPending && decide.variables === 'REJECT'} disabled={decide.isPending} onClick={() => decide.mutate('REJECT')}>
            Reject
          </Button>
          <Button size="lg" loading={decide.isPending && decide.variables === 'APPROVE'} disabled={decide.isPending} onClick={() => decide.mutate('APPROVE')}>
            Approve
          </Button>
        </div>
      </PublicCard>
      <div className="flex gap-2 rounded-md border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          This link is single-use and valid until <b className="text-gray-700">{fmtDate(v.expiresAt)}</b>. Questions? Contact IT at{' '}
          <a className="underline" href={`mailto:${v.itContact}`}>
            {v.itContact}
          </a>
          .
        </p>
      </div>
    </PublicShell>
  );
}
