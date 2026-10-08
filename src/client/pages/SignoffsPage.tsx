import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleHelp, Clock, Mail, PenLine, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FORM_STATUS_LABEL } from '../../shared/constants';
import { fmtDayMonth, fmtTime } from '../../shared/format';
import { NewFormModal } from '../components/forms/NewFormModal';
import { invalidateForms, ResendModal, SignoffDrawer, type ResendTarget } from '../components/forms/SignoffDrawer';
import { FormStatusBadge, TagChip, WorkflowChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CheckCard, SearchInput, Tabs } from '../components/ui/Controls';
import { DataTable, Pagination, type Column } from '../components/ui/Data';
import { Card, InfoNote, KpiCard, PageHeader } from '../components/ui/Layout';
import { Modal } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { api, ApiError, download, qs } from '../lib/api';
import { useDebounced, useUrlState } from '../lib/hooks';
import { errorMessage } from '../lib/query';
import type { FormDetail, SignoffList, SignoffRow, SignoffSummary } from '../lib/formTypes';

const TABS = ['ALL', 'AWAITING', 'SIGNED', 'EXPIRED', 'DRAFT'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { ALL: 'All', AWAITING: 'Awaiting', SIGNED: 'Signed', EXPIRED: 'Expired', DRAFT: 'Draft' };

const sentLabel = (r: SignoffRow) => (r.sentAt ? `${fmtDayMonth(r.sentAt)} · ${fmtTime(r.sentAt)}` : '—');

export function SignoffsPage() {
  const [f, set] = useUrlState(['tab', 'q', 'page', 'ref'] as const);
  const navigate = useNavigate();
  const toast = useToast();
  const tab = (TABS as readonly string[]).includes(f.tab) ? (f.tab as Tab) : 'ALL';
  const page = Number(f.page) || 1;
  const [search, setSearch] = useState(f.q);
  const dq = useDebounced(search, 300);
  useEffect(() => {
    if (dq !== f.q) set({ q: dq }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [resend, setResend] = useState<ResendTarget | null>(null);
  const [newForm, setNewForm] = useState(false);
  const [remind, setRemind] = useState(false);

  // ?ref=ISS-0142 opens that sign-off's drawer (links from notifications, timeline, toasts).
  useEffect(() => {
    if (!f.ref) return;
    api<FormDetail>(`/forms/by-ref/${f.ref}`)
      .then((d) => setDrawerId(d.id))
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'Form not found.'));
  }, [f.ref, toast]);

  const summary = useQuery({ queryKey: ['signoff-summary'], queryFn: () => api<SignoffSummary>('/signoffs/summary'), refetchInterval: 60000 });
  const list = useQuery({
    queryKey: ['signoffs', tab, f.q, page],
    queryFn: () => api<SignoffList>(`/signoffs${qs({ tab, q: f.q, page })}`),
    placeholderData: keepPreviousData,
  });
  const k = summary.data?.kpis;

  const target = (r: SignoffRow): ResendTarget => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    sentAt: r.sentAt,
    type: r.type as ResendTarget['type'],
    recipientName: r.recipient.name,
    asset: r.asset,
  });

  const actions = (r: SignoffRow) => {
    const view = (
      <Button variant="secondary" size="xs" onClick={() => (r.kind === 'INTAKE' ? navigate(`/intake/${r.id}`) : setDrawerId(r.id))}>
        {r.kind === 'INTAKE' ? 'Resume' : 'View'}
      </Button>
    );
    if (r.kind === 'INTAKE') return view;
    switch (r.status) {
      case 'AWAITING':
      case 'PENDING_APPROVAL':
        return (
          <>
            <Button variant="secondary" size="xs" onClick={() => setResend(target(r))}>
              Resend
            </Button>
            {view}
          </>
        );
      case 'PARTIAL':
        return (
          <>
            <Button variant="secondary" size="xs" onClick={() => setResend(target(r))}>
              Remind
            </Button>
            {view}
          </>
        );
      case 'EXPIRED':
        return (
          <>
            <Button variant="secondary" size="xs" onClick={() => setResend(target(r))}>
              Re-send
            </Button>
            {view}
          </>
        );
      case 'SIGNED':
        return (
          <>
            {view}
            <Button
              variant="secondary"
              size="xs"
              onClick={() => download(`/forms/${r.id}/pdf`, `ECEWS-ITAMS-${r.reference}.pdf`).catch((e) => toast.error(errorMessage(e)))}
            >
              PDF
            </Button>
          </>
        );
      case 'DRAFT':
        return (
          <>
            <Button variant="secondary" size="xs" onClick={() => navigate(`/forms/${r.id}/edit?from=/signoffs?tab=DRAFT`)}>
              Resume
            </Button>
            {view}
          </>
        );
      default:
        return view;
    }
  };

  const columns: Column<SignoffRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => <span className="font-tag whitespace-nowrap text-md text-gray-800">{r.reference}</span> },
    { key: 'type', header: 'Type', cell: (r) => <WorkflowChip type={r.type} /> },
    {
      key: 'asset',
      header: 'Asset',
      cell: (r) => (
        <span className="block leading-tight">
          {r.asset.tag ? <TagChip tag={r.asset.tag} link className="min-w-[146px] justify-center" /> : null}
          <span className="mt-0.5 block text-sm text-gray-400">
            {r.asset.makeModel}
            {r.asset.more ? ` +${r.asset.more} more` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block text-md text-gray-800">{r.recipient.name}</span>
          <span className="block text-xs text-gray-400">{r.recipient.sub}</span>
        </span>
      ),
    },
    { key: 'sent', header: 'Sent', cell: (r) => <span className="whitespace-nowrap">{sentLabel(r)}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span title={r.waitingOn?.length ? `Waiting on ${r.waitingOn.join(', ')}` : undefined}>
          <FormStatusBadge status={r.status} />
        </span>
      ),
    },
    { key: 'action', header: 'Action', align: 'right', cell: (r) => <span className="inline-flex justify-end gap-1.5">{actions(r)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Sign-offs"
        subtitle="Issuance, return, movement and indemnity forms - sent, awaiting, signed"
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Mail className="h-4 w-4" />} onClick={() => setRemind(true)}>
              Email reminders
            </Button>
            <Button size="lg" className="min-w-[134px]" onClick={() => setNewForm(true)}>
              New form
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Awaiting signature" value={k?.awaiting ?? 0} loading={summary.isLoading} sub={`${k?.overdueToday ?? 0} overdue today`} icon={Clock} tone="amber" />
        <KpiCard label="Signed this week" value={k?.signedThisWeek ?? 0} loading={summary.isLoading} sub="back in Sign-offs automatically" icon={PenLine} tone="green" />
        <KpiCard label="Partially signed" value={k?.partial ?? 0} loading={summary.isLoading} sub="multi-signer, waiting on one" icon={CircleHelp} tone="blue" />
        <KpiCard label="Expired" value={k?.expired ?? 0} loading={summary.isLoading} sub="link expired - re-send" icon={XCircle} tone="red" />
      </div>
      <Tabs
        className="mb-5"
        size="lg"
        value={tab}
        onChange={(t) => set({ tab: t === 'ALL' ? null : t })}
        items={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: summary.data?.tabs[t] }))}
      />
      <Card className="overflow-hidden">
        <div className="flex justify-end px-5 py-4">
          <SearchInput containerClassName="w-full sm:w-[244px]" placeholder="Search ref, recipient, asset..." label="Search sign-offs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DataTable
          caption="Sign-offs"
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => `${r.kind}-${r.id}`}
          loading={list.isLoading}
          error={list.error ? errorMessage(list.error) : null}
          onRetry={() => void list.refetch()}
          empty={{
            icon: PenLine,
            title: f.q ? 'No sign-offs match this search' : tab === 'ALL' ? 'No sign-offs yet' : `No ${TAB_LABEL[tab].toLowerCase()} sign-offs`,
            description: f.q ? 'Try a reference like ISS-0142, a recipient or an asset tag.' : 'Forms appear here as soon as IT sends them for signature.',
            action: <Button onClick={() => setNewForm(true)}>New form</Button>,
          }}
          footer={list.data && list.data.total > 0 ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => set({ page: String(p) }, { resetPage: false })} /> : null}
        />
      </Card>
      <SignoffDrawer
        formId={drawerId}
        open={!!drawerId}
        onOpenChange={(o) => {
          if (!o) {
            setDrawerId(null);
            if (f.ref) set({ ref: null }, { replace: true, resetPage: false });
          }
        }}
      />
      {resend ? <ResendModal form={resend} open onOpenChange={(o) => !o && setResend(null)} /> : null}
      <NewFormModal open={newForm} onOpenChange={setNewForm} from="/signoffs" />
      {remind ? <RemindersModal open onOpenChange={setRemind} /> : null}
    </>
  );
}

