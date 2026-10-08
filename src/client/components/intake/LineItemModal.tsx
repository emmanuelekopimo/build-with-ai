import { Info, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { ChipSelect, Field, Select, TextArea, TextInput } from '../ui/Controls';
import { InfoNote } from '../ui/Layout';
import { Modal } from '../ui/Overlay';
import type { Category } from '../../lib/hooks';

export interface LineItem {
  categoryId: string;
  makeModel: string;
  serial: string | null;
  notes: string | null;
  result: 'PASSED' | 'FAILED';
  unitCost: number | null;
}

interface Draft {
  categoryId: string;
  quantity: number;
  makeModel: string;
  serials: string[];
  notes: string;
  result: 'PASSED' | 'FAILED';
  unitCost: string;
}

const empty = (categoryId = ''): Draft => ({ categoryId, quantity: 1, makeModel: '', serials: [''], notes: '', result: 'PASSED', unitCost: '' });

/** Add line item (Background+Shadow-6) plus Result and Unit cost (D14, D28). Quantity N expands to N rows. */
export function LineItemModal({
  open,
  onOpenChange,
  categories,
  onAdd,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  onAdd: (items: LineItem[]) => void;
  editing?: LineItem | null;
}) {
  const [d, setD] = useState<Draft>(empty());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing)
      setD({
        categoryId: editing.categoryId,
        quantity: 1,
        makeModel: editing.makeModel,
        serials: [editing.serial ?? ''],
        notes: editing.notes ?? '',
        result: editing.result,
        unitCost: editing.unitCost === null ? '' : String(editing.unitCost),
      });
    else setD(empty(categories.find((c) => c.name === 'Laptop')?.id ?? ''));
  }, [open, editing, categories]);

  const category = categories.find((c) => c.id === d.categoryId);
  const setQty = (q: number) => {
    const quantity = Math.max(1, Math.min(50, Number.isFinite(q) ? q : 1));
    setD((x) => ({ ...x, quantity, serials: Array.from({ length: quantity }, (_, i) => x.serials[i] ?? '') }));
  };

  const build = (): LineItem[] | null => {
    const e: Record<string, string> = {};
    if (!d.categoryId) e.categoryId = 'Choose a category.';
    if (!d.makeModel.trim()) e.makeModel = 'Enter the make / model.';
    if (category?.requiresSerial) d.serials.forEach((s, i) => !s.trim() && (e[`serial${i}`] = 'Enter the serial number.'));
    const seen = new Set<string>();
    d.serials.forEach((s, i) => {
      const k = s.trim().toLowerCase();
      if (k && seen.has(k)) e[`serial${i}`] = 'Each unit needs its own serial number.';
      seen.add(k);
    });
    const cost = d.unitCost.trim() ? Number(d.unitCost.replace(/,/g, '')) : null;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) e.unitCost = 'Enter a valid amount.';
    setErrors(e);
    if (Object.keys(e).length) return null;
    return d.serials.map((s) => ({
      categoryId: d.categoryId,
      makeModel: d.makeModel.trim(),
      serial: s.trim() || null,
      notes: d.notes.trim() || null,
      result: d.result,
      unitCost: cost,
    }));
  };

  const add = (another: boolean) => {
    const items = build();
    if (!items) return;
    onAdd(items);
    if (another) setD(empty(d.categoryId));
    else onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit line item' : 'Add line item'}
      subtitle="Enter the details for each item in this delivery. Each line becomes an asset record after validation."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!editing ? (
            <Button variant="outline" size="lg" icon={<Plus className="h-4 w-4" />} onClick={() => add(true)}>
              Add another
            </Button>
          ) : null}
          <Button size="lg" icon={editing ? undefined : <Plus className="h-4 w-4" />} onClick={() => add(false)}>
            {editing ? 'Save item' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" htmlFor="li-cat" error={errors.categoryId}>
            <Select
              id="li-cat"
              value={d.categoryId}
              onChange={(e) => setD({ ...d, categoryId: e.target.value })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Choose"
            />
          </Field>
          <Field label="Quantity" htmlFor="li-qty">
            <TextInput id="li-qty" type="number" min={1} max={50} value={d.quantity} disabled={!!editing} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Make / model" htmlFor="li-make" error={errors.makeModel}>
          <TextInput id="li-make" placeholder="e.g. Dell Latitude 7420" value={d.makeModel} invalid={!!errors.makeModel} onChange={(e) => setD({ ...d, makeModel: e.target.value })} />
        </Field>
        {d.serials.map((s, i) => (
          <Field
            key={i}
            label={d.quantity > 1 ? `Serial number ${i + 1}` : 'Serial number'}
            optional={!category?.requiresSerial}
            htmlFor={`li-serial-${i}`}
            error={errors[`serial${i}`]}
          >
            <TextInput
              id={`li-serial-${i}`}
              className="font-tag"
              placeholder="e.g. 8XW4T9"
              value={s}
              invalid={!!errors[`serial${i}`]}
              onChange={(e) => setD({ ...d, serials: d.serials.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          </Field>
        ))}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="field-label">Result</span>
            <ChipSelect
              label="Inspection result"
              value={d.result}
              onChange={(v) => setD({ ...d, result: v })}
              options={[
                { value: 'PASSED', label: 'Passed', tone: 'green' },
                { value: 'FAILED', label: 'Failed', tone: 'red' },
              ]}
            />
          </div>
          <Field label="Unit cost, NGN" optional htmlFor="li-cost" error={errors.unitCost}>
            <TextInput id="li-cost" inputMode="decimal" placeholder="e.g. 850,000" value={d.unitCost} onChange={(e) => setD({ ...d, unitCost: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" optional htmlFor="li-notes">
          <TextArea id="li-notes" rows={2} placeholder="Any observations from physical inspection..." value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
        <InfoNote icon={Info}>
          After validation: passed items move to In Store with auto-generated asset tags. Failed items are created as Damaged
          with a Failed intake flag and stay in Needs Attention until sent for repair or retired.
        </InfoNote>
      </div>
    </Modal>
  );
}
