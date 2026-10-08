import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, SlidersHorizontal, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDate } from '../../shared/format';
import { SignoffDrawer } from '../components/forms/SignoffDrawer';
import { FormStatusBadge, StatusBadge, TagChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FilterChip, FilterSelect, SearchInput, Tabs } from '../components/ui/Controls';
import { DataTable, Pagination, type Column } from '../components/ui/Data';
import { Card, PageHeader } from '../components/ui/Layout';
import { api, qs } from '../lib/api';
import { useDebounced, useMeta, useUrlState } from '../lib/hooks';
import { errorMessage } from '../lib/query';
import type { AssetStatus, FormStatus } from '../../shared/constants';

type Kind = 'issuance' | 'return' | 'movement';
interface Row {
  id: string;
  formId: string;
  reference: string;
  formStatus: FormStatus;
  tag: string;
  description: string;
  makeModel: string;
  serial: string | null;
  project: string;
  resultingStatus: AssetStatus | null;
  date: string | null;
  completed: boolean;
  holder?: { name: string; sub: string };
  movedFrom?: string;
  movedTo?: string;
  reason?: string;
}

const META: Record<Kind, { title: string; button: string; noun: string }> = {
  issuance: { title: 'Issuances', button: 'New Issuance', noun: 'issuance' },
  return: { title: 'Returns', button: 'New Return', noun: 'return' },
  movement: { title: 'Movements', button: 'New Movements', noun: 'movement' },
};

function StatusCell({ r }: { r: Row }) {
  if (r.completed && r.resultingStatus) return <StatusBadge status={r.resultingStatus} variant="table" />;
  return <FormStatusBadge status={r.formStatus} />;
}