/** Email reminders, bulk (Background+Shadow-7). */
function RemindersModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['remindable'],
    queryFn: async () => {
      const [a, e] = await Promise.all([api<SignoffList>('/signoffs?tab=AWAITING&pageSize=100'), api<SignoffList>('/signoffs?tab=EXPIRED&pageSize=100')]);
      return [...a.items, ...e.items].filter((r) => r.kind === 'FORM');
    },
  });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const rows = q.data ?? [];
  const sel = picked ?? new Set(rows.map((r) => r.id));
  const toggle = (id: string, v: boolean) => {
    const n = new Set(sel);
    if (v) n.add(id);
    else n.delete(id);
    setPicked(n);
  };
  const line = (r: SignoffRow) => {
    const sent = r.sentAt ? `sent ${fmtDayMonth(r.sentAt)} ${fmtTime(r.sentAt)}` : '';
    if (r.status === 'PARTIAL') return `Partial · waiting on ${r.waitingOn?.length ?? 1} signer${(r.waitingOn?.length ?? 1) === 1 ? '' : 's'}`;
    if (r.status === 'EXPIRED') return 'Expired · re-sent with a fresh 7-day window';
    return `${FORM_STATUS_LABEL[r.status]} · ${sent}${r.deadline ? ` · link expires ${fmtDayMonth(r.deadline)}` : ''}`;
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Email reminders"
      subtitle={`${rows.length} document${rows.length === 1 ? '' : 's'} awaiting signature — choose who to remind`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            disabled={sel.size === 0}
            icon={<Mail className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ sent: number; results: Array<{ ok: boolean; reference?: string; error?: string }> }>('/forms/remind', { body: { formIds: [...sel] } });
                toast.success(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`);
                const failed = r.results.filter((x) => !x.ok);
                if (failed.length) toast.error(`${failed.length} could not be sent: ${failed[0]?.error ?? ''}`);
                invalidateForms();
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Send {sel.size} reminder{sel.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {q.isLoading ? <div className="skeleton h-16 w-full" /> : null}
        {!q.isLoading && rows.length === 0 ? <p className="text-md text-gray-500">Nothing is waiting on a signature right now.</p> : null}
        {rows.map((r) => (
          <CheckCard
            key={r.id}
            highlight
            checked={sel.has(r.id)}
            onCheckedChange={(v) => toggle(r.id, v)}
            title={`${r.reference} · ${r.recipient.name}`}
            description={line(r)}
            right={<FormStatusBadge status={r.status} />}
          />
        ))}
        <InfoNote icon={Mail}>Expired links are re-sent with a fresh link; awaiting links get a reminder. Each email is single-use and extends the deadline by 7 days.</InfoNote>
      </div>
    </Modal>
  );
}
