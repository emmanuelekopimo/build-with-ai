// Domain constants shared by server, client, PDFs and emails.

export const ASSET_STATUSES = ['IN_STORE', 'ISSUED', 'DAMAGED', 'RETIRED'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const STATUS_LABEL: Record<AssetStatus, string> = {
  IN_STORE: 'In Store',
  ISSUED: 'Issued',
  DAMAGED: 'Damaged',
  RETIRED: 'Retired',
};
/** Display variant of Damaged while an open repair movement exists (not a state). */
export const UNDER_REPAIR_LABEL = 'Under Repair';

export const DAMAGE_ORIGINS = ['REPORTED', 'RETURNED', 'INTAKE_FAILURE'] as const;
export type DamageOrigin = (typeof DAMAGE_ORIGINS)[number];
export const DAMAGE_ORIGIN_LABEL: Record<DamageOrigin, string> = {
  REPORTED: 'Reported damaged',
  RETURNED: 'Damaged on return',
  INTAKE_FAILURE: 'Failed intake',
};

export const CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABEL: Record<Condition, string> = {
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  DAMAGED: 'Damaged',
};
export const DAMAGE_REPORT_CONDITIONS = ['FAIR', 'POOR', 'DAMAGED'] as const;

/** Return / vendor-return outcome: Good and Fair go back In Store, anything else is Damaged. */
export function isWorkingCondition(c: Condition): boolean {
  return c === 'GOOD' || c === 'FAIR';
}

export const RETIRE_REASONS = [
  'BEYOND_ECONOMIC_REPAIR',
  'LOST_OR_STOLEN',
  'OBSOLETE',
  'REJECTED_AT_INTAKE',
  'OTHER',
] as const;
export type RetireReason = (typeof RETIRE_REASONS)[number];
export const RETIRE_REASON_LABEL: Record<RetireReason, string> = {
  BEYOND_ECONOMIC_REPAIR: 'Beyond economic repair',
  LOST_OR_STOLEN: 'Lost or stolen',
  OBSOLETE: 'Obsolete',
  REJECTED_AT_INTAKE: 'Rejected at intake',
  OTHER: 'Other',
};

/** Form 1 validation checklist, worded exactly as in AB-07. */
export const INTAKE_CHECK_QUESTIONS = [
  'Does the specified quantity match the supplied quantity?',
  'Does the equipment specification match the PO specification?',
  'Does the delivery note match the PO?',
  'Is the equipment in good condition?',
  'Is equipment available on OEM portal?',
  'Does equipment still have active OEM support?',
  'Are licenses / seal available?',
] as const;
export const CHECK_QUANTITY_MATCH = 1;
export const CHECK_OEM_SUPPORT = 6;

export type CheckAnswer = 'YES' | 'NO' | 'NA';
/** D11: Y = questions not answered N/A; X = questions answered Yes. */
export function scoreChecks(answers: Array<CheckAnswer | null | undefined>): { passed: number; scorable: number } {
  let passed = 0;
  let scorable = 0;
  for (let i = 0; i < INTAKE_CHECK_QUESTIONS.length; i++) {
    const a = answers[i];
    if (a === 'NA') continue;
    scorable++;
    if (a === 'YES') passed++;
  }
  return { passed, scorable };
}

export const FORM_TYPES = ['ISSUANCE', 'RETURN', 'MOVEMENT', 'INDEMNITY'] as const;
export type FormType = (typeof FORM_TYPES)[number];
export const FORM_PREFIX: Record<FormType, string> = {
  ISSUANCE: 'ISS',
  RETURN: 'RTR',
  MOVEMENT: 'MVT',
  INDEMNITY: 'IND',
};
export const FORM_TYPE_LABEL: Record<FormType, string> = {
  ISSUANCE: 'Issuance',
  RETURN: 'Return',
  MOVEMENT: 'Movement',
  INDEMNITY: 'Indemnity',
};
/** D9: numbering from the New form chooser. */
export const FORM_TITLE: Record<FormType, string> = {
  ISSUANCE: 'Issuance & indemnity (Form 2)',
  RETURN: 'Return (Form 4)',
  MOVEMENT: 'Movement (Form 3)',
  INDEMNITY: 'Issuance & indemnity (Form 2)',
};
export const FORM_DOC_NAME: Record<FormType, string> = {
  ISSUANCE: 'Issuance & indemnity form',
  RETURN: 'Return confirmation',
  MOVEMENT: 'Equipment movement',
  INDEMNITY: 'Issuance & indemnity form',
};

export const FORM_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'AWAITING',
  'PARTIAL',
  'SIGNED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Awaiting approval',
  AWAITING: 'Awaiting',
  PARTIAL: 'Partial',
  SIGNED: 'Signed',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
/** Statuses that hold the one-active-form lock on an asset (D12, D20). */
export const ACTIVE_FORM_STATUSES: readonly FormStatus[] = ['PENDING_APPROVAL', 'AWAITING', 'PARTIAL', 'EXPIRED'];
export const FINAL_FORM_STATUSES: readonly FormStatus[] = ['SIGNED', 'REJECTED', 'CANCELLED'];

export const SIGN_LINK_DAYS = 7;
export const AUTO_REMINDER_HOURS = 48;
export const OVERDUE_ISSUE_DAYS = 90;
export const RESET_LINK_HOURS = 24;
export const NOTE_MIN_LENGTH = 10;

/** Issuance terms, worded exactly as in AB-08a / AB-12. */
export const TERMS_INTRO = 'By signing this form, I acknowledge and agree to the following terms and conditions:';
export const ISSUANCE_TERMS: ReadonlyArray<{ title: string; text: string }> = [
  {
    title: 'Usage',
    text: 'The equipment is to be used solely for official purposes related to the activities and mission of ECEWS.',
  },
  { title: 'Care', text: 'I will take reasonable care of the equipment to prevent damage, loss, or theft.' },
  {
    title: 'Reporting',
    text: 'I will report any damage, loss, or theft immediately to the IT department through my supervisor.',
  },
  {
    title: 'Return',
    text: 'I will return the equipment in good working condition upon request, or upon my termination or end of contract with the organization.',
  },
  {
    title: 'Liability',
    text: 'I am responsible for any loss or damage due to my negligence or misuse, which may include repair or replacement.',
  },
  {
    title: 'Indemnification',
    text: 'I agree to indemnify and hold harmless ECEWS from any claims, liabilities, damages, or expenses arising from my use of the equipment.',
  },
];

/** Checkbox terms on the public signing page (AB-11). */
export const SIGNING_TERMS: Record<FormType, ReadonlyArray<{ title: string; text: string }>> = {
  ISSUANCE: [
    {
      title: 'Official use & reasonable care',
      text: 'The equipment is for official ECEWS purposes only and must be protected from damage, loss or theft.',
    },
    {
      title: 'Reporting & return',
      text: 'Report any damage or loss immediately to IT and return the equipment in good working condition on request.',
    },
    {
      title: 'Liability & indemnity',
      text: 'You are responsible for loss or damage due to negligence or misuse, and you indemnify ECEWS from claims arising from your use.',
    },
  ],
  INDEMNITY: [],
  RETURN: [
    {
      title: 'Items returned',
      text: 'The items listed above were handed back to the ECEWS IT Department on the date shown.',
    },
    {
      title: 'Condition recorded',
      text: 'I have seen the condition IT recorded for each item and understand the resulting status.',
    },
  ],
  MOVEMENT: [
    {
      title: 'Transfer details',
      text: 'The equipment listed above is being transferred between the parties and locations shown.',
    },
    {
      title: 'Custody',
      text: 'Custody of the equipment passes as recorded in this movement once all parties have signed.',
    },
  ],
};
SIGNING_TERMS.INDEMNITY = SIGNING_TERMS.ISSUANCE;

export const SIGNING_CONFIRMATION: Record<string, string> = {
  RECIPIENT:
    'I confirm I have received the equipment listed above in good working condition and I agree to the terms and conditions. I understand this is a legal acknowledgement.',
  RETURNER:
    'I confirm I have returned the equipment listed above to the ECEWS IT Department and the recorded condition is accurate. I understand this is a legal acknowledgement.',
  HANDOVER:
    'I confirm I have handed over the equipment listed above as recorded in this movement. I understand this is a legal acknowledgement.',
  COUNTERPARTY:
    'I confirm I have received custody of the equipment listed above as recorded in this movement. I understand this is a legal acknowledgement.',
};

export const PARTY_ROLE_LABEL: Record<string, string> = {
  RECIPIENT: 'Recipient',
  ISSUER: 'Issued by IT',
  RETURNER: 'Returning',
  RECEIVER: 'Received by IT',
  HANDOVER: 'Handover',
  COUNTERPARTY: 'Receiving',
};

export const ROLES = ['IT_ADMIN', 'IT_SUPPORT', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { IT_ADMIN: 'IT Admin', IT_SUPPORT: 'IT Support', VIEWER: 'Viewer' };
export const ROLE_CHIP: Record<Role, string> = { IT_ADMIN: 'IT', IT_SUPPORT: 'IT', VIEWER: 'View' };

export const ORG_EMAIL_DOMAIN = 'ecews.org';
export const TIMEZONE = 'Africa/Lagos';
