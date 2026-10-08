import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fmtDate } from '../../../shared/format';
import { Button } from '../../components/ui/Button';
import { CheckBox, Field, TextInput } from '../../components/ui/Controls';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Eyebrow, LinkProblem, PublicCard, PublicShell } from './PublicShell';

interface SignView {
  reference: string;
  type: 'ISSUANCE' | 'RETURN' | 'MOVEMENT' | 'INDEMNITY';
  title: string;
  sender: string;
  role: string;
  signer: { name: string; department: string | null; position: string | null };
  assets: Array<{ tag: string; description: string; makeModel: string; serial: string | null; condition: string | null; resultingStatus: string | null }>;
  movement: { from: string; to: string; reason: string; date: string } | null;
  returnDate: string | null;
  terms: Array<{ title: string; text: string }>;
  confirmation: string;
  expiresAt: string;
  itContact: string;
}

const INTRO: Record<string, (v: SignView) => string> = {
  RECIPIENT: (v) => `${v.sender} has sent you this form to confirm that you have received the equipment below in good condition. Typing your full name acts as your e-signature.`,
  RETURNER: (v) => `${v.sender} has recorded the return of the equipment below${v.returnDate ? ` on ${fmtDate(v.returnDate)}` : ''}. Please confirm the return and the condition IT recorded. Typing your full name acts as your e-signature.`,
  HANDOVER: (v) => `${v.sender} has recorded the transfer of the equipment below out of your custody. Please confirm the handover. Typing your full name acts as your e-signature.`,
  COUNTERPARTY: (v) => `${v.sender} has recorded the transfer of the equipment below to you. Please confirm you have received it. Typing your full name acts as your e-signature.`,
};

