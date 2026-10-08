import { PenLine, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { categoryIcon } from '../../lib/icons';
import type { AssetSummary } from '../../lib/types';
import { cn } from '../../lib/cn';
import { StatusBadge } from '../ui/Badge';
import { ItemCard } from '../ui/Layout';

export function EquipmentList({
  assets,
  onRemove,
  onAdd,
  addLabel,
  error,
  sub,
  right,
}: {
  assets: AssetSummary[];
  onRemove?: (tag: string) => void;
  onAdd?: () => void;
  addLabel: string;
  error?: string;
  sub?: (a: AssetSummary) => ReactNode;
  right?: (a: AssetSummary) => ReactNode;
}) {
  return (
    <div className="space-y-4" data-field="assetTags" id="f-assetTags">
      {assets.map((a) => (
        <ItemCard
          key={a.tag}
          icon={categoryIcon(a.category.icon)}
          title={a.makeModel}
          sub={sub ? sub(a) : `${a.tag}${a.serial ? ` · SN ${a.serial}` : ''} · project ${a.project.name}`}
          right={
            <>
              {right ? right(a) : <StatusBadge status={a.status} inRepair={a.inRepair} />}
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`Remove ${a.tag}`}
                  onClick={() => onRemove(a.tag)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </>
          }
        />
      ))}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-2 rounded-sm border-2 border-dashed text-sm font-semibold text-brand hover:bg-green-bg',
            error ? 'border-red' : 'border-brand',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden /> {addLabel}
        </button>
      ) : null}
      {error ? <p className="text-sm text-red">{error}</p> : null}
    </div>
  );
}

/** The email preview box used in the send modals (Issuance confirmation, Confirm return, Movement). */
export function EmailPreview({ subject, children, button }: { subject: string; children: ReactNode; button: string }) {
  return (
    <div className="rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-4">
      <div className="text-md font-bold text-gray-900">{subject}</div>
      <div className="mt-1.5 space-y-2 text-sm leading-[1.5] text-gray-600">{children}</div>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-brand px-4 py-2 text-sm font-semibold text-white" aria-hidden>
        <PenLine className="h-3.5 w-3.5" /> {button}
      </span>
    </div>
  );
}

export function FormSection({ children, last }: { children: ReactNode; last?: boolean }) {
  return <section className={cn('px-6 py-6', !last && 'border-b-2 border-gray-100')}>{children}</section>;
}

export const assetPhrase = (assets: AssetSummary[]) =>
  assets.length === 1 ? (
    <>
      <b className="text-gray-800">{assets[0]!.makeModel}</b> ({assets[0]!.tag})
    </>
  ) : (
    <>
      <b className="text-gray-800">{assets.length} items</b> ({assets.map((a) => a.tag).join(', ')})
    </>
  );
