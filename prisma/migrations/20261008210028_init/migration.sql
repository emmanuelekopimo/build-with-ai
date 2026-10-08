-- CreateEnum
CREATE TYPE "Role" AS ENUM ('IT_ADMIN', 'IT_SUPPORT', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STORE', 'ISSUED', 'DAMAGED', 'RETIRED');

-- CreateEnum
CREATE TYPE "DamageOrigin" AS ENUM ('REPORTED', 'RETURNED', 'INTAKE_FAILURE');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- CreateEnum
CREATE TYPE "CheckAnswer" AS ENUM ('YES', 'NO', 'NA');

-- CreateEnum
CREATE TYPE "LineResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('ISSUANCE', 'RETURN', 'MOVEMENT', 'INDEMNITY');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'AWAITING', 'PARTIAL', 'SIGNED', 'EXPIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('RECIPIENT', 'ISSUER', 'RETURNER', 'RECEIVER', 'HANDOVER', 'COUNTERPARTY');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('PENDING', 'SIGNED', 'RECORDED');

-- CreateEnum
CREATE TYPE "ApproverRole" AS ENUM ('CTO', 'ADMIN_OFFICER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STAFF', 'VENDOR');

-- CreateEnum
CREATE TYPE "EndpointType" AS ENUM ('STAFF', 'LOCATION', 'VENDOR');

-- CreateEnum
CREATE TYPE "RetireReason" AS ENUM ('BEYOND_ECONOMIC_REPAIR', 'LOST_OR_STOLEN', 'OBSOLETE', 'REJECTED_AT_INTAKE', 'OTHER');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('INTAKE_VALIDATED', 'INTAKE_FAILED', 'ISSUED', 'REISSUED', 'MOVED', 'RETURNED', 'DAMAGE_REPORTED', 'SENT_FOR_REPAIR', 'REPAIRED', 'REPAIR_FAILED', 'RETIRED', 'REINSTATED_FOR_REPAIR', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('OVERDUE_RETURN', 'LINK_EXPIRING', 'SIGNED', 'EXPIRED', 'APPROVED', 'REJECTED', 'DAMAGE', 'INFO');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "title" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isStore" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'laptop',
    "requiresSerial" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "type" "PersonType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "position" TEXT,
    "staffId" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "tagNumber" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "makeModel" TEXT NOT NULL,
    "serial" TEXT,
    "status" "AssetStatus" NOT NULL,
    "damageOrigin" "DamageOrigin",
    "damagedAt" TIMESTAMP(3),
    "condition" "Condition" NOT NULL DEFAULT 'GOOD',
    "projectId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "currentHolderId" UUID,
    "currentFormId" UUID,
    "repairFormId" UUID,
    "intakeLineItemId" UUID,
    "oemSupport" BOOLEAN NOT NULL DEFAULT false,
    "unitCost" DECIMAL(14,2),
    "notes" TEXT,
    "retireReason" "RetireReason",
    "retiredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intake" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "supplier" TEXT NOT NULL DEFAULT '',
    "poReference" TEXT NOT NULL DEFAULT '',
    "projectId" UUID,
    "deliveryLocation" TEXT NOT NULL DEFAULT '',
    "deliveryDate" DATE,
    "validatedByName" TEXT NOT NULL DEFAULT '',
    "validatedByTitle" TEXT NOT NULL DEFAULT '',
    "validatedDate" DATE,
    "validatedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeLineItem" (
    "id" UUID NOT NULL,
    "intakeId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "makeModel" TEXT NOT NULL,
    "serial" TEXT,
    "notes" TEXT,
    "result" "LineResult" NOT NULL DEFAULT 'PASSED',
    "unitCost" DECIMAL(14,2),

    CONSTRAINT "IntakeLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeCheck" (
    "id" UUID NOT NULL,
    "intakeId" UUID NOT NULL,
    "question" INTEGER NOT NULL,
    "answer" "CheckAnswer",
    "remark" TEXT,

    CONSTRAINT "IntakeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" UUID NOT NULL,
    "type" "FormType" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "parentFormId" UUID,
    "data" JSONB NOT NULL,
    "temporary" BOOLEAN NOT NULL DEFAULT false,
    "expectedReturn" DATE,
    "sentAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "idempotencyKey" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAsset" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "condition" "Condition",
    "resultingStatus" "AssetStatus",
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "FormAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "role" "PartyRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT,
    "position" TEXT,
    "needsSignature" BOOLEAN NOT NULL DEFAULT true,
    "status" "PartyStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenExpiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "expiryWarnedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "typedName" TEXT,
    "signerDepartmentRole" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "role" "ApproverRole" NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'WAITING',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDocument" (
    "id" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "pdf" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "type" "CustodyEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "actorName" TEXT NOT NULL,
    "fromHolder" TEXT,
    "toHolder" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "formId" UUID,
    "formReference" TEXT,
    "statusAfter" "AssetStatus" NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "message" JSONB NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tag_key" ON "Asset"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tagNumber_key" ON "Asset"("tagNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_intakeLineItemId_key" ON "Asset"("intakeLineItemId");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE INDEX "Asset_currentHolderId_idx" ON "Asset"("currentHolderId");

-- CreateIndex
CREATE INDEX "Asset_createdAt_idx" ON "Asset"("createdAt");

-- CreateIndex
CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_reference_key" ON "Intake"("reference");

-- CreateIndex
CREATE INDEX "IntakeLineItem_intakeId_idx" ON "IntakeLineItem"("intakeId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeCheck_intakeId_question_key" ON "IntakeCheck"("intakeId", "question");

-- CreateIndex
CREATE UNIQUE INDEX "Form_reference_key" ON "Form"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Form_idempotencyKey_key" ON "Form"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Form_type_status_idx" ON "Form"("type", "status");

-- CreateIndex
CREATE INDEX "Form_status_idx" ON "Form"("status");

-- CreateIndex
CREATE INDEX "Form_sentAt_idx" ON "Form"("sentAt");

-- CreateIndex
CREATE INDEX "FormAsset_assetId_idx" ON "FormAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAsset_formId_assetId_key" ON "FormAsset"("formId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_tokenHash_key" ON "Party"("tokenHash");

-- CreateIndex
CREATE INDEX "Party_formId_idx" ON "Party"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_tokenHash_key" ON "Approval"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_formId_role_key" ON "Approval"("formId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FormDocument_formId_key" ON "FormDocument"("formId");

-- CreateIndex
CREATE INDEX "CustodyEvent_assetId_occurredAt_idx" ON "CustodyEvent"("assetId", "occurredAt");

-- CreateIndex
CREATE INDEX "CustodyEvent_type_idx" ON "CustodyEvent"("type");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_intakeLineItemId_fkey" FOREIGN KEY ("intakeLineItemId") REFERENCES "IntakeLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeLineItem" ADD CONSTRAINT "IntakeLineItem_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeLineItem" ADD CONSTRAINT "IntakeLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeCheck" ADD CONSTRAINT "IntakeCheck_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_parentFormId_fkey" FOREIGN KEY ("parentFormId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAsset" ADD CONSTRAINT "FormAsset_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAsset" ADD CONSTRAINT "FormAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDocument" ADD CONSTRAINT "FormDocument_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
