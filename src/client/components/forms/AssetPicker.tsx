import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useDebounced } from '../../lib/hooks';
import type { AssetList, AssetSummary } from '../../lib/types';
import { TagChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CheckBox, SearchInput } from '../ui/Controls';
import { pageItems } from '../ui/Data';
import { Modal, Tooltip } from '../ui/Overlay';
import { useToast } from '../ui/Toast';

export type PickerFor = 'ISSUANCE' | 'RETURN_STAFF' | 'RETURN_VENDOR' | 'MOVEMENT_STAFF' | 'MOVEMENT_LOCATION' | 'MOVEMENT_VENDOR';

const SCOPE: Record<PickerFor, string> = {
  ISSUANCE: 'In Store',
  RETURN_STAFF: 'Issued',
  RETURN_VENDOR: 'Damaged · in repair',
  MOVEMENT_STAFF: 'Issued',
  MOVEMENT_LOCATION: 'Issued or In Store',
  MOVEMENT_VENDOR: 'Damaged',
};
const GROUPS = ['Laptops', 'Monitors', 'Phones', 'Accessories', 'Other'];
const PAGE = 6;

/** "Add assets from registry" (Background+Shadow-14): search, category chips, multi-select across pages. */
export function AssetPicker({
  open,
  onOpenChange,
  mode,
  exclude,
  onAdd,
  title = 'Add assets from registry',
  holderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: PickerFor;
  exclude: string[];
  onAdd: (assets: AssetSummary[]) => void;
  title?: string;
  holderId?: string | null;
}) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, AssetSummary>>(new Map());
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (open) {
      setSelected(new Map());
      setQ('');
      setPage(1);
    }
  }, [open]);
  useEffect(() => setPage(1), [dq, group]);

  const query = useQuery({
    queryKey: ['picker', mode, dq, group, page, holderId ?? ''],
    queryFn: () => api<AssetList>(`/assets${qs({ for: mode, q: dq, group, page, pageSize: PAGE, holder: holderId ?? undefined })}`),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => (query.data?.items ?? []).filter((a) => !exclude.includes(a.tag)), [query.data, exclude]);

  const toggle = (a: AssetSummary) =>
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(a.tag)) n.delete(a.tag);
      else n.set(a.tag, a);
      return n;
    });

  /** Scanning or pasting a tag then Enter adds it directly. */
  const onEnter = async () => {
    const tag = q.trim().toUpperCase();
    if (!/^ECEWS-IT-\d{4,}$/.test(tag)) return;
    const r = await api<AssetList>(`/assets${qs({ for: mode, q: tag, pageSize: 5 })}`);
    const hit = r.items.find((a) => a.tag === tag);
    if (!hit) return toast.error(`${tag} is not available here (only ${SCOPE[mode]} assets can be added).`);
    if (!hit.available) return toast.error(hit.unavailableReason ?? `${tag} is not available.`);
    if (exclude.includes(tag)) return toast.info(`${tag} is already on this form.`);
    setSelected((m) => new Map(m).set(tag, hit));
    setQ('');
  };

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={title}
      subtitle={`Browsing the Asset Registry filtered to ${SCOPE[mode]} — select items to attach to this form`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            icon={<Plus className="h-4 w-4" />}
            disabled={selected.size === 0}
            onClick={() => {
              onAdd([...selected.values()]);
              onOpenChange(false);
            }}
          >
            Add {selected.size} asset{selected.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchInput
          containerClassName="sm:ml-auto sm:w-[432px]"
          placeholder="Search by asset tag, serial number, or description..."
          label="Search assets to add"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onEnter();
            }
          }}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {['', ...GROUPS].map((g) => (
            <button
              key={g || 'all'}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={cn(
                'h-9 rounded-pill border-2 px-4 text-md font-medium',
                group === g ? 'border-green-200 bg-green-100 text-brand' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {g || 'All categories'}
            </button>
          ))}
        </div>
        <p className="text-md text-gray-700" aria-live="polite">
          <b className="text-gray-900">{total}</b> assets with status {SCOPE[mode]} · <b className="text-brand">{selected.size}</b> selected
        </p>
        <div className="overflow-hidden rounded-md border-2 border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <caption className="sr-only">Assets you can add</caption>
              <thead className="border-b-2 border-gray-200 bg-gray-50">
                <tr>
                  <th className="th w-12" scope="col">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="th" scope="col">Asset tag</th>
                  <th className="th" scope="col">Description</th>
                  <th className="th" scope="col">Make / model</th>
                  <th className="th" scope="col">Serial</th>
                  <th className="th" scope="col">{mode.startsWith('RETURN') ? 'Holder' : 'Project'}</th>
                  <th className="th" scope="col">Location</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b-2 border-gray-100">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="skeleton h-4 w-2/3" />
                        </td>
                      </tr>
                    ))
                  : rows.map((a) => {
                      const sel = selected.has(a.tag);
                      const disabled = a.available === false;
                      const row = (
                        <tr
                          key={a.tag}
                          className={cn('border-b-2 border-gray-100 last:border-b-0', sel && 'bg-green-bg', disabled && 'opacity-55')}
                          onClick={() => !disabled && toggle(a)}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {disabled ? (
                              <Tooltip content={a.unavailableReason}>
                                <CheckBox checked={false} onCheckedChange={() => undefined} label={`${a.tag} unavailable`} disabled />
                              </Tooltip>
                            ) : (
                              <CheckBox checked={sel} onCheckedChange={() => toggle(a)} label={`Select ${a.tag}`} />
                            )}
                          </td>
                          <td className="td">
                            <TagChip tag={a.tag} />
                          </td>
                          <td className="td text-sm">{a.description}</td>
                          <td className="td text-sm">{a.makeModel}</td>
                          <td className="td whitespace-nowrap text-sm">{a.serial ?? '-'}</td>
                          <td className="td text-sm">{mode.startsWith('RETURN') ? (a.holder?.name ?? '-') : a.project.name}</td>
                          <td className="td text-sm">{a.location.name}</td>
                        </tr>
                      );
                      return row;
                    })}
              </tbody>
            </table>
          </div>
          {!query.isLoading && rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-md text-gray-500">
              {dq || group ? 'No assets match this search.' : `No ${SCOPE[mode]} assets are available right now.`}
            </p>
          ) : null}
        </div>
        {selected.size > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {[...selected.keys()].map((t) => (
              <button key={t} type="button" onClick={() => setSelected((m) => (m.delete(t), new Map(m)))} aria-label={`Remove ${t}`} className="inline-flex items-center gap-1">
                <TagChip tag={t} />
                <span className="text-gray-400" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {total === 0 ? 0 : (page - 1) * PAGE + 1}–{Math.min(total, page * PAGE)} of {total}
          </span>
          <div className="flex gap-1.5">
            {pageItems(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-gray-200 text-sm">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={cn('h-8 min-w-8 rounded-sm border px-2 text-sm', p === page ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white')}
                >
                  {p}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
