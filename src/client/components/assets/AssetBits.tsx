import { DAMAGE_ORIGIN_LABEL } from '../../../shared/constants';
import type { AssetSummary } from '../../lib/types';
import { Badge, StatusBadge } from '../ui/Badge';

/** Status badge plus the "Failed intake" chip (D8) and the "In repair" sub-label. */
export function AssetStatusCell({ asset, variant = 'table' }: { asset: Pick<AssetSummary, 'status' | 'inRepair' | 'damageOrigin'>; variant?: 'table' | 'dot' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge status={asset.status} inRepair={asset.inRepair} variant={variant} />
      {asset.status === 'DAMAGED' && asset.damageOrigin === 'INTAKE_FAILURE' && !asset.inRepair ? (
        <Badge tone="red" dot={false} size="sm" className="border border-red/30 bg-white">
          {DAMAGE_ORIGIN_LABEL.INTAKE_FAILURE}
        </Badge>
      ) : null}
    </span>
  );
}

export function HolderCell({ holder }: { holder: AssetSummary['holder'] }) {
  if (!holder) return <span className="text-gray-400">-</span>;
  return (
    <span className="block leading-tight">
      <span className="block text-md text-gray-800">{holder.name}</span>
      <span className="block text-xs text-gray-400">{holder.type === 'VENDOR' ? (holder.company ?? 'Vendor') : (holder.department ?? '')}</span>
    </span>
  );
}
