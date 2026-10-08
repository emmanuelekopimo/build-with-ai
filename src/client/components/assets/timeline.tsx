import { ArrowRight, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { CONDITION_LABEL, type Condition } from '../../../shared/constants';
import { fmtDate, fmtDateTime, shortName } from '../../../shared/format';
import type { TimelineEvent } from '../../lib/types';
import { Badge, RefChip, StatusBadge } from '../ui/Badge';
import type { TimelineEntry, TimelineTone } from '../ui/Data';

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-gray-800">{children}</b>;
const Dot = () => <span aria-hidden>·</span>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function Place({ from, to }: { from: string | null; to: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      {from ?? '-'}
      <ArrowRight className="h-3.5 w-3.5 text-gray-400" aria-label="to" />
      <MapPin className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      {to ?? '-'}
    </span>
  );
}

/** Clear, consistent wording for every custody event (UX decision 11). */
export function toTimelineEntry(e: TimelineEvent): TimelineEntry {
  const d = e.detail ?? {};
  const ref = e.formReference ? <RefChip reference={e.formReference} /> : null;
  const condition = str(d.condition) ? CONDITION_LABEL[d.condition as Condition] : null;
  const notes = str(d.notes);
  const status = <StatusBadge status={e.statusAfter} inRepair={e.type === 'SENT_FOR_REPAIR'} />;
  let tone: TimelineTone = 'gray';
  let title: ReactNode = e.type;
  let detail: ReactNode = null;
  switch (e.type) {
    case 'INTAKE_VALIDATED':
    case 'INTAKE_FAILED':
      tone = e.type === 'INTAKE_VALIDATED' ? 'green' : 'red';
      title = e.type === 'INTAKE_VALIDATED' ? 'Intake validated' : 'Failed intake';
      detail = (
        <>
          <B>Supplier:</B> {str(d.supplier)} <Dot /> <B>PO:</B> {str(d.poReference)} <Dot /> <B>Validated by:</B>{' '}
          {shortName(str(d.validatedBy) ?? e.actorName)} <Dot />
          {e.type === 'INTAKE_FAILED' && notes ? (
            <>
              {notes} <Dot />
            </>
          ) : null}
          {status}
        </>
      );
      break;
    case 'ISSUED':
    case 'REISSUED':
      tone = 'blue';
      title = `${e.type === 'REISSUED' ? 'Re-issued' : 'Issued'} to ${e.toHolder ?? ''}`;
      detail =
        e.type === 'REISSUED' ? (
          <>
            New indemnity {ref} <Dot /> {status}
          </>
        ) : (
          <>
            {str(d.department) ? `${d.department} department` : null}
            {str(d.department) ? <Dot /> : null} Indemnity {ref} <Dot /> Approved by <B>{shortName(e.actorName)}</B> <Dot /> {status}
          </>
        );
      break;
    case 'MOVED':
      tone = 'amber';
      title = e.fromHolder !== e.toHolder && e.toHolder ? `Moved to ${e.toHolder}` : 'Moved';
      detail = (
        <>
          <Place from={e.fromLocation} to={e.toLocation} /> <Dot /> <B>Reason:</B> {str(d.reason)}
          {str(d.responsible) ? (
            <>
              <Dot /> <B>Responsible:</B> {shortName(str(d.responsible)!)}
            </>
          ) : null}
          {ref ? (
            <>
              <Dot /> {ref}
            </>
          ) : null}
        </>
      );
      break;
    case 'RETURNED':
      tone = e.statusAfter === 'IN_STORE' ? 'green' : 'red';
      title = 'Returned';
      detail = (
        <>
          <B>Condition:</B> {condition}
          {notes ? ` - ${notes}` : ''} <Dot /> Received by <B>{shortName(str(d.receivedBy) ?? e.actorName)}</B> <Dot />
          {ref ? (
            <>
              {ref} <Dot />
            </>
          ) : null}
          {status}
        </>
      );
      break;
    case 'DAMAGE_REPORTED':
      tone = 'red';
      title = 'Reported damaged';
      detail = (
        <>
          <B>Condition:</B> {condition} <Dot /> {notes} <Dot /> {status}
        </>
      );
      break;
    case 'SENT_FOR_REPAIR':
      tone = 'amber';
      title = `Sent to ${e.toHolder ?? 'vendor'} for repair`;
      detail = (
        <>
          <Place from={e.fromLocation} to={e.toLocation} /> <Dot /> {ref}
          {str(d.expectedReturn) ? (
            <>
              <Dot /> Expected back {fmtDate(str(d.expectedReturn))}
            </>
          ) : null}{' '}
          <Dot /> {status}
        </>
      );
      break;
    case 'REPAIRED':
      tone = 'green';
      title = 'Received back, In Store';
      detail = (
        <>
          <B>Condition:</B> {condition}
          {notes ? ` - ${notes}` : ''} <Dot /> {ref} <Dot /> {status}
        </>
      );
      break;
    case 'REPAIR_FAILED':
      tone = 'red';
      title = 'Received back, still faulty';
      detail = (
        <>
          <B>Condition:</B> {condition}
          {notes ? ` - ${notes}` : ''} <Dot /> {ref} <Dot /> {status}
        </>
      );
      break;
    case 'RETIRED':
      tone = 'gray';
      title = `Retired: ${str(d.reasonLabel) ?? ''}`;
      detail = (
        <>
          {notes} <Dot /> By <B>{shortName(e.actorName)}</B> <Dot /> {status}
        </>
      );
      break;
    case 'REINSTATED_FOR_REPAIR':
      tone = 'amber';
      title = 'Reinstated for repair';
      detail = (
        <>
          By <B>{shortName(e.actorName)}</B> {ref ? <><Dot /> {ref}</> : null} <Dot /> {status}
        </>
      );
      break;
    case 'DELETED':
      tone = 'gray';
      title = 'Deleted';
      detail = (
        <>
          {str(d.reason)} <Dot /> By <B>{shortName(e.actorName)}</B> <Dot />{' '}
          <Badge tone="gray" dot={false}>
            Custody history kept
          </Badge>
        </>
      );
      break;
  }
  return { id: e.id, tone, title, when: fmtDateTime(e.occurredAt), detail };
}
