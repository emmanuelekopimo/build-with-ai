import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldCheck, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CONDITION_LABEL, CONDITIONS, isWorkingCondition, type Condition } from '../../../shared/constants';
import { fmtDate, isoDateWAT } from '../../../shared/format';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useUnsavedChangesPrompt } from '../../lib/hooks';
import { categoryIcon } from '../../lib/icons';
import type { AssetList, AssetSummary } from '../../lib/types';
import { StatusBadge, TagChip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChipSelect, Field, Select, TextInput } from '../ui/Controls';
import { InfoNote, ItemCard, PersonChip, SectionHeader } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import { AssetPicker } from './AssetPicker';
import { EmailPreview, EquipmentList, FormSection } from './Bits';
import { emptyStaff, emptyVendor, staffFromPerson, StaffFields, VendorFields, type StaffValue, type VendorValue } from './PersonFields';
import { useFormEditor } from './useFormEditor';

export interface ReturnDraft {
  returnerType: 'STAFF' | 'VENDOR';
  staff: StaffValue;
  vendor: VendorValue;
  conditions: Record<string, Condition>;
  conditionNotes: string;
  returnDate: string;
}

export function draftFromReturnData(data: Record<string, unknown>): Partial<ReturnDraft> {
  const type = data.returnerType === 'VENDOR' ? 'VENDOR' : 'STAFF';
  const r = (data.returner ?? {}) as Record<string, string>;
  const items = (data.items ?? []) as Array<{ tag: string; condition: Condition }>;
  return {
    returnerType: type,
    staff: type === 'STAFF' ? { ...emptyStaff(), ...r } : emptyStaff(),
    vendor: type === 'VENDOR' ? { ...emptyVendor(), ...r } : emptyVendor(),
    conditions: Object.fromEntries(items.map((i) => [i.tag, i.condition])),
    conditionNotes: (data.conditionNotes as string) ?? '',
    returnDate: (data.returnDate as string) ?? isoDateWAT(),
  };
}

