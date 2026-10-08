import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Box, CircleCheck, Clock, Laptop, QrCode, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FormType } from '../../shared/constants';
import { fmtDayMonth, fmtLongDate, fmtSince } from '../../shared/format';
import { NotificationsBell } from '../components/layout/NotificationsBell';
import { Badge, TagChip, WorkflowChip } from '../components/ui/Badge';
import { LinkButton } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/Data';
import { Card, CardHeader, ErrorState, KpiCard, PageHeader, Skeleton } from '../components/ui/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { errorMessage } from '../lib/query';

interface Dashboard {
  today: string;
  kpis: { inStore: number; addedThisMonth: number; issued: number; underRepair: number; awaitingParts: number; awaiting: number; overdueToday: number };
  recent: Array<{ id: string; reference: string; type: FormType; tag: string | null; makeModel: string; recipient: { name: string; sub: string }; sentAt: string }>;
  attention: { total: number; items: Array<{ key: string; reference: string | null; reason: 'DAMAGED' | 'FAILED_INTAKE' | 'OVERDUE'; reasonLabel: string; tag: string; makeModel: string; since: string }> };
  projects: Array<{ id: string; name: string; description: string; count: number }>;
}

const QUICK = [
  { to: '/forms/new/issuance?from=/', title: 'New issuance', sub: 'Fill Form 2 and send it for signature', Icon: CircleCheck, tile: 'bg-green-100 text-brand' },
  { to: '/forms/new/return?from=/', title: 'New return', sub: 'Log a return and email the signer', Icon: QrCode, tile: 'bg-blue-light text-blue' },
  { to: '/forms/new/movement?from=/', title: 'New Movements', sub: 'Move Devices outside the Organization', Icon: Wrench, tile: 'bg-amber-light text-amber' },
];

function AssetCell({ tag, makeModel }: { tag: string | null; makeModel: string }) {
  return (
    <span className="block leading-tight">
      {tag ? <TagChip tag={tag} link /> : null}
      <span className="mt-0.5 block max-w-[130px] text-sm text-gray-400">{makeModel}</span>
    </span>
  );
}

export function DashboardPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 60000 });
  const d = q.data;
  const k = d?.kpis;
  const it = can('form.manage');

  const recentCols: Column<Dashboard['recent'][number]>[] = [
    { key: 'ref', header: 'Ref', cell: (r) => <Link to={`/signoffs?ref=${r.reference}`} className="whitespace-nowrap hover:underline">{r.reference}</Link> },
    { key: 'type', header: 'Type', cell: (r) => <WorkflowChip type={r.type} /> },
    { key: 'asset', header: 'Asset', cell: (r) => <AssetCell tag={r.tag} makeModel={r.makeModel} /> },
    {
      key: 'recipient',
      header: 'Recipient',
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block">{r.recipient.name}</span>
          <span className="block text-xs text-gray-400">{r.recipient.sub}</span>
        </span>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      cell: (r) => {
        const [day, mon] = fmtDayMonth(r.sentAt).split(' ');
        return (
          <span className="block leading-tight">
            {day}
            <br />
            {mon}
          </span>
        );
      },
    },
  ];
  const attentionCols: Column<Dashboard['attention']['items'][number]>[] = [
    { key: 'ref', header: 'Ref', cell: (r) => <span className="whitespace-nowrap">{r.reference ?? '—'}</span> },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => (
        <Badge tone={r.reason === 'OVERDUE' ? 'amber' : 'red'} dot={false} icon={r.reason === 'OVERDUE' ? <Clock className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}>
          {r.reasonLabel}
        </Badge>
      ),
    },
    { key: 'asset', header: 'Asset', cell: (r) => <AssetCell tag={r.tag} makeModel={r.makeModel} /> },
    { key: 'since', header: 'Since', cell: (r) => <span className="whitespace-nowrap">{fmtSince(r.since)}</span> },
    {
      key: 'action',
      header: 'Action',
      cell: (r) => (
        <LinkButton to={`/assets/${r.tag}`} variant="outline" size="xs" className="rounded-sm">
          View Details
        </LinkButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Live stock and signature overview · ${fmtLongDate(d?.today ?? new Date())}`} actions={it ? <NotificationsBell /> : null} />
      {q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : null}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="In Store" value={k?.inStore ?? 0} loading={q.isLoading} sub={`↑ ${k?.addedThisMonth ?? 0} added this month`} subTone="green" icon={Box} tone="green" />
        <KpiCard label="Issued" value={k?.issued ?? 0} loading={q.isLoading} sub="held by staff" icon={Laptop} tone="blue" />
        <KpiCard label="Under Repair" value={k?.underRepair ?? 0} loading={q.isLoading} sub={`${k?.awaitingParts ?? 0} awaiting parts`} icon={Wrench} tone="amber" />
        <KpiCard label="Awaiting signature" value={k?.awaiting ?? 0} loading={q.isLoading} sub={`${k?.overdueToday ?? 0} overdue today`} icon={Clock} tone="amber" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {can('signoff.view') ? (
            <Card className="overflow-hidden">
              <CardHeader title="Recent Actions" actions={<LinkButton to="/signoffs" variant="outline" size="sm" className="px-4">View all</LinkButton>} />
              <DataTable
                caption="Recent actions"
                minWidth={560}
                columns={recentCols}
                rows={d?.recent}
                rowKey={(r) => r.id}
                loading={q.isLoading}
                empty={{ title: 'No forms sent yet', description: 'Issuances, returns and movements appear here once sent for signature.' }}
              />
            </Card>
          ) : null}
          <Card className="overflow-hidden">
            <CardHeader
              title="Needs Attention"
              actions={<LinkButton to="/assets?status=DAMAGED" variant="outline" size="sm" className="px-4">View all{d && d.attention.total > 3 ? ` (${d.attention.total})` : ''}</LinkButton>}
            />
            <DataTable
              caption="Needs attention"
              minWidth={560}
              columns={attentionCols}
              rows={d?.attention.items}
              rowKey={(r) => r.key}
              loading={q.isLoading}
              empty={{ icon: CircleCheck, title: 'Nothing needs attention', description: 'Damaged assets and overdue vendor returns show up here.' }}
            />
          </Card>
        </div>
        <div className="space-y-5">
          {it ? (
            <Card className="px-5 pb-6">
              <CardHeader title="Quick actions" className="px-0" />
              <div className="space-y-3">
                {QUICK.map((x) => (
                  <Link key={x.to} to={x.to} className="flex items-center gap-4 rounded-md border-2 border-gray-200 px-4 py-4 transition-colors hover:border-green-200 hover:bg-green-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm', x.tile)} aria-hidden>
                      <x.Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-md font-semibold text-gray-900">{x.title}</span>
                      <span className="block text-sm text-gray-500">{x.sub}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
          <Card className="px-5 pb-6">
            <CardHeader title="Assets by project" className="px-0" />
            {q.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <ol className="space-y-3">
                {d?.projects.map((p, i) => (
                  <li key={p.id}>
                    <Link to={`/assets?project=${p.id}`} className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2.5 hover:bg-gray-100">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-green-100 text-xs font-bold text-brand" aria-hidden>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-md font-semibold text-gray-900">{p.name}</span>
                        <span className="block text-sm text-gray-500">{p.description}</span>
                      </span>
                      <span className="text-md font-bold text-gray-900">{p.count}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
