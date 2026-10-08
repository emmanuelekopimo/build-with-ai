import { Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ISSUANCE_TERMS, SIGN_LINK_DAYS, TERMS_INTRO } from '../../../shared/constants';
import { fmtDate } from '../../../shared/format';
import { useAuth } from '../../lib/auth';
import { useUnsavedChangesPrompt } from '../../lib/hooks';
import type { AssetSummary } from '../../lib/types';
import { Button } from '../ui/Button';
import { CheckBox, Field, TextInput } from '../ui/Controls';
import { InfoNote, PersonChip, SectionHeader } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import { AssetPicker } from './AssetPicker';
import { assetPhrase, EmailPreview, EquipmentList, FormSection } from './Bits';
import { emptyStaff, StaffFields, type StaffValue } from './PersonFields';
import { useFormEditor } from './useFormEditor';

export interface IssuanceDraft {
  recipient: StaffValue;
  temporary: boolean;
  expectedReturn?: string;
}

export function IssuanceEditor({
  initial,
  initialAssets,
  saved: savedInitial,
  returnTo,
}: {
  initial: Partial<IssuanceDraft>;
  initialAssets: AssetSummary[];
  saved: { id: string; reference: string } | null;
  returnTo: string;
}) {
  const { user } = useAuth();
  const [d, setD] = useState<IssuanceDraft>({ recipient: { ...emptyStaff(), ...initial.recipient }, temporary: initial.temporary ?? false, expectedReturn: initial.expectedReturn });
  const [assets, setAssets] = useState<AssetSummary[]>(initialAssets);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ed = useFormEditor('ISSUANCE', savedInitial, returnTo);
  useUnsavedChangesPrompt(dirty && ed.busy !== 'send');

  const update = (patch: Partial<IssuanceDraft>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const payload = () => ({
    recipient: { ...d.recipient, phone: d.recipient.phone || undefined },
    temporary: d.temporary,
    expectedReturn: d.temporary && d.expectedReturn ? d.expectedReturn : undefined,
  });
  const tags = assets.map((a) => a.tag);
  const deadline = new Date(Date.now() + SIGN_LINK_DAYS * 86400000);

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
      <div className="card overflow-hidden rounded-md border-2 shadow-2">
        <FormSection>
          <SectionHeader n={1} title="Recipient - the person signing" hint="signature link goes to their email" />
          <StaffFields
            prefix="recipient"
            value={d.recipient}
            errors={ed.errors}
            onChange={(recipient) => update({ recipient })}
            emailLabel="Email - for the signature link"
            emailHint="Outside IT, no account needed - they sign straight from the email"
          />
        </FormSection>
        <FormSection>
          <SectionHeader n={2} title="Equipment - select from assets In Store" />
          <EquipmentList
            assets={assets}
            error={ed.errors.assetTags}
            addLabel="Add from In Store"
            onAdd={() => setPicker(true)}
            onRemove={(t) => {
              setAssets((xs) => xs.filter((a) => a.tag !== t));
              setDirty(true);
            }}
          />
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="inline-flex items-center gap-2 text-md text-gray-700">
              <CheckBox checked={d.temporary} onCheckedChange={(v) => update({ temporary: v })} label="Temporary issuance" />
              Temporary issuance (expected back)
            </label>
            {d.temporary ? (
              <Field label="Expected return" htmlFor="f-expectedReturn" error={ed.errors.expectedReturn} className="w-[220px]">
                <TextInput id="f-expectedReturn" type="date" value={d.expectedReturn ?? ''} onChange={(e) => update({ expectedReturn: e.target.value })} />
              </Field>
            ) : null}
          </div>
        </FormSection>
        <FormSection last>
          <SectionHeader n={3} title="Terms & indemnity - included in the signature document" />
          <div className="space-y-3 text-md leading-[1.55] text-gray-800">
            <p>{TERMS_INTRO}</p>
            {ISSUANCE_TERMS.map((t) => (
              <p key={t.title}>
                <b>{t.title}:</b> {t.text}
              </p>
            ))}
          </div>
        </FormSection>
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" size="lg" loading={ed.busy === 'save'} onClick={async () => (await ed.save(payload(), tags)) && setDirty(false)}>
          Save draft
        </Button>
        <Button size="lg" className="min-w-[192px]" onClick={() => void openSend()} loading={ed.busy === 'save' && !dirty}>
          Send for signature
        </Button>
      </div>

      <AssetPicker
        open={picker}
        onOpenChange={setPicker}
        mode="ISSUANCE"
        exclude={tags}
        onAdd={(xs) => {
          setAssets((a) => [...a, ...xs]);
          setDirty(true);
        }}
      />

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Send for signature"
        subtitle={`${ed.saved?.reference ?? ''} · a secure email goes to the recipient with a link to review and sign`}
        footer={
          <>
            <Button variant="outline" size="lg" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button size="lg" icon={<Send className="h-4 w-4" />} loading={ed.busy === 'send'} onClick={() => void ed.send(payload(), tags, 'sent for signature', tags.join(','))}>
              Send signature request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Recipient</div>
            <div className="flex flex-wrap gap-3">
              <PersonChip name={d.recipient.name} sub={d.recipient.email} />
              {user ? <PersonChip name={user.name} sub={user.email} /> : null}
            </div>
            <p className="mt-2 text-sm text-gray-400">First chip = recipient (signs). Second = IT sender (recorded as issuer, no email).</p>
          </div>
          <div>
            <div className="mb-2 text-md font-medium text-gray-700">Email preview</div>
            <EmailPreview subject={`Please sign: ${ed.saved?.reference ?? ''} - Issuance & indemnity form`} button="Review & sign">
              <p>
                From <b className="text-gray-800">ECEWS IT Department</b> · you are asked to confirm receipt of: {assetPhrase(assets)}.
              </p>
              <p>No account or login is needed - the link below opens the form for your typed signature.</p>
            </EmailPreview>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Deadline" htmlFor="dl">
              <TextInput id="dl" readOnly value={fmtDate(deadline)} />
            </Field>
            <Field label="Signing method" htmlFor="sm">
              <TextInput id="sm" readOnly value="Typed e-signature" />
            </Field>
          </div>
          <InfoNote icon={ShieldCheck}>The recipient signs without an account. The link is single-use and expires after 7 days; a reminder is auto-sent after 48h.</InfoNote>
        </div>
      </Modal>
    </>
  );
}
