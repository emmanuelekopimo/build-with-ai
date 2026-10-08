import { ArrowLeft, Box, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { initials } from '../../../shared/format';
import { cn } from '../../lib/cn';

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to?: string; label: string; onClick?: () => void };
}) {
  return (
    <header className="mb-5">
      {back?.onClick ? (
        <button type="button" onClick={back.onClick} className="mb-2 inline-flex items-center gap-2 text-md text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </button>
      ) : back?.to ? (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-2 text-md text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-gray-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-md text-gray-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

export type KpiTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';
const kpiIcon: Record<KpiTone, string> = {
  green: 'bg-green-100 text-brand',
  blue: 'bg-blue-light text-blue',
  amber: 'bg-amber-light text-amber',
  red: 'bg-red-light text-red',
  gray: 'bg-gray-100 text-gray-600',
};

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  subTone,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tone: KpiTone;
  subTone?: 'green' | 'muted';
  loading?: boolean;
}) {
  return (
    <div className="card rounded-md border-2 px-5 py-5 shadow-2">
      <div className="flex items-start justify-between gap-3">
        <span className="pt-1.5 text-sm text-gray-600">{label}</span>
        <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-sm', kpiIcon[tone])} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-9 w-16" />
      ) : (
        <div className="mt-1 text-kpi font-extrabold text-gray-900">{value}</div>
      )}
      {sub ? (
        <div className={cn('mt-1.5 text-sm', subTone === 'green' ? 'font-medium text-brand' : 'text-gray-500')}>{sub}</div>
      ) : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('card rounded-md border-2 shadow-2', className)}>{children}</section>;
}

export function CardHeader({ title, actions, className }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-4', className)}>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {actions}
    </div>
  );
}

/** Numbered form section header: green square with the step number. */
export function SectionHeader({ n, title, hint }: { n: number; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-green-100 text-xs font-bold text-brand" aria-hidden>
        {n}
      </span>
      <h2 className="text-md font-semibold text-gray-900">{title}</h2>
      {hint ? <span className="text-sm text-gray-500">{hint}</span> : null}
    </div>
  );
}

/** Dashed info note used inside modals and drawers. */
export function InfoNote({
  icon: Icon = Info,
  children,
  className,
  tone = 'gray',
}: {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  tone?: 'gray' | 'red' | 'amber';
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-md border-2 border-dashed px-4 py-3 text-sm leading-[1.55]',
        tone === 'gray' && 'border-gray-300 bg-gray-50 text-gray-500',
        tone === 'red' && 'border-red/40 bg-red-light text-red',
        tone === 'amber' && 'border-amber/40 bg-amber-light text-gray-700',
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Dashed empty state ("No assets assigned" style). */
export function EmptyState({
  icon: Icon = Box,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-brand" aria-hidden>
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-lg font-semibold text-gray-900">{title}</p>
      {description ? <p className="mt-2 max-w-[340px] text-md text-gray-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-red/40 bg-red-light px-6 py-10 text-center">
      <p className="text-md font-semibold text-red">Could not load this</p>
      <p className="mt-1 max-w-[420px] text-md text-gray-600">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 text-md font-semibold text-brand underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-brand',
        size === 'sm' ? 'h-7 w-7 text-2xs' : 'h-9 w-9 text-xs',
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Rounded chip with initials avatar, name and a sub line (signers, recipients). */
export function PersonChip({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-pill border-2 border-gray-200 bg-white py-2 pl-2.5 pr-5">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">{name}</div>
        {sub ? <div className="truncate text-xs text-gray-500">{sub}</div> : null}
      </div>
    </div>
  );
}

/** Asset card used in forms, drawers and modals (icon tile, title, sub line, right slot). */
export function ItemCard({
  icon: Icon,
  title,
  sub,
  right,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-md border-2 border-gray-200 bg-gray-50 px-3.5 py-3', className)}>
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-white text-brand" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-md font-semibold text-gray-900">{title}</div>
        {sub ? <div className="truncate text-sm text-gray-500">{sub}</div> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** Key/value summary box (drawer header, intake snapshot). */
export function KeyValueBox({ rows, className }: { rows: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('space-y-1.5 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-4', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-md">
          <dt className="text-gray-600">{k}</dt>
          <dd className="text-right font-semibold text-gray-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />;
}
