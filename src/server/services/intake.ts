// Form 1: Intake. Drafts auto-save; validation creates assets atomically and is idempotent.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { CHECK_OEM_SUPPORT, CHECK_QUANTITY_MATCH, INTAKE_CHECK_QUESTIONS } from '../../shared/constants';
import { db, withTx, type Tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { audit } from './audit';
import { writeCustody } from './custody';
import { notifyIT } from './notifications';
import { nextAssetTag, nextIntakeReference } from './numbering';
import type { SessionUser } from './sessions';

const optStr = (max: number) => z.string().trim().max(max).default('');
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')
  .nullable()
  .default(null);

export const lineItemInput = z.object({
  categoryId: z.string().uuid('Choose a category.'),
  makeModel: z.string().trim().min(1, 'Enter the make / model.').max(120),
  serial: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null)),
  notes: z.string().trim().max(1000).nullable().default(null),
  result: z.enum(['PASSED', 'FAILED']).default('PASSED'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative.').max(1e11).nullable().default(null),
});

export const intakeInput = z.object({
  supplier: optStr(120),
  poReference: optStr(60),
  projectId: z.string().uuid().nullable().default(null),
  deliveryLocation: optStr(120),
  deliveryDate: dateStr,
  validatedByName: optStr(120),
  validatedByTitle: optStr(120),
  validatedDate: dateStr,
  lineItems: z.array(lineItemInput).max(200, 'An intake can hold at most 200 line items.').default([]),
  checks: z
    .array(z.object({ answer: z.enum(['YES', 'NO', 'NA']).nullable().default(null), remark: z.string().trim().max(500).nullable().default(null) }))
    .length(INTAKE_CHECK_QUESTIONS.length)
    .optional(),
});
export type IntakeInput = z.infer<typeof intakeInput>;

const intakeInclude = {
  lineItems: { orderBy: { position: 'asc' }, include: { category: true, asset: { select: { tag: true, status: true } } } },
  checks: { orderBy: { question: 'asc' } },
  project: true,
} satisfies Prisma.IntakeInclude;

type IntakeFull = Prisma.IntakeGetPayload<{ include: typeof intakeInclude }>;

const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function serializeIntake(i: IntakeFull) {
  return {
    id: i.id,
    reference: i.reference,
    status: i.status,
    supplier: i.supplier,
    poReference: i.poReference,
    projectId: i.projectId,
    project: i.project?.name ?? null,
    deliveryLocation: i.deliveryLocation,
    deliveryDate: toIso(i.deliveryDate),
    validatedByName: i.validatedByName,
    validatedByTitle: i.validatedByTitle,
    validatedDate: toIso(i.validatedDate),
    validatedAt: i.validatedAt,
    updatedAt: i.updatedAt,
    createdAt: i.createdAt,
    lineItems: i.lineItems.map((l) => ({
      id: l.id,
      categoryId: l.categoryId,
      category: l.category.name,
      categoryIcon: l.category.icon,
      makeModel: l.makeModel,
      serial: l.serial,
      notes: l.notes,
      result: l.result,
      unitCost: l.unitCost === null ? null : Number(l.unitCost),
      assetTag: l.asset?.tag ?? null,
    })),
    checks: i.checks.map((c) => ({ question: c.question, answer: c.answer, remark: c.remark })),
  };
}

async function writeChildren(tx: Tx, intakeId: string, input: IntakeInput) {
  await tx.intakeLineItem.deleteMany({ where: { intakeId } });
  if (input.lineItems.length) {
    await tx.intakeLineItem.createMany({
      data: input.lineItems.map((l, position) => ({
        intakeId,
        position,
        categoryId: l.categoryId,
        makeModel: l.makeModel,
        serial: l.serial,
        notes: l.notes,
        result: l.result,
        unitCost: l.unitCost === null ? null : new Prisma.Decimal(l.unitCost),
      })),
    });
  }
  if (input.checks) {
    for (let q = 1; q <= INTAKE_CHECK_QUESTIONS.length; q++) {
      const c = input.checks[q - 1]!;
      await tx.intakeCheck.upsert({
        where: { intakeId_question: { intakeId, question: q } },
        update: { answer: c.answer, remark: c.remark || null },
        create: { intakeId, question: q, answer: c.answer, remark: c.remark || null },
      });
    }
  }
}

