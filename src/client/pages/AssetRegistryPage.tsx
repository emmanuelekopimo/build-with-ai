import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Box, Plus, SlidersHorizontal, Tag, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AssetStatusCell, HolderCell } from '../components/assets/AssetBits';
import { TagChip } from '../components/ui/Badge';
import { Button, LinkButton } from '../components/ui/Button';
import { FilterChip, FilterSelect, SearchInput } from '../components/ui/Controls';
import { DataTable, Pagination, type Column } from '../components/ui/Data';
import { DateRangeFilter, rangeLabel } from '../components/ui/DateRangeFilter';
import { Card, PageHeader } from '../components/ui/Layout';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { useDebounced, useMeta, useUrlState } from '../lib/hooks';
import { errorMessage } from '../lib/query';
import type { AssetList, AssetSummary } from '../lib/types';

const KEYS = ['q', 'category', 'status', 'project', 'from', 'to', 'page', 'sort', 'dir', 'highlight'] as const;

const STATUS_OPTIONS = [
  { value: 'IN_STORE', label: 'In Store' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'DAMAGED', label: 'Damaged', sub: 'incl. in repair' },
  { value: 'IN_REPAIR', label: 'In repair', sub: 'Damaged · at vendor' },
  { value: 'RETIRED', label: 'Retired' },
];

export const REGISTRY_RETURN_KEY = 'itams.registry.search';

