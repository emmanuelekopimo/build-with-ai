// Payload schemas for Issuance (Form 2), Return (Form 4) and Movement (Form 3).
// Drafts accept partial data; sending validates with the strict variants.
import { z } from 'zod';
import { CONDITIONS } from './constants';

const name = z.string().trim().min(2, 'Enter the full name.').max(120);
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(160);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.');

export const staffPerson = z.object({
  name,
  department: z.string().trim().min(2, 'Enter the department.').max(120),
  staffId: z.string().trim().min(1, 'Enter the staff ID.').max(40),
  email,
  phone: optional(40),
  position: optional(120),
});
export type StaffPerson = z.infer<typeof staffPerson>;

export const vendorPerson = z.object({
  company: z.string().trim().min(2, 'Enter the vendor company.').max(120),
  name,
  email,
  phone: optional(40),
});
export type VendorPerson = z.infer<typeof vendorPerson>;

export const assetTags = z
  .array(z.string().regex(/^ECEWS-IT-\d{4,}$/, 'Invalid asset tag.'))
  .min(1, 'Add at least one asset.')
  .max(50, 'A form can hold at most 50 assets.')
  .refine((tags) => new Set(tags).size === tags.length, 'Each asset can appear only once.');

export const issuanceData = z
  .object({
    recipient: staffPerson,
    temporary: z.boolean().default(false),
    expectedReturn: isoDate.optional(),
  })
  .refine((d) => !d.temporary || d.expectedReturn, { message: 'Enter the expected return date for a temporary issuance.', path: ['expectedReturn'] });
export type IssuanceData = z.infer<typeof issuanceData>;

export const returnItem = z.object({
  tag: z.string(),
  condition: z.enum(CONDITIONS, { errorMap: () => ({ message: 'Choose the condition.' }) }),
});

export const returnData = z.discriminatedUnion('returnerType', [
  z.object({
    returnerType: z.literal('STAFF'),
    returner: staffPerson,
    items: z.array(returnItem).min(1),
    conditionNotes: optional(1000),
    returnDate: isoDate,
  }),
  z.object({
    returnerType: z.literal('VENDOR'),
    returner: vendorPerson,
    items: z.array(returnItem).min(1),
    conditionNotes: optional(1000),
    returnDate: isoDate,
  }),
]);
export type ReturnData = z.infer<typeof returnData>;

const approver = z.object({ name: optional(120), email });

export const movementTo = z.discriminatedUnion('type', [
  z.object({ type: z.literal('STAFF'), person: staffPerson, location: z.string().trim().min(1, 'Choose the destination location.') }),
  z.object({
    type: z.literal('LOCATION'),
    location: z.string().trim().min(1, 'Choose the destination location.'),
    contact: z.object({ name, email, role: optional(120) }),
  }),
  z.object({ type: z.literal('VENDOR'), vendor: vendorPerson }),
]);
export type MovementTo = z.infer<typeof movementTo>;

export const movementData = z
  .object({
    to: movementTo,
    reason: z.string().trim().min(5, 'Enter the reason for the transfer.').max(500),
    responsibleOfficer: z.string().trim().min(2, 'Enter the responsible IT officer.').max(160),
    movementDate: isoDate,
    expectedReturn: isoDate.optional(),
    temporary: z.boolean().default(false),
    approvers: z.object({ cto: approver, admin: approver }),
    reinstate: z.boolean().default(false),
  })
  .refine((d) => d.to.type !== 'VENDOR' || d.expectedReturn, {
    message: 'Enter the expected return date from the vendor.',
    path: ['expectedReturn'],
  })
  .refine((d) => d.approvers.cto.email !== d.approvers.admin.email, {
    message: 'The CTO and Admin Officer must be different people.',
    path: ['approvers', 'admin', 'email'],
  });
export type MovementData = z.infer<typeof movementData>;

export const formTypeParam = z.enum(['ISSUANCE', 'RETURN', 'MOVEMENT']);
export type NewFormType = z.infer<typeof formTypeParam>;

/** Body for POST /forms (draft or create+send) and PATCH /forms/:id. Drafts store data loosely. */
export const formWrite = z.object({
  type: formTypeParam,
  assetTags: z.array(z.string().regex(/^ECEWS-IT-\d{4,}$/, 'Invalid asset tag.')).max(50).default([]),
  data: z.record(z.unknown()).default({}),
  send: z.boolean().default(false),
});
export type FormWrite = z.infer<typeof formWrite>;

export function strictSchema(type: NewFormType) {
  return type === 'ISSUANCE' ? issuanceData : type === 'RETURN' ? returnData : movementData;
}
