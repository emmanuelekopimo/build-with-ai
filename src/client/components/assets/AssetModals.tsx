import { AlertTriangle, RotateCcw, ShieldAlert, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DAMAGE_REPORT_CONDITIONS,
  CONDITION_LABEL,
  NOTE_MIN_LENGTH,
  RETIRE_REASON_LABEL,
  RETIRE_REASONS,
  type RetireReason,
} from '../../../shared/constants';
import { api, ApiError } from '../../lib/api';
import { queryClient } from '../../lib/query';
import type { AssetSummary } from '../../lib/types';
import { Button } from '../ui/Button';
import { ChipSelect, Field, Select, TextArea, TextInput } from '../ui/Controls';
import { InfoNote, ItemCard } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { categoryIcon } from '../../lib/icons';
import { StatusBadge } from '../ui/Badge';

type Props = { asset: AssetSummary; open: boolean; onOpenChange: (v: boolean) => void };

const refresh = () => {
  void queryClient.invalidateQueries({ queryKey: ['asset'] });
  void queryClient.invalidateQueries({ queryKey: ['assets'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['nav-counts'] });
};

function subtitle(a: AssetSummary) {
  const who = a.status === 'ISSUED' && a.holder ? ` · Issued to ${a.holder.name}` : '';
  return `${a.tag} · ${a.makeModel}${who}`;
}

export function ReportDamageModal({ asset, open, onOpenChange }: Props) {
  const toast = useToast();
  const [condition, setCondition] = useState<(typeof DAMAGE_REPORT_CONDITIONS)[number] | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!condition) e.condition = 'Choose the condition assessed.';
    if (notes.trim().length < NOTE_MIN_LENGTH) e.notes = `Describe the damage in at least ${NOTE_MIN_LENGTH} characters.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api(`/assets/${asset.tag}/report-damage`, { body: { condition, notes } });
      toast.success(`${asset.tag} reported damaged · status Damaged`);
      refresh();
      onOpenChange(false);
      setCondition(null);
      setNotes('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not report damage.');
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Report damage"
      subtitle={subtitle(asset)}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="warning" size="lg" loading={busy} icon={<AlertTriangle className="h-4 w-4" />} onClick={() => void submit()}>
            Report damage
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-md font-medium text-gray-700">Condition assessed on receipt</div>
          <ChipSelect
            label="Condition assessed"
            value={condition}
            onChange={setCondition}
            options={DAMAGE_REPORT_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
          />
          {errors.condition ? <p className="mt-1 text-sm text-red">{errors.condition}</p> : null}
        </div>
        <div className="text-md text-gray-700">
          <span className="font-medium">Resulting status:</span> <StatusBadge status="DAMAGED" className="ml-1" />
        </div>
        <Field label="Notes" required htmlFor="damage-notes" error={errors.notes}>
          <TextArea
            id="damage-notes"
            rows={3}
            value={notes}
            invalid={!!errors.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What is damaged, and how was it checked?"
          />
        </Field>
        <InfoNote icon={AlertTriangle}>
          Reporting damage takes the asset out of circulation: it flips to Damaged (red) and stays visible on the dashboard
          until it is sent for repair or retired.{asset.holder ? ` ${asset.holder.name} stays recorded as holder until a return or repair movement closes custody.` : ''}
        </InfoNote>
      </div>
    </Modal>
  );
}

export function RetireModal({ asset, open, onOpenChange }: Props) {
  const toast = useToast();
  const defaultReason: RetireReason | '' = asset.damageOrigin === 'INTAKE_FAILURE' ? 'REJECTED_AT_INTAKE' : '';
  const [reason, setReason] = useState<RetireReason | ''>(defaultReason);
  const [notes, setNotes] = useState(asset.damageOrigin === 'INTAKE_FAILURE' ? 'Rejected, returned to supplier' : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const Icon = categoryIcon(asset.category.icon);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!reason) e.reason = 'Choose a reason.';
    if (notes.trim().length < NOTE_MIN_LENGTH) e.notes = `Add notes of at least ${NOTE_MIN_LENGTH} characters.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api(`/assets/${asset.tag}/retire`, { body: { reason, notes } });
      toast.success(`${asset.tag} retired`);
      refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not retire the asset.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Retire this asset?"
      subtitle={subtitle(asset)}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="lg" loading={busy} icon={<ShieldAlert className="h-4 w-4" />} onClick={() => void submit()}>
            Retire asset
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ItemCard
          icon={Icon}
          title={asset.makeModel}
          sub={`${asset.tag}${asset.serial ? ` · SN ${asset.serial}` : ''} · ${asset.location.name}`}
          right={<StatusBadge status={asset.status} inRepair={asset.inRepair} />}
        />
        <Field label="Reason" required htmlFor="retire-reason" error={errors.reason}>
          <Select
            id="retire-reason"
            value={reason}
            invalid={!!errors.reason}
            placeholder="Choose a reason"
            onChange={(e) => setReason(e.target.value as RetireReason)}
            options={RETIRE_REASONS.map((r) => ({ value: r, label: RETIRE_REASON_LABEL[r] }))}
          />
        </Field>
        <Field label="Notes" required htmlFor="retire-notes" error={errors.notes}>
          <TextArea id="retire-notes" rows={3} value={notes} invalid={!!errors.notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <InfoNote icon={ShieldAlert}>
          The asset moves to Retired and leaves circulation{asset.inRepair ? '; the open repair is closed' : ''}. The custody
          history and signed documents are kept. An IT Admin can later reinstate it for repair.
        </InfoNote>
      </div>
    </Modal>
  );
}

