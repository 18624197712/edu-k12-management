ALTER TABLE "Student" ADD COLUMN "totalHours" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Lesson" ADD COLUMN "appliedHours" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Renewal" ADD COLUMN "appliedHours" DECIMAL(65,30) NOT NULL DEFAULT 0;

UPDATE "Student" student
SET "totalHours" = GREATEST(
  student."remainingHours",
  COALESCE(NULLIF(archive."learningProfile"->>'totalHours', '')::DECIMAL, student."remainingHours")
)
FROM "StudentArchive" archive
WHERE archive."studentId" = student."id";

UPDATE "Student"
SET "totalHours" = "remainingHours"
WHERE "totalHours" = 0 AND "remainingHours" > 0;

UPDATE "Lesson"
SET "appliedHours" = CASE
  WHEN "status" = 'COMPLETED' THEN CASE
    WHEN "consumedHours" > 0 THEN "consumedHours"
    ELSE "durationMinutes"::DECIMAL / 60
  END
  ELSE 0
END;

CREATE TABLE "HourLedger" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lessonId" TEXT,
  "renewalId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "balanceAfter" DECIMAL(65,30) NOT NULL,
  "note" TEXT,
  "operatorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HourLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HourLedger_studentId_createdAt_idx" ON "HourLedger"("studentId", "createdAt");
CREATE INDEX "HourLedger_lessonId_idx" ON "HourLedger"("lessonId");
CREATE INDEX "HourLedger_renewalId_idx" ON "HourLedger"("renewalId");
ALTER TABLE "HourLedger" ADD CONSTRAINT "HourLedger_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HourLedger" ADD CONSTRAINT "HourLedger_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HourLedger" ADD CONSTRAINT "HourLedger_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "Renewal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