export function AssetRegistryPage() {
  const [f, set, params] = useUrlState(KEYS);
  const { can } = useAuth();
  const meta = useMeta();
  const navigate = useNavigate();
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) set({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    try {
      sessionStorage.setItem(REGISTRY_RETURN_KEY, params.toString());
    } catch {
      /* storage unavailable */
    }
  }, [params]);

  const page = Number(f.page) || 1;
  const sort = f.sort || 'tag';
  const dir = f.dir === 'desc' ? 'desc' : 'asc';
  const query = useQuery({
    queryKey: ['assets', f],
    queryFn: () =>
      api<AssetList>(
        `/assets${qs({ q: f.q, category: f.category, status: f.status, project: f.project, addedFrom: f.from, addedTo: f.to, page, sort, dir, pageSize: 10 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const statusOptions = useMemo(
    () => (can('asset.viewDeleted') ? [...STATUS_OPTIONS, { value: 'DELETED', label: 'Deleted (admin)' }] : STATUS_OPTIONS),
    [can],
  );
  const categories = meta.data?.categories.map((c) => ({ value: c.id, label: c.name })) ?? [];
  const projects = meta.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? [];

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (f.category) chips.push({ label: categories.find((c) => c.value === f.category)?.label ?? 'Category', clear: () => set({ category: null }) });
  if (f.status) chips.push({ label: statusOptions.find((s) => s.value === f.status)?.label ?? f.status, clear: () => set({ status: null }) });
  if (f.project) chips.push({ label: `Project: ${projects.find((p) => p.value === f.project)?.label ?? ''}`, clear: () => set({ project: null }) });
  if (f.from || f.to) chips.push({ label: `Added: ${rangeLabel({ from: f.from, to: f.to })}`, clear: () => set({ from: null, to: null }) });
  if (f.q) chips.push({ label: `“${f.q}”`, clear: () => (setSearch(''), set({ q: null })) });

  const sortHeader = (key: string, label: string) => (
    <button
      type="button"
      onClick={() => set({ sort: key, dir: sort === key && dir === 'asc' ? 'desc' : 'asc' }, { resetPage: true })}
      className="inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-gray-900"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sort === key ? dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
    </button>
  );

  const highlight = f.highlight ? f.highlight.split(',') : [];
  const columns: Column<AssetSummary>[] = [
    { key: 'tag', header: sortHeader('tag', 'Asset tag'), cell: (a) => <TagChip tag={a.tag} link /> },
    { key: 'description', header: sortHeader('description', 'Description'), cell: (a) => a.description, className: 'whitespace-nowrap' },
    { key: 'makeModel', header: sortHeader('makeModel', 'Make / model'), cell: (a) => a.makeModel, className: 'whitespace-nowrap' },
    { key: 'serial', header: 'Serial', cell: (a) => <span className="whitespace-nowrap">{a.serial ?? '-'}</span> },
    { key: 'status', header: sortHeader('status', 'Status'), cell: (a) => <AssetStatusCell asset={a} /> },
    { key: 'holder', header: sortHeader('holder', 'Current holder'), cell: (a) => <HolderCell holder={a.holder} /> },
    { key: 'project', header: sortHeader('project', 'Project'), cell: (a) => a.project.name },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      cell: (a) => (
        <LinkButton to={`/assets/${a.tag}`} variant="secondary" size="xs" aria-label={`View ${a.tag}`}>
          View
        </LinkButton>
      ),
    },
  ];

  const data = query.data;
  const filtered = chips.length > 0;
  return (
    <>
      <PageHeader
        title="Asset Registry"
        subtitle={`${data ? data.grandTotal : '…'} assets · every tag links to its full lifecycle record`}
        actions={
          can('intake.manage') ? (
            <LinkButton to="/intake" icon={<Plus className="h-4 w-4" />}>
              New Intake
            </LinkButton>
          ) : null
        }
      />
      <Card className="mb-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            containerClassName="w-full sm:w-[366px]"
            placeholder="Search tag, serial number, description, holder..."
            label="Search assets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <FilterSelect label="Category" icon={SlidersHorizontal} options={categories} value={f.category} onChange={(v) => set({ category: v })} />
          <FilterSelect label="Status" icon={Box} options={statusOptions} value={f.status} onChange={(v) => set({ status: v })} />
          <FilterSelect label="Project" icon={Tag} options={projects} value={f.project} onChange={(v) => set({ project: v })} />
          <DateRangeFilter label="Added" value={{ from: f.from, to: f.to }} onChange={(r) => set({ from: r.from, to: r.to })} />
          <button
            type="button"
            aria-pressed={f.status === 'IN_REPAIR'}
            onClick={() => set({ status: f.status === 'IN_REPAIR' ? null : 'IN_REPAIR' })}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-pill border-2 px-4 text-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              f.status === 'IN_REPAIR' ? 'border-amber bg-amber-light text-amber' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
            )}
          >
            <Wrench className="h-4 w-4" aria-hidden />
            In repair
          </button>
        </div>
        <div className="mt-3 flex min-h-[28px] flex-wrap items-center gap-2">
          {chips.map((c) => (
            <FilterChip key={c.label} label={c.label} onRemove={c.clear} />
          ))}
          {filtered ? (
            <button
              type="button"
              className="ml-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              onClick={() => {
                setSearch('');
                set({ q: null, category: null, status: null, project: null, from: null, to: null });
              }}
            >
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto text-md text-gray-700" aria-live="polite">
            <b className="font-bold text-gray-900">{data?.total ?? '…'}</b> results
          </span>
        </div>
      </Card>
      <Card className={cn('overflow-hidden', query.isFetching && data && 'opacity-80')}>
        <DataTable
          caption="Assets"
          columns={columns}
          rows={data?.items}
          rowKey={(a) => a.tag}
          loading={query.isLoading}
          error={query.error ? errorMessage(query.error) : null}
          onRetry={() => void query.refetch()}
          highlightKey={highlight[0] ?? null}
          rowClassName={(a) => (highlight.includes(a.tag) ? 'animate-highlight' : undefined)}
          empty={
            filtered
              ? {
                  title: 'No assets match these filters',
                  description: 'Try removing a filter or searching for a different tag, serial or holder.',
                  action: (
                    <Button variant="secondary" size="sm" onClick={() => (setSearch(''), set({ q: null, category: null, status: null, project: null, from: null, to: null }))}>
                      Clear filters
                    </Button>
                  ),
                }
              : {
                  title: 'No assets yet',
                  description: 'Assets are created when IT validates a delivery. Start an intake to add the first ones.',
                  action: can('intake.manage') ? <Button onClick={() => navigate('/intake')}>Start an intake</Button> : undefined,
                }
          }
          footer={
            data && data.total > 0 ? (
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />
            ) : null
          }
        />
      </Card>
    </>
  );
}
