// The single source of truth for the asset lifecycle (docs/SPEC.md §3).
// Pure: no I/O. The server calls `transition` inside every mutating transaction.

import { isWorkingCondition, type AssetStatus, type Condition, type DamageOrigin, type FormType } from './constants';

export interface AssetState {
  status: AssetStatus;
  inRepair: boolean;
  deleted: boolean;
}

export type AssetEvent =
  | { type: 'ISSUE_SIGNED' }
  | { type: 'REPORT_DAMAGE' }
  | { type: 'RETURN_SIGNED'; condition: Condition }
  | { type: 'MOVE_SIGNED' }
  | { type: 'REPAIR_APPROVED' }
  | { type: 'VENDOR_RETURN_SIGNED'; condition: Condition }
  | { type: 'RETIRE' }
  | { type: 'REINSTATE' }
  | { type: 'DELETE' };

export interface TransitionResult {
  status: AssetStatus;
  inRepair: boolean;
  deleted: boolean;
  /** Set when the result is Damaged and the origin changes; null clears it. */
  damageOrigin: DamageOrigin | null | undefined;
}

export type TransitionOutcome = { ok: true; next: TransitionResult } | { ok: false; message: string };

const STATE_NAME = (s: AssetState): string =>
  s.deleted
    ? 'deleted'
    : s.status === 'DAMAGED' && s.inRepair
      ? 'Damaged (in repair)'
      : { IN_STORE: 'In Store', ISSUED: 'Issued', DAMAGED: 'Damaged', RETIRED: 'Retired' }[s.status];

const EVENT_NAME: Record<AssetEvent['type'], string> = {
  ISSUE_SIGNED: 'issue',
  REPORT_DAMAGE: 'report damage on',
  RETURN_SIGNED: 'return',
  MOVE_SIGNED: 'move',
  REPAIR_APPROVED: 'send for repair',
  VENDOR_RETURN_SIGNED: 'receive back from repair',
  RETIRE: 'retire',
  REINSTATE: 'reinstate for repair',
  DELETE: 'delete',
};

function reject(state: AssetState, event: AssetEvent): TransitionOutcome {
  return {
    ok: false,
    message: `Cannot ${EVENT_NAME[event.type]} an asset that is ${STATE_NAME(state)}.`,
  };
}

function ok(status: AssetStatus, damageOrigin: DamageOrigin | null | undefined, inRepair = false, deleted = false) {
  return { ok: true as const, next: { status, inRepair, deleted, damageOrigin } };
}

export function transition(state: AssetState, event: AssetEvent): TransitionOutcome {
  if (state.deleted) return reject(state, event);
  const { status, inRepair } = state;
  switch (event.type) {
    case 'ISSUE_SIGNED':
      return status === 'IN_STORE' ? ok('ISSUED', null) : reject(state, event);
    case 'REPORT_DAMAGE':
      return status === 'IN_STORE' || status === 'ISSUED' ? ok('DAMAGED', 'REPORTED') : reject(state, event);
    case 'RETURN_SIGNED':
      if (status !== 'ISSUED') return reject(state, event);
      return isWorkingCondition(event.condition) ? ok('IN_STORE', null) : ok('DAMAGED', 'RETURNED');
    case 'MOVE_SIGNED':
      return status === 'ISSUED' || status === 'IN_STORE' ? ok(status, null) : reject(state, event);
    case 'REPAIR_APPROVED':
      return status === 'DAMAGED' && !inRepair ? ok('DAMAGED', undefined, true) : reject(state, event);
    case 'VENDOR_RETURN_SIGNED':
      if (status !== 'DAMAGED' || !inRepair) return reject(state, event);
      // Repaired => In Store. Still faulty => stays Damaged, repair closed, may be sent again or retired.
      return isWorkingCondition(event.condition) ? ok('IN_STORE', null) : ok('DAMAGED', undefined, false);
    case 'RETIRE':
      return status === 'DAMAGED' ? ok('RETIRED', null) : reject(state, event);
    case 'REINSTATE':
      return status === 'RETIRED' ? ok('DAMAGED', 'REPORTED') : reject(state, event);
    case 'DELETE':
      return status === 'RETIRED' ? ok('RETIRED', null, false, true) : reject(state, event);
  }
}

/** Header actions on Asset Detail, in display order. The first is the primary (green pill). */
export type AssetAction = 'ISSUE' | 'RETURN' | 'REPORT_DAMAGE' | 'SEND_FOR_REPAIR' | 'RECEIVE_BACK' | 'RETIRE' | 'REPAIR' | 'DELETE';

export const ACTION_LABEL: Record<AssetAction, string> = {
  ISSUE: 'Issue',
  RETURN: 'Return',
  REPORT_DAMAGE: 'Report damage',
  SEND_FOR_REPAIR: 'Send for Repair',
  RECEIVE_BACK: 'Receive back',
  RETIRE: 'Retire',
  REPAIR: 'Repair',
  DELETE: 'Delete',
};

export function stateActions(state: AssetState): AssetAction[] {
  if (state.deleted) return [];
  switch (state.status) {
    case 'IN_STORE':
      return ['ISSUE', 'REPORT_DAMAGE'];
    case 'ISSUED':
      return ['RETURN', 'REPORT_DAMAGE'];
    case 'DAMAGED':
      return state.inRepair ? ['RECEIVE_BACK', 'RETIRE'] : ['SEND_FOR_REPAIR', 'RETIRE'];
    case 'RETIRED':
      return ['REPAIR', 'DELETE'];
  }
}

/** Which forms an asset may be placed on, given its state (pickers + server validation). */
export type FormSlot =
  | { form: 'ISSUANCE' }
  | { form: 'RETURN'; returner: 'STAFF' | 'VENDOR' }
  | { form: 'MOVEMENT'; to: 'STAFF' | 'LOCATION' | 'VENDOR'; reinstate?: boolean };

export function formEligibility(state: AssetState, slot: FormSlot): { ok: true } | { ok: false; message: string } {
  const name = STATE_NAME(state);
  const no = (message: string) => ({ ok: false as const, message });
  if (state.deleted) return no('This asset has been deleted.');
  switch (slot.form) {
    case 'ISSUANCE':
      return state.status === 'IN_STORE' ? { ok: true } : no(`Only In Store assets can be issued (this one is ${name}).`);
    case 'RETURN':
      if (slot.returner === 'STAFF')
        return state.status === 'ISSUED'
          ? { ok: true }
          : no(`Only Issued assets can be returned by staff (this one is ${name}).`);
      return state.status === 'DAMAGED' && state.inRepair
        ? { ok: true }
        : no(`Only assets out for repair can be received back from a vendor (this one is ${name}).`);
    case 'MOVEMENT':
      if (slot.to === 'VENDOR') {
        if (state.status === 'RETIRED' && slot.reinstate) return { ok: true };
        return state.status === 'DAMAGED' && !state.inRepair
          ? { ok: true }
          : no(`Only Damaged assets can be sent to a vendor for repair (this one is ${name}).`);
      }
      return state.status === 'ISSUED' || state.status === 'IN_STORE'
        ? { ok: true }
        : no(`Only Issued or In Store assets can be moved between staff or locations (this one is ${name}).`);
  }
}

export const FORM_PICKER_SCOPE: Record<Exclude<FormType, 'INDEMNITY'>, string> = {
  ISSUANCE: 'In Store',
  RETURN: 'Issued',
  MOVEMENT: 'Issued, In Store or Damaged',
};
