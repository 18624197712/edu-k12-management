CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "Lesson"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "recurrenceGroupId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "TodoTask" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "studentId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" "TodoPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "relatedPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TodoTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentSubjectTeacher" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "teacherId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentSubjectTeacher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScoreBatch" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "examDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScoreBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Score" ADD COLUMN "batchId" TEXT;
INSERT INTO "ScoreBatch" ("id", "studentId", "type", "name", "examDate", "createdAt", "updatedAt")
SELECT CONCAT('batch_', MD5("studentId" || "examName" || "examDate"::text)), "studentId",
  CASE
    WHEN "examName" LIKE '%入学%' THEN 'ENTRANCE'
    WHEN "examName" LIKE '%周测%' THEN 'WEEKLY'
    WHEN "examName" LIKE '%月考%' THEN 'MONTHLY'
    WHEN "examName" LIKE '%期中%' THEN 'MIDTERM'
    WHEN "examName" LIKE '%期末%' THEN 'FINAL'
    ELSE 'OTHER'
  END,
  "examName", "examDate", MIN("createdAt"), CURRENT_TIMESTAMP
FROM "Score"
GROUP BY "studentId", "examName", "examDate";
UPDATE "Score" SET "batchId" = CONCAT('batch_', MD5("studentId" || "examName" || "examDate"::text));

DELETE FROM "Score" a USING "Score" b
WHERE a."studentId" = b."studentId" AND a."batchId" = b."batchId" AND a."subject" = b."subject"
  AND (a."createdAt" < b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" < b."id"));

ALTER TABLE "Score" ALTER COLUMN "batchId" SET NOT NULL;
ALTER TABLE "Score" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "StudentSubjectTeacher_studentId_subject_key" ON "StudentSubjectTeacher"("studentId", "subject");
CREATE INDEX "StudentSubjectTeacher_teacherId_idx" ON "StudentSubjectTeacher"("teacherId");
CREATE INDEX "TodoTask_ownerUserId_dueAt_idx" ON "TodoTask"("ownerUserId", "dueAt");
CREATE INDEX "TodoTask_studentId_idx" ON "TodoTask"("studentId");
CREATE INDEX "Lesson_startsAt_idx" ON "Lesson"("startsAt");
CREATE INDEX "Lesson_recurrenceGroupId_startsAt_idx" ON "Lesson"("recurrenceGroupId", "startsAt");
CREATE UNIQUE INDEX "ScoreBatch_studentId_name_examDate_key" ON "ScoreBatch"("studentId", "name", "examDate");
CREATE INDEX "ScoreBatch_studentId_examDate_idx" ON "ScoreBatch"("studentId", "examDate");
CREATE UNIQUE INDEX "Score_studentId_batchId_subject_key" ON "Score"("studentId", "batchId", "subject");
CREATE INDEX "Score_studentId_examDate_idx" ON "Score"("studentId", "examDate");

ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TodoTask" ADD CONSTRAINT "TodoTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectTeacher" ADD CONSTRAINT "StudentSubjectTeacher_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectTeacher" ADD CONSTRAINT "StudentSubjectTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoreBatch" ADD CONSTRAINT "ScoreBatch_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScoreBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "StudentSubjectTeacher" ("id", "studentId", "subject", "teacherId", "createdAt", "updatedAt")
SELECT CONCAT('assignment_', MD5(s."id" || subject)), s."id", subject, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Student" s, UNNEST(s."subjects") subject
ON CONFLICT ("studentId", "subject") DO NOTHING;
