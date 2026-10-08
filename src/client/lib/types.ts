import type { AssetStatus, Condition, DamageOrigin, FormStatus, FormType, RetireReason } from '../../shared/constants';
import type { AssetAction } from '../../shared/statusMachine';

export interface PersonRef {
  id: string;
  name: string;
  type: 'STAFF' | 'VENDOR';
  department: string | null;
  email: string;
  staffId: string | null;
  company: string | null;
  position: string | null;
}

export interface AssetSummary {
  id: string;
  tag: string;
  description: string;
  makeModel: string;
  serial: string | null;
  status: AssetStatus;
  inRepair: boolean;
  damageOrigin: DamageOrigin | null;
  condition: Condition;
  category: { id: string; name: string; group: string; icon: string };
  project: { id: string; name: string };
  location: { id: string; name: string };
  holder: PersonRef | null;
  oemSupport: boolean;
  unitCost: number | null;
  createdAt: string;
  deletedAt: string | null;
  retireReason: RetireReason | null;
  activeForm: { reference: string; status: FormStatus } | null;
  available?: boolean;
  unavailableReason?: string | null;
}

export interface AssetList {
  items: AssetSummary[];
  total: number;
  grandTotal: number;
  page: number;
  pageSize: number;
}

export interface TimelineEvent {
  id: string;
  type: string;
  occurredAt: string;
  actorName: string;
  fromHolder: string | null;
  toHolder: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  formReference: string | null;
  statusAfter: AssetStatus;
  detail: Record<string, unknown>;
}

export interface AssetDetail {
  asset: AssetSummary;
  currentForm: { reference: string; type: FormType } | null;
  repair: { reference: string; expectedReturn: string | null; vendor: string | null } | null;
  activeForm: { formId: string; reference: string; status: FormStatus; type: FormType } | null;
  actions: Array<{ action: AssetAction; primary: boolean; enabled: boolean; reason: string | null; blockingReference: string | null }>;
  timeline: TimelineEvent[];
  intake: {
    reference: string;
    supplier: string;
    poReference: string;
    deliveryLocation: string;
    deliveryDate: string | null;
    project: string | null;
    validatedBy: string;
    validatedAt: string | null;
    oemSupport: boolean;
    result: 'PASSED' | 'FAILED' | null;
  } | null;
  totals: { intake: number; issuances: number; movements: number; returns: number };
}
