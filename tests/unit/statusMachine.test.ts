import { describe, expect, it } from 'vitest';
import { CONDITIONS, type AssetStatus, type Condition } from '../../src/shared/constants';
import {
  formEligibility,
  stateActions,
  transition,
  type AssetEvent,
  type AssetState,
  type FormSlot,
} from '../../src/shared/statusMachine';

const S = (status: AssetStatus, inRepair = false, deleted = false): AssetState => ({ status, inRepair, deleted });

const STATES: Array<[string, AssetState]> = [
  ['In Store', S('IN_STORE')],
  ['Issued', S('ISSUED')],
  ['Damaged', S('DAMAGED')],
  ['Damaged (in repair)', S('DAMAGED', true)],
  ['Retired', S('RETIRED')],
  ['Retired (deleted)', S('RETIRED', false, true)],
];

type Expect = null | { status: AssetStatus; inRepair?: boolean; deleted?: boolean; origin?: string | null };

/** Expected result for every (state, event). null = rejected. */
function expected(state: string, ev: AssetEvent): Expect {
  const working = (c: Condition) => c === 'GOOD' || c === 'FAIR';
  switch (state) {
    case 'In Store':
      if (ev.type === 'ISSUE_SIGNED') return { status: 'ISSUED', origin: null };
      if (ev.type === 'REPORT_DAMAGE') return { status: 'DAMAGED', origin: 'REPORTED' };
      if (ev.type === 'MOVE_SIGNED') return { status: 'IN_STORE', origin: null };
      return null;
    case 'Issued':
      if (ev.type === 'REPORT_DAMAGE') return { status: 'DAMAGED', origin: 'REPORTED' };
      if (ev.type === 'RETURN_SIGNED')
        return working(ev.condition) ? { status: 'IN_STORE', origin: null } : { status: 'DAMAGED', origin: 'RETURNED' };
      if (ev.type === 'MOVE_SIGNED') return { status: 'ISSUED', origin: null };
      return null;
    case 'Damaged':
      if (ev.type === 'REPAIR_APPROVED') return { status: 'DAMAGED', inRepair: true };
      if (ev.type === 'RETIRE') return { status: 'RETIRED', origin: null };
      return null;
    case 'Damaged (in repair)':
      if (ev.type === 'VENDOR_RETURN_SIGNED')
        return working(ev.condition) ? { status: 'IN_STORE', origin: null } : { status: 'DAMAGED', inRepair: false };
      if (ev.type === 'RETIRE') return { status: 'RETIRED', origin: null };
      return null;
    case 'Retired':
      if (ev.type === 'REINSTATE') return { status: 'DAMAGED', origin: 'REPORTED' };
      if (ev.type === 'DELETE') return { status: 'RETIRED', deleted: true };
      return null;
    default:
      return null; // deleted assets accept nothing
  }
}

const EVENTS: AssetEvent[] = [
  { type: 'ISSUE_SIGNED' },
  { type: 'REPORT_DAMAGE' },
  ...CONDITIONS.map((condition) => ({ type: 'RETURN_SIGNED' as const, condition })),
  { type: 'MOVE_SIGNED' },
  { type: 'REPAIR_APPROVED' },
  ...CONDITIONS.map((condition) => ({ type: 'VENDOR_RETURN_SIGNED' as const, condition })),
  { type: 'RETIRE' },
  { type: 'REINSTATE' },
  { type: 'DELETE' },
];

describe('status machine: every state × every event', () => {
  for (const [name, state] of STATES) {
    for (const ev of EVENTS) {
      const label = `${name} + ${ev.type}${'condition' in ev ? `(${ev.condition})` : ''}`;
      const exp = expected(name, ev);
      it(`${label} → ${exp ? exp.status + (exp.inRepair ? ' (in repair)' : '') + (exp.deleted ? ' (deleted)' : '') : 'rejected'}`, () => {
        const r = transition(state, ev);
        if (!exp) {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.message).toMatch(/^Cannot .+ an asset that is .+\.$/);
          return;
        }
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.next.status).toBe(exp.status);
        expect(r.next.inRepair).toBe(exp.inRepair ?? false);
        expect(r.next.deleted).toBe(exp.deleted ?? false);
        if (exp.origin !== undefined) expect(r.next.damageOrigin).toBe(exp.origin);
      });
    }
  }
});

describe('status machine: header actions per state (order matters, first is primary)', () => {
  const table: Array<[string, AssetState, string[]]> = [
    ['In Store', S('IN_STORE'), ['ISSUE', 'REPORT_DAMAGE']],
    ['Issued', S('ISSUED'), ['RETURN', 'REPORT_DAMAGE']],
    ['Damaged', S('DAMAGED'), ['SEND_FOR_REPAIR', 'RETIRE']],
    ['Damaged (in repair)', S('DAMAGED', true), ['RECEIVE_BACK', 'RETIRE']],
    ['Retired', S('RETIRED'), ['REPAIR', 'DELETE']],
    ['Deleted', S('RETIRED', false, true), []],
  ];
  it.each(table)('%s', (_n, state, actions) => {
    expect(stateActions(state)).toEqual(actions);
  });
  it('exactly four persisted states exist', () => {
    const seen = new Set(STATES.map(([, s]) => s.status));
    expect([...seen].sort()).toEqual(['DAMAGED', 'IN_STORE', 'ISSUED', 'RETIRED']);
  });
});

describe('status machine: which forms accept which assets', () => {
  const slots: Array<[string, FormSlot]> = [
    ['issuance', { form: 'ISSUANCE' }],
    ['staff return', { form: 'RETURN', returner: 'STAFF' }],
    ['vendor return', { form: 'RETURN', returner: 'VENDOR' }],
    ['move to staff', { form: 'MOVEMENT', to: 'STAFF' }],
    ['move to location', { form: 'MOVEMENT', to: 'LOCATION' }],
    ['send to vendor', { form: 'MOVEMENT', to: 'VENDOR' }],
    ['reinstate + vendor', { form: 'MOVEMENT', to: 'VENDOR', reinstate: true }],
  ];
  const allowed: Record<string, string[]> = {
    'In Store': ['issuance', 'move to staff', 'move to location'],
    Issued: ['staff return', 'move to staff', 'move to location'],
    Damaged: ['send to vendor', 'reinstate + vendor'],
    'Damaged (in repair)': ['vendor return'],
    Retired: ['reinstate + vendor'],
    'Retired (deleted)': [],
  };
  for (const [name, state] of STATES) {
    for (const [slotName, slot] of slots) {
      const ok = allowed[name]!.includes(slotName);
      it(`${name} on ${slotName}: ${ok ? 'allowed' : 'rejected'}`, () => {
        const r = formEligibility(state, slot);
        expect(r.ok).toBe(ok);
        if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
      });
    }
  }
});
