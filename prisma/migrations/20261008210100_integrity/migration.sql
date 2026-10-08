-- Integrity rules Prisma cannot express. See docs/DECISIONS.md D2, D13, D26.

-- Document numbering: one sequence per prefix. Gap-tolerant, never duplicated.
CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ref_in_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ref_iss_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ref_rtr_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ref_mvt_seq START 1;
CREATE SEQUENCE IF NOT EXISTS ref_ind_seq START 1;

-- An asset can be on at most one active (non-final) form at a time.
CREATE UNIQUE INDEX "FormAsset_one_active_form_per_asset" ON "FormAsset" ("assetId") WHERE "active";

-- Serial unique per make/model where present (case-insensitive).
CREATE UNIQUE INDEX "Asset_makeModel_serial_key" ON "Asset" (lower("makeModel"), lower("serial")) WHERE "serial" IS NOT NULL;

-- Damage origin exists only while Damaged.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_damage_origin_only_when_damaged"
  CHECK (("status" = 'DAMAGED') = ("damageOrigin" IS NOT NULL));
-- Repair can only be open on a Damaged asset.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_repair_only_when_damaged"
  CHECK ("repairFormId" IS NULL OR "status" = 'DAMAGED');
-- Soft delete only for Retired assets.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_deleted_only_when_retired"
  CHECK ("deletedAt" IS NULL OR "status" = 'RETIRED');
-- Issued assets always have a holder.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_issued_has_holder"
  CHECK ("status" <> 'ISSUED' OR "currentHolderId" IS NOT NULL);
-- In Store / Retired assets have no holder.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_store_retired_no_holder"
  CHECK ("status" NOT IN ('IN_STORE', 'RETIRED') OR "currentHolderId" IS NULL);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_unit_cost_non_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0);
ALTER TABLE "IntakeLineItem" ADD CONSTRAINT "IntakeLineItem_unit_cost_non_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0);
ALTER TABLE "IntakeCheck" ADD CONSTRAINT "IntakeCheck_question_range" CHECK ("question" BETWEEN 1 AND 7);

-- Chain of custody is append-only.
CREATE OR REPLACE FUNCTION custody_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CustodyEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustodyEvent_no_update" BEFORE UPDATE OR DELETE ON "CustodyEvent"
  FOR EACH ROW EXECUTE FUNCTION custody_event_immutable();

-- Search support for the registry.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Asset_search_trgm" ON "Asset" USING gin (("tag" || ' ' || coalesce("serial", '') || ' ' || "description" || ' ' || "makeModel") gin_trgm_ops);