function header(input: IntakeInput) {
  return {
    supplier: input.supplier,
    poReference: input.poReference,
    projectId: input.projectId,
    deliveryLocation: input.deliveryLocation,
    deliveryDate: toDate(input.deliveryDate),
    validatedByName: input.validatedByName,
    validatedByTitle: input.validatedByTitle,
    validatedDate: toDate(input.validatedDate),
  };
}

export async function createIntake(input: IntakeInput, user: SessionUser) {
  const id = await withTx(async (tx) => {
    const reference = await nextIntakeReference(tx);
    const intake = await tx.intake.create({ data: { reference, createdById: user.id, ...header(input) } });
    await writeChildren(tx, intake.id, {
      ...input,
      checks: input.checks ?? INTAKE_CHECK_QUESTIONS.map(() => ({ answer: null, remark: null })),
    });
    await audit({ userId: user.id, action: 'intake.create', entityType: 'Intake', entityId: intake.id, detail: { reference } }, tx);
    return intake.id;
  });
  return getIntake(id);
}

export async function getIntake(id: string) {
  const i = await db().intake.findUnique({ where: { id }, include: intakeInclude });
  if (!i) throw notFound('Intake not found.');
  return serializeIntake(i);
}

export async function updateIntake(id: string, input: IntakeInput, user: SessionUser) {
  await withTx(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM "Intake" WHERE id = $1::uuid FOR UPDATE`, id);
    if (!rows[0]) throw notFound('Intake not found.');
    if (rows[0].status !== 'DRAFT') throw conflict('This intake was already validated and can no longer be edited.');
    await tx.intake.update({ where: { id }, data: header(input) });
    await writeChildren(tx, id, input);
    await audit({ userId: user.id, action: 'intake.autosave', entityType: 'Intake', entityId: id }, tx);
  });
  return getIntake(id);
}

export async function discardIntake(id: string, user: SessionUser) {
  await withTx(async (tx) => {
    const i = await tx.intake.findUnique({ where: { id } });
    if (!i) throw notFound('Intake not found.');
    if (i.status !== 'DRAFT') throw conflict('Validated intakes cannot be discarded.');
    await tx.intake.delete({ where: { id } });
    await audit({ userId: user.id, action: 'intake.discard', entityType: 'Intake', entityId: id, detail: { reference: i.reference } }, tx);
  });
}

function validationErrors(i: IntakeFull, locations: Set<string>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!i.supplier) e.supplier = 'Enter the supplier / vendor.';
  if (!i.poReference) e.poReference = 'Enter the PO reference.';
  if (!i.projectId) e.projectId = 'Choose the project.';
  if (!i.deliveryLocation) e.deliveryLocation = 'Choose the delivery location.';
  else if (!locations.has(i.deliveryLocation)) e.deliveryLocation = 'Choose a delivery location from the list.';
  if (!i.deliveryDate) e.deliveryDate = 'Enter the delivery date.';
  if (i.lineItems.length === 0) e.lineItems = 'Add at least one line item.';
  i.lineItems.forEach((l, idx) => {
    if (l.category.requiresSerial && !l.serial) e[`lineItems.${idx}.serial`] = `Line ${idx + 1} (${l.makeModel}) needs a serial number.`;
  });
  const seen = new Map<string, number>();
  i.lineItems.forEach((l, idx) => {
    if (!l.serial) return;
    const key = `${l.makeModel.toLowerCase()}|${l.serial.toLowerCase()}`;
    if (seen.has(key)) e[`lineItems.${idx}.serial`] = `Line ${idx + 1} repeats serial ${l.serial} from line ${seen.get(key)! + 1}.`;
    seen.set(key, idx);
  });
  i.checks.forEach((c) => {
    if (!c.answer) e[`checks.${c.question - 1}`] = `Answer check ${c.question}: "${INTAKE_CHECK_QUESTIONS[c.question - 1]}"`;
  });
  if (!i.validatedByName) e.validatedByName = 'Enter the validator’s full name.';
  if (!i.validatedByTitle) e.validatedByTitle = 'Enter the validator’s title.';
  if (!i.validatedDate) e.validatedDate = 'Enter the validation date.';
  return e;
}

export interface ValidationResult {
  reference: string;
  created: Array<{ tag: string; result: 'PASSED' | 'FAILED'; makeModel: string }>;
  passed: number;
  failed: number;
  quantityMismatch: boolean;
  alreadyValidated: boolean;
}

function resultOf(i: IntakeFull, alreadyValidated: boolean): ValidationResult {
  const created = i.lineItems
    .filter((l) => l.asset)
    .map((l) => ({ tag: l.asset!.tag, result: l.result, makeModel: l.makeModel }));
  return {
    reference: i.reference,
    created,
    passed: created.filter((c) => c.result === 'PASSED').length,
    failed: created.filter((c) => c.result === 'FAILED').length,
    quantityMismatch: i.checks.find((c) => c.question === CHECK_QUANTITY_MATCH)?.answer === 'NO',
    alreadyValidated,
  };
}

/** Validate & create assets: all-or-nothing; re-submitting returns the existing result. */
export async function validateIntake(id: string, user: SessionUser, ip: string): Promise<ValidationResult> {
  return withTx(
    async (tx) => {
      const lockRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "Intake" WHERE id = $1::uuid FOR UPDATE`, id);
      if (!lockRows[0]) throw notFound('Intake not found.');
      const intake = await tx.intake.findUniqueOrThrow({ where: { id }, include: intakeInclude });
      if (intake.status === 'VALIDATED') return resultOf(intake, true);

      const locations = await tx.location.findMany();
      const errors = validationErrors(intake, new Set(locations.map((l) => l.name)));
      if (Object.keys(errors).length) {
        throw badRequest(Object.values(errors)[0]!, { fields: errors });
      }
      // Friendly duplicate-serial message before the unique index would fire.
      for (const l of intake.lineItems) {
        if (!l.serial) continue;
        const dup = await tx.asset.findFirst({
          where: { makeModel: { equals: l.makeModel, mode: 'insensitive' }, serial: { equals: l.serial, mode: 'insensitive' } },
          select: { tag: true },
        });
        if (dup) throw conflict(`Serial ${l.serial} (${l.makeModel}) is already registered as ${dup.tag}.`);
      }

      const location = locations.find((loc) => loc.name === intake.deliveryLocation)!;
      const oemSupport = intake.checks.find((c) => c.question === CHECK_OEM_SUPPORT)?.answer === 'YES';
      const now = new Date();
      const actor = { id: user.id, name: user.name };
      for (const l of intake.lineItems) {
        const { tag, tagNumber } = await nextAssetTag(tx);
        const failed = l.result === 'FAILED';
        const asset = await tx.asset.create({
          data: {
            tag,
            tagNumber,
            categoryId: l.categoryId,
            description: l.category.description || l.category.name,
            makeModel: l.makeModel,
            serial: l.serial,
            status: failed ? 'DAMAGED' : 'IN_STORE',
            damageOrigin: failed ? 'INTAKE_FAILURE' : null,
            damagedAt: failed ? now : null,
            condition: failed ? 'DAMAGED' : 'GOOD',
            projectId: intake.projectId!,
            locationId: location.id,
            intakeLineItemId: l.id,
            oemSupport,
            unitCost: l.unitCost,
            notes: l.notes,
          },
        });
        await writeCustody(tx, {
          assetId: asset.id,
          type: failed ? 'INTAKE_FAILED' : 'INTAKE_VALIDATED',
          statusAfter: asset.status,
          actor,
          occurredAt: now,
          toLocation: location.name,
          detail: {
            intakeReference: intake.reference,
            supplier: intake.supplier,
            poReference: intake.poReference,
            validatedBy: intake.validatedByName,
            notes: l.notes,
          },
        });
      }
      await tx.intake.update({ where: { id }, data: { status: 'VALIDATED', validatedAt: now } });
      const done = await tx.intake.findUniqueOrThrow({ where: { id }, include: intakeInclude });
      const result = resultOf(done, false);
      if (result.failed > 0) {
        await notifyIT(
          {
            kind: 'DAMAGE',
            message: [{ b: intake.reference }, { t: `: ${result.failed} item(s) failed intake and were flagged Damaged` }],
            link: `/assets?status=DAMAGED`,
          },
          tx,
        );
      }
      await audit(
        { userId: user.id, action: 'intake.validate', entityType: 'Intake', entityId: id, detail: { passed: result.passed, failed: result.failed }, ipAddress: ip },
        tx,
      );
      return result;
    },
    { timeoutMs: 60000 },
  );
}