export function FormsRegistryPage() {
  const [f, set] = useUrlState(['tab', 'q', 'category', 'project', 'page', 'highlight'] as const);
  const kind: Kind = f.tab === 'return' || f.tab === 'movement' ? f.tab : 'issuance';
  const meta = useMeta();
  const navigate = useNavigate();
  const [search, setSearch] = useState(f.q);
  const dq = useDebounced(search, 300);
  useEffect(() => {
    if (dq !== f.q) set({ q: dq }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  const [drawer, setDrawer] = useState<string | null>(null);
  const page = Number(f.page) || 1;
  const q = useQuery({
    queryKey: ['registry', kind, f.q, f.category, f.project, page],
    queryFn: () => api<{ items: Row[]; total: number; page: number; pageSize: number }>(`/registries/${kind}${qs({ q: f.q, category: f.category, project: f.project, page })}`),
    placeholderData: keepPreviousData,
  });
  const categories = meta.data?.categories.map((c) => ({ value: c.id, label: c.name })) ?? [];
  const projects = meta.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? [];
  const chips: Array<{ label: string; clear: () => void }> = [];
  if (f.category) chips.push({ label: categories.find((c) => c.value === f.category)?.label ?? 'Category', clear: () => set({ category: null }) });
  if (f.project) chips.push({ label: `Project: ${projects.find((p) => p.value === f.project)?.label ?? ''}`, clear: () => set({ project: null }) });
  if (f.q) chips.push({ label: `“${f.q}”`, clear: () => (setSearch(''), set({ q: null })) });
  const highlight = f.highlight ? f.highlight.split(',') : [];

  const tag: Column<Row> = { key: 'tag', header: 'Asset tag', cell: (r) => <TagChip tag={r.tag} link /> };
  const view: Column<Row> = {
    key: 'action',
    header: 'Action',
    align: 'right',
    cell: (r) => (
      <Button variant="secondary" size="xs" onClick={() => setDrawer(r.formId)} aria-label={`View ${r.reference}`}>
        View
      </Button>
    ),
  };
  const holderCell = (r: Row) => (
    <span className="block leading-tight">
      <span className="block">{r.holder?.name}</span>
      <span className="block text-xs text-gray-400">{r.holder?.sub}</span>
    </span>
  );
  const columns: Column<Row>[] =
    kind === 'issuance'
      ? [
          tag,
          { key: 'mm', header: 'Make / model', cell: (r) => r.makeModel, className: 'whitespace-nowrap' },
          { key: 'serial', header: 'Serial', cell: (r) => r.serial ?? '-', className: 'whitespace-nowrap' },
          { key: 'status', header: 'Status', cell: (r) => <StatusCell r={r} /> },
          { key: 'project', header: 'Project', cell: (r) => r.project, className: 'whitespace-nowrap' },
          { key: 'holder', header: 'Current holder', cell: holderCell },
          { key: 'date', header: 'Date issued', cell: (r) => (r.completed ? fmtDate(r.date) : <span className="text-gray-400">{r.reference}</span>), className: 'whitespace-nowrap' },
          view,
        ]
      : kind === 'return'
        ? [
            tag,
            { key: 'desc', header: 'Description', cell: (r) => r.description, className: 'whitespace-nowrap' },
            { key: 'mm', header: 'Make / model', cell: (r) => r.makeModel, className: 'whitespace-nowrap' },
            { key: 'serial', header: 'Serial', cell: (r) => r.serial ?? '-', className: 'whitespace-nowrap' },
            { key: 'status', header: 'Status', cell: (r) => <StatusCell r={r} /> },
            { key: 'project', header: 'Project', cell: (r) => r.project, className: 'whitespace-nowrap' },
            { key: 'date', header: 'Date returned', cell: (r) => (r.completed ? fmtDate(r.date) : <span className="text-gray-400">{r.reference}</span>), className: 'whitespace-nowrap' },
            view,
          ]
        : [
            tag,
            { key: 'mm', header: 'Make / model', cell: (r) => r.makeModel, className: 'whitespace-nowrap' },
            { key: 'serial', header: 'Serial', cell: (r) => r.serial ?? '-', className: 'whitespace-nowrap' },
            { key: 'from', header: 'Moved from', cell: (r) => r.movedFrom },
            { key: 'to', header: 'Moved to', cell: (r) => r.movedTo },
            { key: 'reason', header: 'Reason', cell: (r) => r.reason },
            { key: 'date', header: 'Date moved', cell: (r) => (r.completed ? fmtDate(r.date) : <FormStatusBadge status={r.formStatus} />), className: 'whitespace-nowrap' },
            view,
          ];

  const m = META[kind];
  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={`${q.data?.total ?? '…'} ${q.data?.total === 1 ? 'asset' : 'assets'} · every tag links to its full lifecycle record`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate(`/forms/new/${kind}?from=${encodeURIComponent(`/forms?tab=${kind}`)}`)}>
            {m.button}
          </Button>
        }
      />
      <Tabs
        size="lg"
        className="mb-5"
        value={kind}
        onChange={(t) => {
          setSearch('');
          set({ tab: t === 'issuance' ? null : t, q: null, category: null, project: null });
        }}
        items={[
          { value: 'issuance', label: 'Issuance' },
          { value: 'return', label: 'Return' },
          { value: 'movement', label: 'Movement' },
        ]}
      />
      <Card className="mb-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput containerClassName="w-full sm:w-[366px]" placeholder="Search tag, serial number, description, holder..." label={`Search ${m.title.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          <FilterSelect label="Category" icon={SlidersHorizontal} options={categories} value={f.category} onChange={(v) => set({ category: v })} />
          <FilterSelect label="Project" icon={Tag} options={projects} value={f.project} onChange={(v) => set({ project: v })} />
        </div>
        <div className="mt-3 flex min-h-[28px] flex-wrap items-center gap-2">
          {chips.map((c) => (
            <FilterChip key={c.label} label={c.label} onRemove={c.clear} />
          ))}
          {chips.length ? (
            <button type="button" className="ml-2 text-sm font-medium text-gray-600 hover:text-gray-900" onClick={() => (setSearch(''), set({ q: null, category: null, project: null }))}>
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-md text-gray-700">
            <b className="font-bold text-gray-900">{q.data?.total ?? '…'}</b> results
          </span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <DataTable
          caption={m.title}
          columns={columns}
          rows={q.data?.items}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          error={q.error ? errorMessage(q.error) : null}
          onRetry={() => void q.refetch()}
          rowClassName={(r) => (highlight.includes(r.tag) ? 'animate-highlight' : undefined)}
          empty={{
            title: chips.length ? `No ${m.noun}s match these filters` : `No ${m.noun}s yet`,
            description: chips.length ? 'Remove a filter or search for a different tag.' : `${m.title} appear here once IT sends the form.`,
            action: <Button onClick={() => navigate(`/forms/new/${kind}?from=${encodeURIComponent(`/forms?tab=${kind}`)}`)}>{m.button}</Button>,
          }}
          footer={q.data && q.data.total > 0 ? <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: String(p) }, { resetPage: false })} /> : null}
        />
      </Card>
      <SignoffDrawer formId={drawer} open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)} />
    </>
  );
}
