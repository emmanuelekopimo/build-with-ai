import type { AssetStatus, Condition, FormStatus, FormType } from '../../shared/constants';

export interface FormParty {
  id: string;
  role: 'RECIPIENT' | 'ISSUER' | 'RETURNER' | 'RECEIVER' | 'HANDOVER' | 'COUNTERPARTY';
  name: string;
  email: string | null;
  department: string | null;
  position: string | null;
  needsSignature: boolean;
  status: 'PENDING' | 'SIGNED' | 'RECORDED';
  signedAt: string | null;
  typedName: string | null;
  signerDepartmentRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  linkExpiresAt: string | null;
  linkUsed: boolean;
}

export interface FormDetail {
  id: string;
  reference: string;
  type: FormType;
  title: string;
  status: FormStatus;
  createdBy: { name: string; title: string; office: string };
  createdAt: string;
  sentAt: string | null;
  deadline: string | null;
  completedAt: string | null;
  rejectedReason: string | null;
  temporary: boolean;
  expectedReturn: string | null;
  recipient: { name: string; sub: string };
  data: Record<string, unknown>;
  parties: FormParty[];
  approvals: Array<{ role: 'CTO' | 'ADMIN_OFFICER'; name: string | null; email: string; status: string; decidedAt: string | null; comment: string | null; sentAt: string | null }>;
  assets: Array<{
    tag: string;
    description: string;
    makeModel: string;
    serial: string | null;
    category: string;
    icon: string;
    currentStatus: AssetStatus;
    inRepair: boolean;
    deleted: boolean;
    condition: Condition | null;
    resultingStatus: AssetStatus | null;
  }>;
  parent: { id: string; reference: string; status: FormStatus } | null;
  children: Array<{ id: string; reference: string; status: FormStatus; type: FormType }>;
  document: { generatedAt: string; sha256: string } | null;
}

export interface SignoffRow {
  kind: 'FORM' | 'INTAKE';
  id: string;
  reference: string;
  type: FormType | 'INTAKE';
  status: FormStatus;
  asset: { tag: string | null; makeModel: string; more: number };
  recipient: { name: string; sub: string };
  sentAt: string | null;
  updatedAt: string;
  deadline: string | null;
  waitingOn?: string[];
}

export interface SignoffList {
  items: SignoffRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SignoffSummary {
  kpis: { awaiting: number; overdueToday: number; signedThisWeek: number; partial: number; expired: number };
  tabs: Record<'ALL' | 'AWAITING' | 'SIGNED' | 'EXPIRED' | 'DRAFT', number>;
}

export const RESENDABLE: FormStatus[] = ['AWAITING', 'PARTIAL', 'EXPIRED', 'PENDING_APPROVAL'];
