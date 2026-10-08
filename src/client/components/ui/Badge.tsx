import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Send,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  FORM_STATUS_LABEL,
  STATUS_LABEL,
  UNDER_REPAIR_LABEL,
  type AssetStatus,
  type FormStatus,
  type FormType,
} from '../../../shared/constants';
import { cn } from '../../lib/cn';

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'gray';

const toneClass: Record<Tone, string> = {
  green: 'bg-green-100 text-brand',
  blue: 'bg-blue-light text-blue',
  amber: 'bg-amber-light text-amber',
  red: 'bg-red-light text-red',
  gray: 'bg-gray-100 text-gray-600',
};
const dotClass: Record<Tone, string> = {
  green: 'bg-brand',
  blue: 'bg-blue',
  amber: 'bg-amber',
  red: 'bg-red',
  gray: 'bg-gray-600',
};

export function Badge({
  tone,
  children,
  dot = true,
  icon,
  className,
  size = 'md',
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        toneClass[tone],
        className,
      )}
    >
      {icon ?? (dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass[tone])} aria-hidden /> : null)}
      {children}
    </span>
  );
}

export function assetTone(status: AssetStatus, inRepair: boolean): Tone {
  if (status === 'DAMAGED') return inRepair ? 'amber' : 'red';
  return ({ IN_STORE: 'green', ISSUED: 'blue', RETIRED: 'gray' } as const)[status];
}

/** Asset status with a dot (headers) or, for Damaged in tables, the alert icon (D36). */
export function StatusBadge({
  status,
  inRepair = false,
  variant = 'dot',
  className,
}: {
  status: AssetStatus;
  inRepair?: boolean;
  variant?: 'dot' | 'table';
  className?: string;
}) {
  const tone = assetTone(status, inRepair);
  const label = status === 'DAMAGED' && inRepair ? UNDER_REPAIR_LABEL : STATUS_LABEL[status];
  const icon =
    variant === 'table' && status === 'DAMAGED' && !inRepair ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : undefined;
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {label}
    </Badge>
  );
}

export function formStatusTone(status: FormStatus): Tone {
  switch (status) {
    case 'SIGNED':
      return 'green';
    case 'PARTIAL':
      return 'blue';
    case 'AWAITING':
    case 'PENDING_APPROVAL':
      return 'amber';
    case 'EXPIRED':
    case 'REJECTED':
      return 'red';
    default:
      return 'gray';
  }
}

export function FormStatusBadge({ status, label }: { status: FormStatus; label?: string }) {
  return <Badge tone={formStatusTone(status)}>{label ?? FORM_STATUS_LABEL[status]}</Badge>;
}

const workflow: Record<FormType | 'INTAKE', { tone: Tone; label: string; Icon: typeof Send }> = {
  INTAKE: { tone: 'green', label: 'Intake', Icon: CheckCircle2 },
  ISSUANCE: { tone: 'blue', label: 'Issuance', Icon: Send },
  MOVEMENT: { tone: 'amber', label: 'Movement', Icon: MapPin },
  RETURN: { tone: 'gray', label: 'Return', Icon: Undo2 },
  INDEMNITY: { tone: 'blue', label: 'Indemnity', Icon: ShieldCheck },
};

export function WorkflowChip({ type }: { type: FormType | 'INTAKE' }) {
  const w = workflow[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold',
        toneClass[w.tone],
        w.tone === 'gray' && 'text-gray-700',
      )}
    >
      <w.Icon className="h-3.5 w-3.5" aria-hidden />
      {w.label}
    </span>
  );
}

/** Green asset tag chip, e.g. ECEWS-IT-0001. Links to the asset when `link` is set. */
export function TagChip({ tag, link = false, className }: { tag: string; link?: boolean; className?: string }) {
  const cls = cn(
    'font-tag inline-flex items-center whitespace-nowrap rounded-sm bg-green-100 px-2 py-0.5 text-xs font-semibold text-brand',
    link && 'hover:bg-green-nav hover:underline',
    className,
  );
  return link ? (
    <Link to={`/assets/${tag}`} className={cls}>
      {tag}
    </Link>
  ) : (
    <span className={cls}>{tag}</span>
  );
}

/** Reference chip that links to the form's document (e.g. ISS-0142). */
export function RefChip({ reference, className }: { reference: string; className?: string }) {
  return (
    <Link
      to={`/documents/${reference}`}
      className={cn('font-tag font-semibold text-gray-900 underline-offset-2 hover:text-brand hover:underline', className)}
    >
      {reference}
    </Link>
  );
}
