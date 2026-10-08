import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { EmptyState, ErrorState, Skeleton } from './Layout';
import type { LucideIcon } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
}

/** Table with header row, skeleton rows, empty and error states, and footer pagination. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  footer,
  caption,
  rowClassName,
  highlightKey,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode };
  footer?: ReactNode;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
  highlightKey?: string | null;
}) {
  const alignCls = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '');
  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-y-2 border-gray-200 bg-gray-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('th', alignCls(c.align), c.headerClassName)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b-2 border-gray-100">
                    {columns.map((c) => (
                      <td key={c.key} className="td py-5">
                        <Skeleton className="w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((r) => {
                  const k = rowKey(r);
                  return (
                    <tr
                      key={k}
                      className={cn(
                        'border-b-2 border-gray-100 last:border-b-0 hover:bg-gray-50/60',
                        highlightKey === k && 'animate-highlight',
                        rowClassName?.(r),
                      )}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={cn('td', alignCls(c.align), c.className)}>
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {error ? (
        <div className="p-5">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : !loading && rows && rows.length === 0 && empty ? (
        <div className="p-5">
          <EmptyState {...empty} />
        </div>
      ) : null}
      {footer}
    </div>
  );
}

/** "Showing 1–5 of 382" + numbered pages with ellipsis. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const items = pageItems(page, pages);
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 border-t-2 border-gray-100 bg-gray-50 px-4 py-3', className)}
    >
      <span className="text-sm text-gray-500">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-gray-200 bg-white text-sm text-gray-500">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPage(it)}
              aria-current={it === page ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 min-w-8 items-center justify-center rounded-sm border px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                it === page ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {it}
            </button>
          ),
        )}
      </div>
    </nav>
  );
}

export function pageItems(page: number, pages: number): Array<number | '…'> {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 3) return [1, 2, 3, '…', pages];
  if (page >= pages - 2) return [1, '…', pages - 2, pages - 1, pages];
  return [1, '…', page, '…', pages];
}

export type TimelineTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';
const nodeCls: Record<TimelineTone, string> = {
  green: 'bg-brand',
  blue: 'bg-blue',
  amber: 'bg-amber',
  red: 'bg-red',
  gray: 'bg-gray-500',
};

export interface TimelineEntry {
  id: string;
  tone: TimelineTone;
  title: ReactNode;
  when: string;
  detail: ReactNode;
}

/** Chain-of-custody timeline, newest last (as designed). */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
          <div className="relative flex w-3 shrink-0 justify-center">
            <span
              className={cn('relative z-10 mt-1 h-3 w-3 rounded-full', nodeCls[e.tone], i === 0 && 'ring-2 ring-green-200 ring-offset-1')}
              aria-hidden
            />
            {i < entries.length - 1 ? <span className="absolute top-5 h-[calc(100%-4px)] w-0.5 bg-gray-200" aria-hidden /> : null}
          </div>
          <div className="min-w-0 flex-1 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 className="text-md font-semibold text-gray-900">{e.title}</h3>
              <span className="text-sm text-gray-400">{e.when}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-gray-600">{e.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SignatureBlock({
  caption,
  name,
  sub,
  signedLabel,
}: {
  caption: string;
  name: string;
  sub: ReactNode;
  signedLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500">{caption}</div>
        <div className="mt-0.5 text-xl font-semibold text-brand">{name}</div>
        <div className="text-sm text-gray-400">{sub}</div>
      </div>
      {signedLabel ? (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-100 px-2.5 py-1 text-2xs font-semibold text-brand">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {signedLabel}
        </span>
      ) : null}
    </div>
  );
}

/** Code 128 barcode rendered client-side with bwip-js (SVG). */
export function Barcode({ text, height = 10, className }: { text: string; height?: number; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    import('bwip-js/browser')
      .then((bwip) => {
        const out = bwip.toSVG({ bcid: 'code128', text, height, includetext: false, scale: 2 });
        if (mounted.current) setSvg(out);
      })
      .catch(() => mounted.current && setFailed(true));
    return () => {
      mounted.current = false;
    };
  }, [text, height]);
  if (failed) return <span className="font-tag text-sm text-gray-500">{text}</span>;
  if (!svg) return <Skeleton className={cn('h-10 w-24', className)} />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={`Barcode for ${text}`}
      className={cn('h-10 w-auto', className)}
    />
  );
}
