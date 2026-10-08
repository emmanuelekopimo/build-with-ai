import { MapPin, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { SIGN_LINK_DAYS } from '../../../shared/constants';
import { fmtDate, isoDateWAT } from '../../../shared/format';
import { useAuth } from '../../lib/auth';
import { useMeta, useUnsavedChangesPrompt } from '../../lib/hooks';
import { categoryIcon } from '../../lib/icons';
import type { AssetSummary } from '../../lib/types';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CheckBox, ChipSelect, Field, Select, TextInput } from '../ui/Controls';
import { InfoNote, ItemCard, PersonChip, SectionHeader } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import { AssetPicker, type PickerFor } from './AssetPicker';
import { assetPhrase, EmailPreview, EquipmentList, FormSection } from './Bits';
import { DomainWarning, emptyStaff, emptyVendor, StaffFields, VendorFields, type StaffValue, type VendorValue } from './PersonFields';
import { useFormEditor } from './useFormEditor';

type ToType = 'STAFF' | 'LOCATION' | 'VENDOR';

export interface MovementDraft {
  toType: ToType;
  staff: StaffValue;
  vendor: VendorValue;
  toLocation: string;
  contactName: string;
  contactEmail: string;
  reason: string;
  responsibleOfficer: string;
  movementDate: string;
  expectedReturn: string;
  temporary: boolean;
  ctoName: string;
  ctoEmail: string;
  adminName: string;
  adminEmail: string;
  reinstate: boolean;
}

export function draftFromMovementData(data: Record<string, any>): Partial<MovementDraft> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const to = data.to ?? {};
  return {
    toType: to.type ?? 'STAFF',
    staff: to.type === 'STAFF' ? { ...emptyStaff(), ...to.person } : emptyStaff(),
    vendor: to.type === 'VENDOR' ? { ...emptyVendor(), ...to.vendor } : emptyVendor(),
    toLocation: to.location ?? '',
    contactName: to.contact?.name ?? '',
    contactEmail: to.contact?.email ?? '',
    reason: data.reason ?? '',
    responsibleOfficer: data.responsibleOfficer ?? '',
    movementDate: data.movementDate ?? isoDateWAT(),
    expectedReturn: data.expectedReturn ?? '',
    temporary: data.temporary ?? false,
    ctoName: data.approvers?.cto?.name ?? '',
    ctoEmail: data.approvers?.cto?.email ?? '',
    adminName: data.approvers?.admin?.name ?? '',
    adminEmail: data.approvers?.admin?.email ?? '',
    reinstate: data.reinstate ?? false,
  };
}

