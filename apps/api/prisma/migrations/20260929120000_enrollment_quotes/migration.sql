CREATE TYPE "EnrollmentType" AS ENUM ('FIRST_ENROLLMENT', 'RENEWAL');

ALTER TABLE "Renewal"
  ALTER COLUMN "studentId" DROP NOT NULL,
  ADD COLUMN "type" "EnrollmentType" NOT NULL DEFAULT 'RENEWAL',
  ADD COLUMN "prospectName" TEXT,
  ADD COLUMN "prospectPhone" TEXT,
  ADD COLUMN "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "normalHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "halfHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "giftHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "giftType" TEXT,
  ADD COLUMN "activities" JSONB,
  ADD COLUMN "balanceBefore" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "balanceAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "weeklyFrequency" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "sessionHours" DECIMAL(65,30) NOT NULL DEFAULT 2,
  ADD COLUMN "projectionStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "currentEstimatedEndAt" TIMESTAMP(3),
  ADD COLUMN "estimatedEndAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Renewal" renewal
SET
  "prospectName" = student."name",
  "prospectPhone" = student."guardianPhone",
  "normalHours" = renewal."hours",
  "unitPrice" = CASE WHEN renewal."hours" > 0 THEN renewal."amount" / renewal."hours" ELSE 0 END,
  "balanceAfter" = renewal."appliedHours",
  "confirmedAt" = CASE WHEN renewal."status" = 'COMPLETED' THEN renewal."createdAt" ELSE NULL END
FROM "Student" student
WHERE renewal."studentId" = student."id";

ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "HourLedger_renewalId_idx";
CREATE UNIQUE INDEX "HourLedger_renewalId_key" ON "HourLedger"("renewalId");
CREATE INDEX "Renewal_studentId_createdAt_idx" ON "Renewal"("studentId", "createdAt");
CREATE INDEX "Renewal_createdById_status_idx" ON "Renewal"("createdById", "status");
CREATE INDEX "Renewal_type_status_idx" ON "Renewal"("type", "status");
