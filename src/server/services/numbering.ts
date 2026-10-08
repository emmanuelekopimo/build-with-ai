// Document numbering from Postgres sequences: gap-tolerant, never duplicated, never reused.
import type { FormType } from '../../shared/constants';
import { FORM_PREFIX } from '../../shared/constants';
import { tagFromNumber } from '../../shared/format';
import type { Tx } from '../db';
import { db } from '../db';

const SEQ: Record<FormType, string> = {
  ISSUANCE: 'ref_iss_seq',
  RETURN: 'ref_rtr_seq',
  MOVEMENT: 'ref_mvt_seq',
  INDEMNITY: 'ref_ind_seq',
};

async function nextval(tx: Tx, seq: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT nextval('${seq}') AS n`);
  return Number(rows[0]!.n);
}

export async function nextFormReference(tx: Tx, type: FormType): Promise<string> {
  return `${FORM_PREFIX[type]}-${String(await nextval(tx, SEQ[type])).padStart(4, '0')}`;
}

export async function nextIntakeReference(tx: Tx): Promise<string> {
  return `IN-${String(await nextval(tx, 'ref_in_seq')).padStart(3, '0')}`;
}

export async function nextAssetTag(tx: Tx): Promise<{ tag: string; tagNumber: number }> {
  const n = await nextval(tx, 'asset_tag_seq');
  return { tag: tagFromNumber(n), tagNumber: n };
}

/** Preview of the next N tags (not reserved — another intake may take them first). */
export async function previewTags(count: number): Promise<string[]> {
  const rows = await db().$queryRawUnsafe<Array<{ last_value: bigint; is_called: boolean }>>(
    'SELECT last_value, is_called FROM asset_tag_seq',
  );
  const r = rows[0]!;
  const first = Number(r.last_value) + (r.is_called ? 1 : 0);
  return Array.from({ length: count }, (_, i) => tagFromNumber(first + i));
}
