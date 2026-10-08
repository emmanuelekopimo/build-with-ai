import * as Checkbox from '@radix-ui/react-checkbox';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Minus, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { CheckAnswer } from '../../../shared/constants';
import { cn } from '../../lib/cn';

/** Segmented tabs with optional counts (Sign-offs, Issuances). Rendered as a tablist. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div
      role="tablist"
      className={cn('flex flex-wrap items-center gap-1 rounded-md border-2 border-gray-200 bg-white p-1 shadow-1', className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-sm px-4 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              size === 'lg' ? 'h-9 min-w-[100px] justify-center px-6 text-md' : 'h-8 text-md',
              active ? 'bg-brand font-semibold text-white shadow-1' : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            {it.label}
            {it.count !== undefined ? (
              <span
                className={cn(
                  'rounded-pill px-1.5 text-2xs font-semibold',
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
                )}
              >
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-gray-100 py-1 pl-3 pr-2 text-sm font-medium text-gray-700">
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove filter ${label}`}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

export interface FilterOption {
  value: string;
  label: string;
  sub?: string;
}

/** "Category: All" pill that opens a popover list. Highlights green when active. */
export function FilterSelect({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  allLabel = 'All',
  accent,
}: {
  label: string;
  icon: LucideIcon;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  accent?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  const active = Boolean(value) || accent;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-pill border-2 px-4 text-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            active ? 'border-green-200 bg-green-100 text-brand' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}: {current?.label ?? allLabel}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[320px] min-w-[220px] overflow-y-auto rounded-md border border-gray-200 bg-white p-1.5 shadow-3"
        >
          {[{ value: '', label: allLabel } as FilterOption, ...options].map((o) => (
            <Popover.Close asChild key={o.value || '__all'}>
              <button
                type="button"
                onClick={() => onChange(o.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-md hover:bg-gray-50',
                  o.value === value && 'font-semibold text-brand',
                )}
              >
                <span>
                  {o.label}
                  {o.sub ? <span className="ml-2 text-xs font-normal text-gray-500">{o.sub}</span> : null}
                </span>
                {o.value === value ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; containerClassName?: string }
>(function SearchInput({ label = 'Search', className, containerClassName, ...rest }, ref) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        className={cn(
          'h-9 w-full rounded-pill border-2 border-gray-200 bg-white pl-10 pr-4 text-md text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
          className,
        )}
        {...rest}
      />
    </div>
  );
});

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-pill border-2 border-green-200" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="inline-flex h-7 w-7 items-center justify-center bg-green-100 text-brand disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="inline-flex h-7 w-8 items-center justify-center border-x-2 border-green-200 text-md font-semibold">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="inline-flex h-7 w-7 items-center justify-center bg-green-100 text-brand disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Checklist radio group (Form 1): Yes / No / N/A segmented pill. */
export function YesNoNa({
  value,
  onChange,
  name,
  label,
  disabled,
}: {
  value: CheckAnswer | null;
  onChange: (v: CheckAnswer) => void;
  name: string;
  label: string;
  disabled?: boolean;
}) {
  const opts: Array<[CheckAnswer, string]> = [
    ['YES', 'Yes'],
    ['NO', 'No'],
    ['NA', 'N/A'],
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-pill bg-gray-100 p-0.5">
      {opts.map(([v, text]) => {
        const checked = value === v;
        return (
          <label
            key={v}
            className={cn(
              'relative inline-flex h-7 min-w-[48px] cursor-pointer items-center justify-center rounded-pill px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand',
              checked && v === 'YES' && 'bg-green-100 font-semibold text-brand',
              checked && v === 'NO' && 'bg-red-light font-semibold text-red',
              checked && v === 'NA' && 'bg-white font-semibold text-gray-900 shadow-1',
              !checked && 'text-gray-500 hover:text-gray-800',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={v}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(v)}
            />
            {text}
          </label>
        );
      })}
    </div>
  );
}

/** Pill chip selector (Report damage condition, line item result, returner type). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = 'red',
}: {
  options: Array<{ value: T; label: string; tone?: 'red' | 'green' | 'amber' | 'blue' }>;
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  tone?: 'red' | 'green' | 'amber' | 'blue';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = o.value === value;
        const t = o.tone ?? tone;
        return (
          <label
            key={o.value}
            className={cn(
              'inline-flex h-8 cursor-pointer items-center rounded-pill border-2 px-4 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand',
              !checked && 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              checked && t === 'red' && 'border-red bg-red-light font-semibold text-red',
              checked && t === 'green' && 'border-brand bg-green-100 font-semibold text-brand',
              checked && t === 'amber' && 'border-amber bg-amber-light font-semibold text-amber',
              checked && t === 'blue' && 'border-blue bg-blue-light font-semibold text-blue',
            )}
          >
            <input type="radio" className="sr-only" checked={checked} onChange={() => onChange(o.value)} value={o.value} />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Labelled field wrapper with inline error and hint. */
export function Field({
  label,
  error,
  hint,
  optional,
  required,
  children,
  className,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {optional ? ' (optional)' : null}
        {required ? (
          <span className="text-red" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red" role="alert">
          {error}
        </p>
      ) : hint ? (
        <div className="mt-1 text-sm leading-[1.4] text-gray-400">{hint}</div>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn('input', invalid && 'input-error', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn('input h-auto min-h-[64px] py-2.5 leading-[1.45]', invalid && 'input-error', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options: Array<{ value: string; label: string }>; placeholder?: string }
>(function Select({ className, invalid, options, placeholder, ...rest }, ref) {
  return (
    <select ref={ref} className={cn('input appearance-auto pr-8', invalid && 'input-error', className)} aria-invalid={invalid || undefined} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export function CheckBox({
  checked,
  onCheckedChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Checkbox.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-2 border-gray-300 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
    >
      <Checkbox.Indicator>
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

/** Checkbox card (export scope, terms, reminders list). */
export function CheckCard({
  checked,
  onCheckedChange,
  title,
  description,
  right,
  highlight = false,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  highlight?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3.5',
        highlight && checked ? 'border-brand bg-green-bg' : 'border-gray-200 bg-gray-50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="pt-0.5">
        <CheckBox id={id} checked={checked} onCheckedChange={onCheckedChange} label={typeof title === 'string' ? title : 'Select'} disabled={disabled} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-md font-semibold text-gray-900">{title}</span>
        {description ? <span className="mt-0.5 block text-sm text-gray-500">{description}</span> : null}
      </span>
      {right ? <span className="shrink-0 self-center">{right}</span> : null}
    </label>
  );
}

/** Radio card (export format). */
export function ChoiceCard({
  checked,
  onSelect,
  title,
  description,
  name,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  name: string;
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col rounded-md border-2 px-4 py-3.5 focus-within:ring-2 focus-within:ring-brand',
        checked ? 'border-brand bg-green-bg shadow-[0_0_0_4px_rgb(var(--green-100))]' : 'border-gray-200 bg-white hover:bg-gray-50',
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onSelect} />
      <span className="flex items-center justify-between">
        <span className="text-md font-bold text-gray-900">{title}</span>
        <span
          className={cn(
            'inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2',
            checked ? 'border-brand' : 'border-gray-300',
          )}
          aria-hidden
        >
          {checked ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
        </span>
      </span>
      <span className="mt-1.5 text-sm leading-[1.45] text-gray-500">{description}</span>
    </label>
  );
}
