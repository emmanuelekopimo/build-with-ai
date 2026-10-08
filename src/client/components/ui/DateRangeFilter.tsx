import * as Popover from '@radix-ui/react-popover';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { fmtDate, isoDateWAT } from '../../../shared/format';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export type Range = { from: string; to: string };

function presets(): Array<{ label: string; range: Range }> {
  const today = isoDateWAT();
  const [y, m] = today.split('-');
  const back = (days: number) => isoDateWAT(new Date(Date.now() - days * 86400000));
  return [
    { label: 'This month', range: { from: `${y}-${m}-01`, to: today } },
    { label: 'Last 30 days', range: { from: back(30), to: today } },
    { label: 'Last 90 days', range: { from: back(90), to: today } },
    { label: 'This year', range: { from: `${y}-01-01`, to: today } },
  ];
}

export function rangeLabel(r: Range): string {
  if (!r.from && !r.to) return 'All';
  const p = presets().find((x) => x.range.from === r.from && x.range.to === r.to);
  if (p) return p.label;
  if (r.from && r.to) return `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  return r.from ? `From ${fmtDate(r.from)}` : `Until ${fmtDate(r.to)}`;
}

/** "Added: All" pill (green accent as designed) with presets and a custom range. */
export function DateRangeFilter({ label, value, onChange }: { label: string; value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Range>(value);
  return (
    <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o && setCustom(value))}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-pill border-2 border-green-200 bg-green-100 px-4 text-md font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Calendar className="h-4 w-4" aria-hidden />
          {label}: {rangeLabel(value)}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[280px] rounded-md border border-gray-200 bg-white p-2 shadow-3">
          {[{ label: 'All', range: { from: '', to: '' } }, ...presets()].map((p) => {
            const active = p.range.from === value.from && p.range.to === value.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange(p.range);
                  setOpen(false);
                }}
                className={cn('flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-md hover:bg-gray-50', active && 'font-semibold text-brand')}
              >
                {p.label}
                {active ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            );
          })}
          <div className="mt-2 border-t border-gray-100 px-2 pb-1 pt-3">
            <div className="field-label">Custom range</div>
            <div className="flex items-center gap-2">
              <input type="date" aria-label="From date" className="input h-8 px-2 text-sm" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <input type="date" aria-label="To date" className="input h-8 px-2 text-sm" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
            <Button
              size="xs"
              className="mt-2 w-full"
              disabled={!custom.from && !custom.to}
              onClick={() => {
                onChange(custom);
                setOpen(false);
              }}
            >
              Apply range
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