export function ReturnEditor({
  initial,
  initialAssets,
  saved: savedInitial,
  returnTo,
}: {
  initial: Partial<ReturnDraft>;
  initialAssets: AssetSummary[];
  saved: { id: string; reference: string } | null;
  returnTo: string;
}) {
  const { user } = useAuth();
  const [d, setD] = useState<ReturnDraft>({
    returnerType: initial.returnerType ?? 'STAFF',
    staff: initial.staff ?? emptyStaff(),
    vendor: initial.vendor ?? emptyVendor(),
    conditions: initial.conditions ?? {},
    conditionNotes: initial.conditionNotes ?? '',
    returnDate: initial.returnDate ?? isoDateWAT(),
  });
  const [assets, setAssets] = useState<AssetSummary[]>(initialAssets);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ed = useFormEditor('RETURN', savedInitial, returnTo);
  useUnsavedChangesPrompt(dirty && ed.busy !== 'send');
  const update = (patch: Partial<ReturnDraft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };

  // Prefill the returner from the first asset's holder (not every asset they hold — UX rule).
  const holder = assets[0]?.holder ?? null;
  useEffect(() => {
    if (!holder) return;
    if (holder.type === 'VENDOR' && !d.vendor.email) {
      setD((x) => ({ ...x, returnerType: 'VENDOR', vendor: { company: holder.company ?? '', name: holder.name, email: holder.email, phone: '' } }));
    } else if (holder.type === 'STAFF' && !d.staff.email) {
      setD((x) => ({ ...x, returnerType: 'STAFF', staff: { ...staffFromPerson(holder), phone: '' } }));
    }
  }, [holder, d.staff.email, d.vendor.email]);

  const mode = d.returnerType === 'STAFF' ? 'RETURN_STAFF' : 'RETURN_VENDOR';
  const tags = assets.map((a) => a.tag);
  const suggested = useQuery({
    queryKey: ['suggested', holder?.id, mode],
    queryFn: () => api<AssetList>(`/assets${qs({ for: mode, holder: holder!.id, pageSize: 20 })}`),
    enabled: !!holder,
  });
  const suggestions = (suggested.data?.items ?? []).filter((a) => !tags.includes(a.tag) && a.available !== false);

  const payload = () => ({
    returnerType: d.returnerType,
    returner: d.returnerType === 'STAFF' ? { ...d.staff, phone: undefined } : { ...d.vendor, phone: d.vendor.phone || undefined },
    items: assets.map((a) => ({ tag: a.tag, condition: d.conditions[a.tag] })),
    conditionNotes: d.conditionNotes || undefined,
    returnDate: d.returnDate,
  });
  const returnerName = d.returnerType === 'STAFF' ? d.staff.name : d.vendor.name;
  const returnerEmail = d.returnerType === 'STAFF' ? d.staff.email : d.vendor.email;

  const openSend = async () => {
    const fields: Record<string, string> = {};
    for (const a of assets) if (!d.conditions[a.tag]) fields[`condition.${a.tag}`] = `Assess the condition of ${a.tag}.`;
    if (Object.keys(fields).length) return ed.showErrors(fields);
    if (!ed.validate(payload(), tags)) return;
    const s = await ed.save(payload(), tags, { quiet: true });
    if (s) {
      setDirty(false);
      setConfirm(true);
    }
  };

  return (
    <>
      <div className="card overflow-hidden rounded-md border-2 shadow-2">
        <FormSection>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader n={1} title={d.returnerType === 'STAFF' ? 'Returning staff member' : 'Returning vendor'} hint={d.returnerType === 'STAFF' ? 'the person who had the equipment' : 'the vendor bringing repaired items back'} />
            <ChipSelect
              label="Returner type"
              tone="green"
              value={d.returnerType}
              onChange={(v) => {
                if (v !== d.returnerType && assets.length) setAssets([]);
                update({ returnerType: v, conditions: {} });
              }}
              options={[
                { value: 'STAFF', label: 'Staff' },
                { value: 'VENDOR', label: 'Vendor' },
              ]}
            />
          </div>
          {d.returnerType === 'STAFF' ? (
            <StaffFields
              prefix="returner"
              value={d.staff}
              errors={ed.errors}
              onChange={(staff) => update({ staff })}
              emailLabel="Email - for the return confirmation"
              emailHint="They receive a confirmation email to sign, acknowledging the return"
              showPhone={false}
            />
          ) : (
            <VendorFields prefix="returner" value={d.vendor} errors={ed.errors} onChange={(vendor) => update({ vendor })} />
          )}
        </FormSection>
        <FormSection>
          <SectionHeader n={2} title="Equipment being returned" />
          <EquipmentList
            assets={assets}
            error={ed.errors.assetTags}
            addLabel={d.returnerType === 'STAFF' ? 'Add issued items' : 'Add items in repair'}
            onAdd={() => setPicker(true)}
            sub={(a) => `${a.tag}${a.serial ? ` · SN ${a.serial}` : ''}${a.holder ? ` · held by ${a.holder.name}` : ''}`}
            onRemove={(t) => {
              setAssets((xs) => xs.filter((a) => a.tag !== t));
              setDirty(true);
            }}
          />
          {suggestions.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-gray-600">Suggested: other assets in {holder?.name}’s custody</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((a) => (
                  <button
                    key={a.tag}
                    type="button"
                    onClick={() => {
                      setAssets((xs) => [...xs, a]);
                      setDirty(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-pill border-2 border-dashed border-green-200 bg-white py-1 pl-2 pr-3 text-sm text-gray-700 hover:bg-green-bg"
                  >
                    <Plus className="h-3.5 w-3.5 text-brand" aria-hidden />
                    <TagChip tag={a.tag} /> {a.makeModel}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </FormSection>
        <FormSection last>
          <SectionHeader n={3} title="Condition assessment - IT evaluates on receipt" />
          <div className="space-y-4">
            {assets.length === 0 ? <p className="text-md text-gray-500">Add the returned items above, then assess each one here.</p> : null}
            {assets.map((a) => (
              <div key={a.tag} id={`f-condition-${a.tag}`}>
                <ItemCard
                  icon={categoryIcon(a.category.icon)}
                  title={a.makeModel}
                  sub={a.tag}
                  right={
                    <Select
                      aria-label={`Condition of ${a.tag}`}
                      className="h-12 w-[160px]"
                      value={d.conditions[a.tag] ?? ''}
                      invalid={!!ed.errors[`condition.${a.tag}`]}
                      placeholder="Choose condition"
                      onChange={(e) => update({ conditions: { ...d.conditions, [a.tag]: e.target.value as Condition } })}
                      options={CONDITIONS.map((c) => ({ value: c, label: c === 'DAMAGED' ? 'Damaged' : `${CONDITION_LABEL[c]} condition` }))}
                    />
                  }
                />
                {ed.errors[`condition.${a.tag}`] ? <p className="mt-1 text-sm text-red">{ed.errors[`condition.${a.tag}`]}</p> : null}
              </div>
            ))}
            <Field label="Condition notes" optional htmlFor="f-conditionNotes">
              <TextInput id="f-conditionNotes" value={d.conditionNotes} onChange={(e) => update({ conditionNotes: e.target.value })} />
            </Field>
          </div>
        </FormSection>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" size="lg" loading={ed.busy === 'save'} onClick={async () => (await ed.save(payload(), tags)) && setDirty(false)}>
          Save draft
        </Button>
        <Button size="lg" className="min-w-[168px]" onClick={() => void openSend()}>
          Confirm return
        </Button>
      </div>

      <AssetPicker
        open={picker}
        onOpenChange={setPicker}
        mode={mode}
        exclude={tags}
        holderId={holder?.id}
        onAdd={(xs) => {
          setAssets((a) => [...a, ...xs]);
          setDirty(true);
        }}
      />

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Confirm return"
        subtitle={`${ed.saved?.reference ?? ''} · ${assets.length} asset${assets.length === 1 ? '' : 's'} from ${returnerName} selected for return`}
        footer={
          <>
            <Button variant="outline" size="lg" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button size="lg" icon={<Undo2 className="h-4 w-4" />} loading={ed.busy === 'send'} onClick={() => void ed.send(payload(), tags, 'sent for return confirmation', tags.join(','))}>
              Send return confirmation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Signers</div>
            <div className="flex flex-wrap gap-3">
              <PersonChip name={returnerName} sub={returnerEmail} />
              {user ? <PersonChip name={user.name} sub="received by IT · no email" /> : null}
            </div>
            <p className="mt-2 text-sm text-gray-400">First chip = person returning (signs). Second = IT receiver (recorded, no email).</p>
          </div>
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Returning items &amp; resulting status</div>
            <div className="space-y-3">
              {assets.map((a) => {
                const c = d.conditions[a.tag];
                return (
                  <ItemCard
                    key={a.tag}
                    icon={categoryIcon(a.category.icon)}
                    title={`${a.makeModel} · ${c ? CONDITION_LABEL[c] : ''}`}
                    sub={`${a.tag}${a.serial ? ` · SN ${a.serial}` : ''}`}
                    right={c ? <StatusBadge status={isWorkingCondition(c) ? 'IN_STORE' : 'DAMAGED'} /> : null}
                  />
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Email preview</div>
            <EmailPreview subject={`Please confirm: ${ed.saved?.reference ?? ''} - Return confirmation`} button="Review & confirm">
              <p>
                From <b className="text-gray-800">ECEWS IT Department</b> · confirm the {assets.length} item{assets.length === 1 ? '' : 's'} below{' '}
                {assets.length === 1 ? 'was' : 'were'} received back by IT on <b className="text-gray-800">{fmtDate(d.returnDate)}</b>.
              </p>
              <p>No account or login is needed - the link opens the return form for your typed signature.</p>
            </EmailPreview>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Return date" htmlFor="f-returnDate" error={ed.errors.returnDate}>
              <TextInput id="f-returnDate" type="date" max={isoDateWAT()} value={d.returnDate} onChange={(e) => update({ returnDate: e.target.value })} />
            </Field>
            <Field label="Received by" htmlFor="rb">
              <TextInput id="rb" readOnly value={`${user?.name ?? ''} · IT`} />
            </Field>
          </div>
          <InfoNote icon={ShieldCheck}>
            Good and Fair items return to In Store. Poor and Damaged items are recorded as Damaged — the timeline records each change once{' '}
            {returnerName || 'the returner'} signs.
          </InfoNote>
        </div>
      </Modal>
    </>
  );
}
