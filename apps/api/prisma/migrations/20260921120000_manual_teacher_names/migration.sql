ALTER TABLE "StudentSubjectTeacher" ADD COLUMN "teacherName" TEXT;
ALTER TABLE "Course" ADD COLUMN "teacherName" TEXT;

UPDATE "StudentSubjectTeacher" assignment
SET "teacherName" = teacher."name"
FROM "Teacher" teacher
WHERE assignment."teacherId" = teacher."id";

UPDATE "Course" course
SET "teacherName" = teacher."name"
FROM "Teacher" teacher
WHERE course."teacherId" = teacher."id";
