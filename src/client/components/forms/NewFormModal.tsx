import { ArrowRight, MapPin, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Overlay';

const OPTIONS = [
  { kind: 'issuance', title: 'Issuance & indemnity (Form 2)', text: 'Hand equipment to a recipient; they sign the indemnity over email.', Icon: Send, tile: 'bg-blue-light text-blue' },
  { kind: 'return', title: 'Return (Form 4)', text: 'Log equipment back into store with per-item condition notes.', Icon: Undo2, tile: 'bg-gray-100 text-gray-700' },
  { kind: 'movement', title: 'Movement (Form 3)', text: 'Record transfers between staff, sites or a vendor; status stays the same.', Icon: MapPin, tile: 'bg-amber-light text-amber' },
] as const;

/** New form chooser (Background+Shadow-10). */
export function NewFormModal({ open, onOpenChange, from }: { open: boolean; onOpenChange: (v: boolean) => void; from: string }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<(typeof OPTIONS)[number]['kind']>('issuance');
  const go = () => navigate(`/forms/new/${kind}?from=${encodeURIComponent(from)}`);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New form"
      subtitle="Choose the form IT will fill and send for signature."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" icon={<ArrowRight className="h-4 w-4" />} onClick={go}>
            Continue
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Form type" className="space-y-3">
        {OPTIONS.map((o) => (
          <label
            key={o.kind}
            className={cn(
              'flex cursor-pointer items-center gap-4 rounded-md border-2 px-4 py-4 focus-within:ring-2 focus-within:ring-brand',
              kind === o.kind ? 'border-brand bg-green-bg' : 'border-gray-200 hover:bg-gray-50',
            )}
            onDoubleClick={go}
          >
            <input type="radio" name="form-kind" className="sr-only" checked={kind === o.kind} onChange={() => setKind(o.kind)} />
            <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm', o.tile)} aria-hidden>
              <o.Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-md font-semibold text-gray-900">{o.title}</span>
              <span className="block text-sm text-gray-500">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