export function RepairModal({ asset, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Reinstate for repair?"
      subtitle={subtitle(asset)}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            icon={<Wrench className="h-4 w-4" />}
            onClick={() => navigate(`/forms/new/movement?assets=${asset.tag}&to=VENDOR&reinstate=1&from=/assets/${asset.tag}`)}
          >
            Continue to Send for Repair
          </Button>
        </>
      }
    >
      <InfoNote icon={RotateCcw}>
        The asset returns to Damaged and the Send for Repair movement opens next. Nothing changes until you submit that
        movement — if you cancel it, the asset stays Retired.
      </InfoNote>
    </Modal>
  );
}

export function DeleteModal({ asset, open, onOpenChange }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmTag, setConfirmTag] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Record<string, string> = {};
    if (confirmTag !== asset.tag) e.confirmTag = `Type ${asset.tag} exactly to confirm.`;
    if (reason.trim().length < NOTE_MIN_LENGTH) e.reason = `Give a reason of at least ${NOTE_MIN_LENGTH} characters.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api(`/assets/${asset.tag}/delete`, { body: { confirmTag, reason } });
      toast.success(`${asset.tag} deleted · custody history kept`);
      refresh();
      onOpenChange(false);
      navigate('/assets');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the asset.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this asset?"
      subtitle={subtitle(asset)}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="lg" loading={busy} disabled={confirmTag !== asset.tag} icon={<Trash2 className="h-4 w-4" />} onClick={() => void submit()}>
            Delete asset
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InfoNote icon={Trash2} tone="red">
          {asset.tag} is removed from the registry, dashboard counts, pickers and standard exports. The custody history and
          signed documents are kept, and the tag is never reused.
        </InfoNote>
        <Field label={`Type ${asset.tag} to confirm`} required htmlFor="delete-tag" error={errors.confirmTag}>
          <TextInput id="delete-tag" autoComplete="off" className="font-tag" value={confirmTag} invalid={!!errors.confirmTag} onChange={(e) => setConfirmTag(e.target.value.trim())} />
        </Field>
        <Field label="Reason" required htmlFor="delete-reason" error={errors.reason}>
          <TextArea id="delete-reason" rows={3} value={reason} invalid={!!errors.reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