export function SignPage() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['sign', token], queryFn: () => api<SignView>(`/public/sign/${token}`), retry: false, refetchOnWindowFocus: false });
  const [typed, setTyped] = useState('');
  const [deptRole, setDeptRole] = useState<string | null>(null);
  const [terms, setTerms] = useState<boolean[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      api<{ reference: string; status: string }>(`/public/sign/${token}`, {
        body: { typedName: typed, departmentRole: deptRole ?? defaultDept, termsAccepted: v!.terms.map((_, i) => terms[i] === true), confirmed },
      }),
  });
  const v = q.data;
  const defaultDept = v ? [v.signer.department, v.signer.position].filter(Boolean).join(' · ') : '';

  if (q.isLoading) {
    return (
      <PublicShell>
        <PublicCard>
          <div className="skeleton h-6 w-60" />
          <div className="skeleton mt-3 h-4 w-full" />
        </PublicCard>
      </PublicShell>
    );
  }
  if (q.error) {
    const e = q.error instanceof ApiError ? q.error : null;
    return (
      <PublicShell>
        <LinkProblem state={e?.data.state as string | undefined} message={e?.status === 410 ? e.message : 'We could not open this link right now. Check your connection and try again.'} itContact={e?.data.itContact as string | undefined} />
      </PublicShell>
    );
  }
  if (!v) return null;

  if (submit.isSuccess) {
    return (
      <PublicShell>
        <PublicCard className="text-center">
          <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-brand" aria-hidden>
            <Check className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">Thank you - signature recorded</h1>
          <p className="mx-auto mt-2 max-w-[420px] text-md text-gray-500">
            The signed copy goes straight back to the IT Department and a receipt email is sent to you. No account was needed.
          </p>
        </PublicCard>
      </PublicShell>
    );
  }

  const allTerms = v.terms.every((_, i) => terms[i]);
  const ready = allTerms && confirmed && typed.trim().length >= 2;
  const err = submit.error instanceof ApiError ? submit.error : null;
  const forLabel = `${v.signer.name}${v.signer.department ? ` · ${v.signer.department}` : ''}`;

  return (
    <PublicShell>
      <PublicCard>
        <Eyebrow>Signature request</Eyebrow>
        <h1 className="mt-2 text-xl font-extrabold text-gray-900">Review &amp; sign - {v.title}</h1>
        <p className="mt-3 text-md leading-[1.6] text-gray-600">{(INTRO[v.role] ?? INTRO.RECIPIENT!)(v)}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Reference', v.reference],
            ['Form', v.title.replace(' & indemnity', '')],
            ['Asset', v.assets.length === 1 ? v.assets[0]!.makeModel : `${v.assets.length} items`],
            ['For', forLabel],
          ].map(([k, val]) => (
            <div key={k} className="rounded-md border-2 border-gray-200 px-3 py-2.5">
              <dt className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{k}</dt>
              <dd className="mt-0.5 text-md font-semibold leading-tight text-gray-900">{val}</dd>
            </div>
          ))}
        </dl>
        {v.movement ? (
          <p className="mt-4 rounded-md bg-gray-50 px-4 py-3 text-md text-gray-700">
            <b>From</b> {v.movement.from} <b>to</b> {v.movement.to} · <b>Reason:</b> {v.movement.reason}
          </p>
        ) : null}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] border-2 border-gray-200 text-sm">
            <caption className="sr-only">Equipment on this form</caption>
            <thead className="bg-gray-50">
              <tr>
                {['Qty', 'Asset description', 'Serial number', 'Make / model', 'Asset tag', ...(v.type === 'RETURN' ? ['Condition', 'Result'] : [])].map((h) => (
                  <th key={h} scope="col" className="border-b-2 border-r-2 border-gray-200 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-gray-600 last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.assets.map((a) => (
                <tr key={a.tag} className="border-b-2 border-gray-200 last:border-b-0">
                  <td className="border-r-2 border-gray-200 px-3 py-2">1</td>
                  <td className="border-r-2 border-gray-200 px-3 py-2">{a.description}</td>
                  <td className="border-r-2 border-gray-200 px-3 py-2">{a.serial ?? '-'}</td>
                  <td className="border-r-2 border-gray-200 px-3 py-2">{a.makeModel}</td>
                  <td className={cn('px-3 py-2', v.type === 'RETURN' && 'border-r-2 border-gray-200')}>{a.tag}</td>
                  {v.type === 'RETURN' ? (
                    <>
                      <td className="border-r-2 border-gray-200 px-3 py-2">{a.condition}</td>
                      <td className="px-3 py-2">{a.resultingStatus}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PublicCard>

      <PublicCard>
        <Eyebrow>Terms you are agreeing to</Eyebrow>
        <div className="mt-4 space-y-3">
          {v.terms.map((t, i) => (
            <label key={t.title} className="flex cursor-pointer gap-3 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5">
              <span className="pt-0.5">
                <CheckBox checked={!!terms[i]} onCheckedChange={(c) => setTerms((xs) => Object.assign([...xs], { [i]: c }))} label={t.title} />
              </span>
              <span>
                <span className="block text-md font-semibold text-gray-900">{t.title}</span>
                <span className="block text-sm text-gray-500">{t.text}</span>
              </span>
            </label>
          ))}
        </div>
      </PublicCard>

      <PublicCard>
        <Eyebrow>Your signature</Eyebrow>
        <label htmlFor="typed" className="sr-only">
          Type your full name as your signature
        </label>
        <div className="mt-4 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-4 pb-3 pt-4">
          <input
            id="typed"
            autoComplete="name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your full name"
            className="w-full border-b-2 border-gray-300 bg-transparent pb-1 text-[22px] font-bold text-brand placeholder:font-medium placeholder:text-gray-400 focus:border-brand focus:outline-none sm:w-[70%]"
            aria-invalid={err?.fields.typedName ? true : undefined}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Full name" htmlFor="fullname">
            <TextInput id="fullname" readOnly value={v.signer.name} />
          </Field>
          <Field label="Department / role" htmlFor="dept">
            <TextInput id="dept" value={deptRole ?? defaultDept} onChange={(e) => setDeptRole(e.target.value)} />
          </Field>
          <Field label="Date" htmlFor="date">
            <TextInput id="date" readOnly value={fmtDate(new Date())} />
          </Field>
        </div>
        <label className={cn('mt-4 flex cursor-pointer gap-3 rounded-md border-2 px-4 py-3', confirmed ? 'border-green-200 bg-green-bg' : 'border-gray-200 bg-gray-50')}>
          <span className="pt-0.5">
            <CheckBox checked={confirmed} onCheckedChange={setConfirmed} label="Confirm" />
          </span>
          <span className="text-sm leading-[1.5] text-gray-700">{v.confirmation}</span>
        </label>
        {err ? (
          <p role="alert" className="mt-3 rounded-sm bg-red-light px-3 py-2 text-sm font-medium text-red">
            {err.message}
          </p>
        ) : null}
        <Button size="lg" className="mt-4 w-full" disabled={!ready} loading={submit.isPending} onClick={() => submit.mutate()}>
          Sign &amp; submit
        </Button>
        {!ready ? <p className="mt-2 text-center text-xs text-gray-400">Tick every term and the confirmation, and type your name, to enable signing.</p> : null}
      </PublicCard>

      <div className="flex gap-2 rounded-md border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          This link was sent to your email by the ECEWS IT Department. It is single-use and valid until <b className="text-gray-700">{fmtDate(v.expiresAt)}</b>. If you
          were not expecting this, contact IT immediately at{' '}
          <a className="underline" href={`mailto:${v.itContact}`}>
            {v.itContact}
          </a>
          .
        </p>
      </div>
    </PublicShell>
  );
}