export function MovementEditor({
  initial,
  initialAssets,
  saved: savedInitial,
  returnTo,
}: {
  initial: Partial<MovementDraft>;
  initialAssets: AssetSummary[];
  saved: { id: string; reference: string } | null;
  returnTo: string;
}) {
  const { user } = useAuth();
  const meta = useMeta();
  const [d, setD] = useState<MovementDraft>({
    toType: 'STAFF',
    staff: emptyStaff(),
    vendor: emptyVendor(),
    toLocation: '',
    contactName: '',
    contactEmail: '',
    reason: '',
    responsibleOfficer: user ? `${user.name} · ${user.title} · ${user.office}` : '',
    movementDate: isoDateWAT(),
    expectedReturn: '',
    temporary: false,
    ctoName: '',
    ctoEmail: '',
    adminName: '',
    adminEmail: '',
    reinstate: false,
    ...initial,
  });
  const [assets, setAssets] = useState<AssetSummary[]>(initialAssets);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ed = useFormEditor('MOVEMENT', savedInitial, returnTo);
  useUnsavedChangesPrompt(dirty && ed.busy !== 'send');
  const update = (patch: Partial<MovementDraft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };

  const first = assets[0];
  const fromHolder = first?.holder ?? null;
  const fromLabel = first ? (fromHolder ? `${fromHolder.name}${fromHolder.department ? ` · ${fromHolder.department}` : ''} · ${first.location.name}` : `IT Store · ${first.location.name}`) : '';
  const tags = assets.map((a) => a.tag);
  const pickerMode: PickerFor = d.toType === 'STAFF' ? 'MOVEMENT_STAFF' : d.toType === 'VENDOR' ? 'MOVEMENT_VENDOR' : 'MOVEMENT_LOCATION';
  const locations = meta.data?.locations.map((l) => ({ value: l.name, label: l.name })) ?? [];

  const to = () =>
    d.toType === 'STAFF'
      ? { type: 'STAFF' as const, person: { ...d.staff, phone: d.staff.phone || undefined }, location: d.toLocation }
      : d.toType === 'LOCATION'
        ? { type: 'LOCATION' as const, location: d.toLocation, contact: { name: d.contactName, email: d.contactEmail } }
        : { type: 'VENDOR' as const, vendor: { ...d.vendor, phone: d.vendor.phone || undefined } };
  const payload = () => ({
    to: to(),
    reason: d.reason,
    responsibleOfficer: d.responsibleOfficer,
    movementDate: d.movementDate,
    expectedReturn: d.toType === 'VENDOR' || d.temporary ? d.expectedReturn || undefined : undefined,
    temporary: d.toType === 'VENDOR' ? true : d.temporary,
    approvers: { cto: { name: d.ctoName || undefined, email: d.ctoEmail }, admin: { name: d.adminName || undefined, email: d.adminEmail } },
    reinstate: d.reinstate,
  });
  const toLabel = d.toType === 'STAFF' ? `${d.staff.name} · ${d.toLocation}` : d.toType === 'VENDOR' ? d.vendor.company : d.toLocation;

  const signers: Array<{ name: string; sub: string }> = [];
  if (fromHolder && fromHolder.type === 'STAFF') signers.push({ name: fromHolder.name, sub: `${fromHolder.email} · handover confirmation` });
  if (d.toType === 'STAFF' && d.staff.name) signers.push({ name: d.staff.name, sub: `${d.staff.email} · new issuance indemnity` });
  if (d.toType === 'LOCATION' && d.contactName) signers.push({ name: d.contactName, sub: `${d.contactEmail} · confirms at destination` });
  if (d.toType === 'VENDOR' && d.vendor.name) signers.push({ name: d.vendor.name, sub: `${d.vendor.email} · confirms receipt` });

  const openSend = async () => {
    if (!ed.validate(payload(), tags)) return;
    const s = await ed.save(payload(), tags, { quiet: true });
    if (s) {
      setDirty(false);
      setConfirm(true);
    }
  };

  return (
    <>
      {d.reinstate ? (
        <InfoNote icon={RotateCcw} tone="amber" className="mb-5">
          Reinstating {tags.join(', ')} for repair: {tags.length === 1 ? 'it returns' : 'they return'} to Damaged only when you send this movement. If
          you leave without sending, nothing changes.
        </InfoNote>
      ) : null}
      <div className="card overflow-hidden rounded-md border-2 shadow-2" onBlur={(e) => ed.blurValidate(payload(), e)}>
        <FormSection>
          <SectionHeader n={1} title="Transfer details" hint="who is giving up the equipment and who is receiving it" />
          <div className="mb-4">
            <span className="field-label">Destination</span>
            <ChipSelect
              label="Destination type"
              tone="green"
              value={d.toType}
              onChange={(v) => {
                if (d.reinstate) return;
                if (v !== d.toType) setAssets([]);
                update({ toType: v });
              }}
              options={[
                { value: 'STAFF', label: 'Staff member' },
                { value: 'LOCATION', label: 'Office / location' },
                { value: 'VENDOR', label: 'Vendor (repair)' },
              ]}
            />
          </div>
          <div className="grid gap-x-4 gap-y-4 md:grid-cols-3">
            <Field label="From - current holder" htmlFor="from">
              <TextInput id="from" readOnly value={fromLabel} placeholder="Set by the equipment you add" />
            </Field>
            <Field label="From location" htmlFor="fromloc">
              <TextInput id="fromloc" readOnly value={first?.location.name ?? ''} placeholder="Set by the equipment you add" />
            </Field>
            {d.toType !== 'VENDOR' ? (
              <Field label="To location" htmlFor="f-to-location" error={ed.errors['to.location']}>
                <Select id="f-to-location" value={d.toLocation} placeholder="Choose a location" invalid={!!ed.errors['to.location']} onChange={(e) => update({ toLocation: e.target.value })} options={locations} />
              </Field>
            ) : (
              <Field label="Expected return" htmlFor="f-expectedReturn" error={ed.errors.expectedReturn}>
                <TextInput id="f-expectedReturn" type="date" min={isoDateWAT()} value={d.expectedReturn} invalid={!!ed.errors.expectedReturn} onChange={(e) => update({ expectedReturn: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold text-gray-700">{d.toType === 'STAFF' ? 'To - receiving staff member' : d.toType === 'VENDOR' ? 'To - vendor' : 'To - responsible person at the destination'}</div>
            {d.toType === 'STAFF' ? (
              <StaffFields prefix="to.person" value={d.staff} errors={ed.errors} onChange={(staff) => update({ staff })} emailLabel="Email - for the indemnity link" emailHint="They sign a new issuance indemnity" />
            ) : d.toType === 'VENDOR' ? (
              <VendorFields prefix="to.vendor" value={d.vendor} errors={ed.errors} onChange={(vendor) => update({ vendor })} />
            ) : (
              <div className="grid gap-x-4 gap-y-4 md:grid-cols-3">
                <Field label="Full name" htmlFor="f-to-contact-name" error={ed.errors['to.contact.name']}>
                  <TextInput id="f-to-contact-name" value={d.contactName} onChange={(e) => update({ contactName: e.target.value })} />
                </Field>
                <Field label="Email - for the confirmation link" htmlFor="f-to-contact-email" error={ed.errors['to.contact.email']}>
                  <TextInput id="f-to-contact-email" type="email" value={d.contactEmail} onChange={(e) => update({ contactEmail: e.target.value })} />
                  <DomainWarning email={d.contactEmail} />
                </Field>
              </div>
            )}
          </div>
        </FormSection>
        <FormSection>
          <SectionHeader n={2} title="Equipment to transfer" />
          <EquipmentList
            assets={assets}
            error={ed.errors.assetTags}
            addLabel="Add items"
            onAdd={d.reinstate ? undefined : () => setPicker(true)}
            onRemove={d.reinstate ? undefined : (t) => (setAssets((xs) => xs.filter((a) => a.tag !== t)), setDirty(true))}
          />
        </FormSection>
        <FormSection>
          <SectionHeader n={3} title="Reason & handover" />
          <div className="space-y-4">
            <Field label="Reason for transfer" htmlFor="f-reason" error={ed.errors.reason}>
              <TextInput id="f-reason" value={d.reason} invalid={!!ed.errors.reason} onChange={(e) => update({ reason: e.target.value })} />
            </Field>
            <Field label="Responsible IT officer" htmlFor="f-responsibleOfficer" error={ed.errors.responsibleOfficer}>
              <TextInput id="f-responsibleOfficer" value={d.responsibleOfficer} invalid={!!ed.errors.responsibleOfficer} onChange={(e) => update({ responsibleOfficer: e.target.value })} />
            </Field>
            {d.toType === 'STAFF' ? (
              <div className="flex gap-4 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-md">
                <span className="shrink-0 text-gray-500">Indemnity</span>
                <span className="font-semibold text-gray-900">
                  A new <b>issuance indemnity</b> (Form 2) is generated automatically for the receiving staff member.
                  {fromHolder ? ` The existing issuance record for ${fromHolder.name} is closed.` : ''}
                </span>
              </div>
            ) : null}
            {d.toType !== 'VENDOR' ? (
              <div className="flex flex-wrap items-end gap-4">
                <label className="inline-flex items-center gap-2 text-md text-gray-700">
                  <CheckBox checked={d.temporary} onCheckedChange={(v) => update({ temporary: v })} label="Temporary transfer" />
                  Temporary transfer (expected back)
                </label>
                {d.temporary ? (
                  <Field label="Expected return" htmlFor="f-expectedReturn" error={ed.errors.expectedReturn} className="w-[220px]">
                    <TextInput id="f-expectedReturn" type="date" value={d.expectedReturn} onChange={(e) => update({ expectedReturn: e.target.value })} />
                  </Field>
                ) : null}
              </div>
            ) : null}
          </div>
        </FormSection>
        <FormSection last>
          <SectionHeader n={4} title="Signatures" />
          <div className="space-y-4">
            <div className="rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5 text-md font-semibold text-gray-900">
              Enter the email of the CTO and the responsible Admin Officer for approval. The CTO approves first; the Admin Officer is asked next.
            </div>
            <div className="grid gap-x-4 gap-y-4 md:grid-cols-2" data-field="approvers">
              <Field label="CTO - name" optional htmlFor="f-approvers-cto-name">
                <TextInput id="f-approvers-cto-name" value={d.ctoName} onChange={(e) => update({ ctoName: e.target.value })} />
              </Field>
              <Field label="CTO - email" htmlFor="f-approvers-cto-email" error={ed.errors['approvers.cto.email']}>
                <TextInput id="f-approvers-cto-email" type="email" value={d.ctoEmail} invalid={!!ed.errors['approvers.cto.email']} onChange={(e) => update({ ctoEmail: e.target.value })} />
                <DomainWarning email={d.ctoEmail} />
              </Field>
              <Field label="Admin Officer - name" optional htmlFor="f-approvers-admin-name">
                <TextInput id="f-approvers-admin-name" value={d.adminName} onChange={(e) => update({ adminName: e.target.value })} />
              </Field>
              <Field label="Admin Officer - email" htmlFor="f-approvers-admin-email" error={ed.errors['approvers.admin.email']}>
                <TextInput id="f-approvers-admin-email" type="email" value={d.adminEmail} invalid={!!ed.errors['approvers.admin.email']} onChange={(e) => update({ adminEmail: e.target.value })} />
                <DomainWarning email={d.adminEmail} />
              </Field>
            </div>
            {signers.length ? (
              <div className="flex flex-wrap gap-3">
                {signers.map((s) => (
                  <PersonChip key={s.name + s.sub} name={s.name} sub={s.sub} />
                ))}
              </div>
            ) : null}
            <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
              <Field label="Movement date" htmlFor="f-movementDate" error={ed.errors.movementDate}>
                <TextInput id="f-movementDate" type="date" value={d.movementDate} onChange={(e) => update({ movementDate: e.target.value })} />
              </Field>
              <Field label="Recorded by" htmlFor="rb">
                <TextInput id="rb" readOnly value={user ? `${user.name} · ${user.title}` : ''} />
              </Field>
            </div>
          </div>
        </FormSection>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" size="lg" loading={ed.busy === 'save'} onClick={async () => (await ed.save(payload(), tags)) && setDirty(false)}>
          Save draft
        </Button>
        <Button size="lg" className="min-w-[200px]" onClick={() => void openSend()}>
          Send for signatures
        </Button>
      </div>

      <AssetPicker
        open={picker}
        onOpenChange={setPicker}
        mode={pickerMode}
        exclude={tags}
        onAdd={(xs) => {
          setAssets((a) => [...a, ...xs]);
          setDirty(true);
        }}
      />

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Validate & send for signature"
        subtitle={`${ed.saved?.reference ?? ''} · ${assets.map((a) => a.makeModel).join(', ')} · ${first?.location.name ?? ''} → ${toLabel} · reason: ${d.reason}`}
        footer={
          <>
            <Button variant="outline" size="lg" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button size="lg" icon={<MapPin className="h-4 w-4" />} loading={ed.busy === 'send'} onClick={() => void ed.send(payload(), tags, 'sent to the CTO for approval', tags.join(','))}>
              Send movement confirmation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Signers</div>
            <div className="flex flex-wrap gap-3">
              {signers.map((s) => (
                <PersonChip key={s.name + s.sub} name={s.name} sub={s.sub} />
              ))}
              {user ? <PersonChip name={user.name} sub="IT · recorded, no email" /> : null}
            </div>
            <p className="mt-2 text-sm text-gray-400">Signers receive their links after the CTO and Admin Officer approve. IT is recorded (no email).</p>
          </div>
          {assets.map((a) => (
            <ItemCard
              key={a.tag}
              icon={categoryIcon(a.category.icon)}
              title={a.makeModel}
              sub={`${a.tag}${a.serial ? ` · SN ${a.serial}` : ''} · ${a.location.name}`}
              right={<StatusBadge status={a.status} inRepair={a.inRepair} />}
            />
          ))}
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Email preview</div>
            <EmailPreview subject={`Please confirm: ${ed.saved?.reference ?? ''} - Equipment movement`} button="Review & confirm">
              <p>
                From <b className="text-gray-800">ECEWS IT Department</b> · confirm the transfer of {assetPhrase(assets)} from <b className="text-gray-800">{first?.location.name}</b> to{' '}
                <b className="text-gray-800">{toLabel}</b>.
              </p>
              <p>No account or login is needed - the link opens the movement record for your typed confirmation.</p>
            </EmailPreview>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Deadline" htmlFor="dl2">
              <TextInput id="dl2" readOnly value={fmtDate(new Date(Date.now() + SIGN_LINK_DAYS * 86400000))} />
            </Field>
            <Field label="Signing method" htmlFor="sm2">
              <TextInput id="sm2" readOnly value="Typed e-signature" />
            </Field>
          </div>
          <InfoNote icon={MapPin}>
            {d.toType === 'VENDOR'
              ? 'Status stays Damaged — the asset shows Under Repair once both approvals are in. The link is single-use; a reminder is auto-sent after 48h.'
              : 'Status stays the same — only the location, holder and the chain-of-custody timeline change. The CTO approves first, then the Admin Officer; links are single-use and a reminder is auto-sent after 48h.'}
          </InfoNote>
        </div>
      </Modal>
    </>
  );
}
