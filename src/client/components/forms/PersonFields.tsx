import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ORG_EMAIL_DOMAIN } from '../../../shared/constants';
import { api, qs } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import type { PersonRef } from '../../lib/types';
import { Field, TextInput } from '../ui/Controls';

export interface StaffValue {
  name: string;
  department: string;
  staffId: string;
  email: string;
  phone?: string;
  position?: string;
}
export interface VendorValue {
  company: string;
  name: string;
  email: string;
  phone?: string;
}
export const emptyStaff = (): StaffValue => ({ name: '', department: '', staffId: '', email: '', phone: '' });
export const emptyVendor = (): VendorValue => ({ company: '', name: '', email: '', phone: '' });

export function staffFromPerson(p: PersonRef): StaffValue {
  return { name: p.name, department: p.department ?? '', staffId: p.staffId ?? '', email: p.email, position: p.position ?? undefined };
}

/** Amber note for non-ECEWS addresses (warn, never block — UX decision 7). */
export function DomainWarning({ email }: { email: string }) {
  const at = email.trim().toLowerCase().split('@')[1];
  if (!at || at === ORG_EMAIL_DOMAIN || !/\./.test(at)) return null;
  return <p className="mt-1 text-sm text-amber">This is not an @{ORG_EMAIL_DOMAIN} address — check it before sending.</p>;
}

/** Name input with typeahead over previously entered people; picking one autofills the rest. */
export function PersonTypeahead({
  id,
  value,
  onChange,
  onPick,
  type,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (p: PersonRef) => void;
  type: 'STAFF' | 'VENDOR';
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useDebounced(value, 200);
  const people = useQuery({
    queryKey: ['people', type, q],
    queryFn: () => api<{ people: PersonRef[] }>(`/people${qs({ q, type })}`),
    enabled: open && q.trim().length >= 2,
  });
  const list = people.data?.people ?? [];
  return (
    <Popover.Root open={open && list.length > 0} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <TextInput
          id={id}
          value={value}
          invalid={invalid}
          autoComplete="off"
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] rounded-md border border-gray-200 bg-white p-1 shadow-3"
        >
          <ul role="listbox" aria-label="Previously entered people">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full rounded-sm px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                >
                  <span className="block text-md font-medium text-gray-900">{p.name}</span>
                  <span className="block text-xs text-gray-500">
                    {[p.type === 'VENDOR' ? p.company : p.department, p.staffId, p.email].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

type Errors = Record<string, string | undefined>;

export function StaffFields({
  value,
  onChange,
  errors,
  prefix,
  emailLabel,
  emailHint,
  showPhone = true,
}: {
  value: StaffValue;
  onChange: (v: StaffValue) => void;
  errors: Errors;
  prefix: string;
  emailLabel: string;
  emailHint: string;
  showPhone?: boolean;
}) {
  const e = (k: string) => errors[`${prefix}.${k}`];
  const set = (patch: Partial<StaffValue>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-x-4 gap-y-4 md:grid-cols-3">
      <Field label="Full name" htmlFor={`f-${prefix}-name`} error={e('name')}>
        <PersonTypeahead
          id={`f-${prefix}-name`}
          type="STAFF"
          value={value.name}
          invalid={!!e('name')}
          onChange={(name) => set({ name })}
          onPick={(p) => onChange({ ...value, ...staffFromPerson(p), phone: value.phone })}
        />
      </Field>
      <Field label="Department" htmlFor={`f-${prefix}-department`} error={e('department')}>
        <TextInput id={`f-${prefix}-department`} value={value.department} invalid={!!e('department')} onChange={(ev) => set({ department: ev.target.value })} />
      </Field>
      <Field label="Staff ID" htmlFor={`f-${prefix}-staffId`} error={e('staffId')}>
        <TextInput id={`f-${prefix}-staffId`} value={value.staffId} invalid={!!e('staffId')} onChange={(ev) => set({ staffId: ev.target.value })} />
      </Field>
      <Field label={emailLabel} htmlFor={`f-${prefix}-email`} error={e('email')} hint={emailHint}>
        <TextInput id={`f-${prefix}-email`} type="email" value={value.email} invalid={!!e('email')} onChange={(ev) => set({ email: ev.target.value })} />
        <DomainWarning email={value.email} />
      </Field>
      {showPhone ? (
        <Field label="Phone" optional htmlFor={`f-${prefix}-phone`} error={e('phone')}>
          <TextInput id={`f-${prefix}-phone`} type="tel" value={value.phone ?? ''} onChange={(ev) => set({ phone: ev.target.value })} />
        </Field>
      ) : null}
    </div>
  );
}

export function VendorFields({ value, onChange, errors, prefix }: { value: VendorValue; onChange: (v: VendorValue) => void; errors: Errors; prefix: string }) {
  const e = (k: string) => errors[`${prefix}.${k}`];
  const set = (patch: Partial<VendorValue>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-x-4 gap-y-4 md:grid-cols-3">
      <Field label="Vendor company" htmlFor={`f-${prefix}-company`} error={e('company')}>
        <PersonTypeahead
          id={`f-${prefix}-company`}
          type="VENDOR"
          value={value.company}
          invalid={!!e('company')}
          onChange={(company) => set({ company })}
          onPick={(p) => onChange({ company: p.company ?? '', name: p.name, email: p.email, phone: value.phone })}
        />
      </Field>
      <Field label="Contact name" htmlFor={`f-${prefix}-name`} error={e('name')}>
        <TextInput id={`f-${prefix}-name`} value={value.name} invalid={!!e('name')} onChange={(ev) => set({ name: ev.target.value })} />
      </Field>
      <Field label="Email - for the confirmation link" htmlFor={`f-${prefix}-email`} error={e('email')}>
        <TextInput id={`f-${prefix}-email`} type="email" value={value.email} invalid={!!e('email')} onChange={(ev) => set({ email: ev.target.value })} />
      </Field>
      <Field label="Phone" optional htmlFor={`f-${prefix}-phone`}>
        <TextInput id={`f-${prefix}-phone`} type="tel" value={value.phone ?? ''} onChange={(ev) => set({ phone: ev.target.value })} />
      </Field>
    </div>
  );
}
