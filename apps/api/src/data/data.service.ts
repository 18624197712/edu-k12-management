import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Prisma, Role, StudentStatus, TodoPriority, WorkflowStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import type { AuthUser } from '../auth/auth.guard';
import { PrismaService } from './prisma.service';

type JsonMap = Record<string, any>;
const number = (value: unknown) => Number(value || 0);
export function buildWeeklyLessonDates(startsAt: Date, repeatUntil: Date, recurring: boolean) {
  if (!recurring) return [new Date(startsAt)];
  const dates: Date[] = [];
  for (let cursor = new Date(startsAt); cursor <= repeatUntil; cursor = new Date(cursor.getTime() + 7 * 86400000)) dates.push(new Date(cursor));
  return dates;
}
export function lessonHours(durationMinutes: number, consumedHours?: unknown) {
  const explicit = number(consumedHours);
  return explicit > 0 ? explicit : Math.round((durationMinutes / 60) * 100) / 100;
}
export function lessonAccountingChange(previousApplied: unknown, status: WorkflowStatus, durationMinutes: number, consumedHours?: unknown) {
  const appliedHours = status === WorkflowStatus.COMPLETED ? lessonHours(durationMinutes, consumedHours) : 0;
  return { appliedHours, delta: appliedHours - number(previousApplied) };
}

@Injectable()
export class DataService {
  private readonly s3Options = { region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY || 'minio', secretAccessKey: process.env.S3_SECRET_KEY || 'minio123' } };
  private s3 = new S3Client({ ...this.s3Options, endpoint: process.env.S3_ENDPOINT });
  private publicS3 = new S3Client({ ...this.s3Options, endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT });
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const bucket = process.env.S3_BUCKET || 'edu-materials';
    try { await this.s3.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch { try { await this.s3.send(new CreateBucketCommand({ Bucket: bucket })); } catch { console.warn('Object storage unavailable; signed uploads are disabled until MinIO is ready.'); } }
  }

  private async studentScope(user: AuthUser) {
    if (user.role === Role.ADMIN) return {};
    const teacher = await this.prisma.teacher.findUnique({ where: { userId: user.sub } });
    if (!teacher) return { id: '__none__' };
    if (user.role === Role.HEAD_TEACHER) return { headTeacherId: teacher.id };
    return { lessons: { some: { course: { teacherId: teacher.id } } } };
  }

  private mapStudent(row: any) {
    const profile = (row.archive?.learningProfile || {}) as JsonMap;
    const assignments = row.subjectTeachers || [];
    return {
      id: row.id, name: row.name, grade: row.grade, school: row.school, subjects: row.subjects,
      remainingHours: number(row.remainingHours), status: row.status,
      phone: row.guardianPhone, guardianName: profile.guardianName || '-', gender: profile.gender || '-',
      address: profile.address || '-', schedule: profile.schedule || '-', totalHours: number(row.totalHours),
      headTeacher: profile.headTeacherName || row.headTeacher?.name || '-',
      teachers: assignments.length ? assignments.map((item: any) => item.teacherName || item.teacher?.name).filter(Boolean) : profile.teachers || [profile.headTeacherName || row.headTeacher?.name].filter(Boolean),
      subjectTeachers: assignments.map((item: any) => ({ subject: item.subject, teacherName: item.teacherName || item.teacher?.name || '' })),
      weakPoints: profile.weakPoints || '', completedLessons: row._count?.lessons || 0,
      familyNotes: row.archive?.familyNotes || '', communicationNotes: row.archive?.communicationNotes || [],
    };
  }

  async dashboard(user: AuthUser) {
    const scope = await this.studentScope(user);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const [students, lessons, renewals, reports, newStudents, meetings, pendingFeedback, todos] = await Promise.all([
      this.prisma.student.count({ where: { ...scope, status: StudentStatus.ACTIVE } as any }),
      this.prisma.lesson.findMany({ where: { student: scope as any }, include: { course: true, student: true }, orderBy: { startsAt: 'desc' } }),
      this.prisma.renewal.count({ where: { status: { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS] }, student: scope as any } }),
      this.prisma.learningReport.count({ where: { student: scope as any, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
      this.prisma.student.count({ where: { ...scope, createdAt: { gte: monthStart } } as any }),
      this.prisma.parentMeeting.count({ where: { student: scope as any, meetingDate: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.lesson.count({ where: { student: scope as any, status: WorkflowStatus.COMPLETED, feedback: { equals: Prisma.DbNull } } }),
      this.prisma.todoTask.count({ where: { ownerUserId: user.sub, completedAt: null, dueAt: { lt: dayEnd } } }),
    ]);
    const monthLessons = lessons.filter(x => x.startsAt.getMonth() === new Date().getMonth());
    return { students, lessonsToday: lessons.filter(x => x.startsAt >= dayStart && x.startsAt < dayEnd).length, lessonsThisMonth: monthLessons.reduce((n, x) => n + number(x.consumedHours), 0), pendingRenewals: renewals, reportsThisMonth: reports, newStudentsThisMonth: newStudents, familyContactsToday: meetings, pendingFeedback, pendingTodos: todos };
  }

  async students(query: JsonMap, user: AuthUser) {
    const page = Math.max(1, number(query.page) || 1), pageSize = Math.min(100, Math.max(1, number(query.pageSize) || 20));
    const scope = await this.studentScope(user), where: any = { ...scope };
    if (query.search) where.OR = [{ name: { contains: query.search, mode: 'insensitive' } }, { school: { contains: query.search, mode: 'insensitive' } }];
    if (query.status) where.status = query.status;
    if (query.grade) where.grade = { contains: query.grade };
    if (query.subject) where.subjects = { has: query.subject };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({ where, include: { headTeacher: true, archive: true, subjectTeachers: { include: { teacher: true } }, _count: { select: { lessons: { where: { status: WorkflowStatus.COMPLETED } } } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.student.count({ where }),
    ]);
    return { data: rows.map(row => this.mapStudent(row)), meta: { page, pageSize, total } };
  }

  async student(id: string, user: AuthUser) {
    const scope = await this.studentScope(user);
    const row = await this.prisma.student.findFirst({ where: { id, ...scope } as any, include: { headTeacher: true, archive: true, subjectTeachers: { include: { teacher: true } }, _count: { select: { lessons: { where: { status: WorkflowStatus.COMPLETED } } } } } });
    if (!row) throw new NotFoundException('学生不存在或无权查看');
    return this.mapStudent(row);
  }

  async createStudent(data: JsonMap, user: AuthUser) {
    const subjects = Array.from(new Set<string>((data.subjects || []).filter(Boolean)));
    const teacherBySubject = new Map<string, string>((data.subjectTeachers || []).map((item: JsonMap) => [item.subject, String(item.teacherName || '').trim()]));
    const totalHours = number(data.totalHours ?? data.profile?.totalHours ?? data.remainingHours);
    const row = await this.prisma.student.create({ data: { name: data.name, grade: data.grade, school: data.school || '', guardianPhone: data.phone || '', subjects, totalHours, remainingHours: number(data.remainingHours ?? totalHours), status: data.status || StudentStatus.ACTIVE, archive: { create: { learningProfile: data.profile || {}, familyNotes: data.familyNotes || '' } }, subjectTeachers: { create: subjects.map((subject: string) => ({ subject, teacherName: teacherBySubject.get(subject) || null })) } }, include: { archive: true, headTeacher: true, subjectTeachers: { include: { teacher: true } }, _count: { select: { lessons: { where: { status: WorkflowStatus.COMPLETED } } } } } });
    await this.audit(user, 'CREATE', 'Student', row.id, data); return this.mapStudent(row);
  }

  async updateStudent(id: string, data: JsonMap, user: AuthUser) {
    const current = await this.student(id, user);
    const subjects = data.subjects === undefined ? current.subjects : Array.from(new Set((data.subjects || []).filter(Boolean)));
    const profile = data.profile ? { guardianName: current.guardianName, gender: current.gender, address: current.address, schedule: current.schedule, weakPoints: current.weakPoints, ...data.profile } : undefined;
    if (profile) delete profile.totalHours;
    await this.prisma.$transaction(async tx => {
      await tx.student.update({ where: { id }, data: { name: data.name, grade: data.grade, school: data.school, guardianPhone: data.phone, subjects, status: data.status, headTeacherId: data.headTeacherId } });
      if (profile || data.familyNotes !== undefined) await tx.studentArchive.upsert({ where: { studentId: id }, create: { studentId: id, learningProfile: profile || {}, familyNotes: data.familyNotes || '' }, update: { learningProfile: profile, familyNotes: data.familyNotes } });
      if (data.subjects !== undefined || data.subjectTeachers !== undefined) {
        const teacherBySubject = new Map<string, string>((data.subjectTeachers || []).map((item: JsonMap) => [item.subject, String(item.teacherName || '').trim()]));
        await tx.studentSubjectTeacher.deleteMany({ where: { studentId: id } });
        if (subjects.length) await tx.studentSubjectTeacher.createMany({ data: subjects.map((subject: string) => ({ studentId: id, subject, teacherName: teacherBySubject.get(subject) || null })) });
      }
    });
    await this.audit(user, 'UPDATE', 'Student', id, data); return this.student(id, user);
  }

  async updateArchive(id: string, data: JsonMap, user: AuthUser) {
    await this.student(id, user);
    const archive = await this.prisma.studentArchive.upsert({ where: { studentId: id }, create: { studentId: id, learningProfile: data.learningProfile || {}, familyNotes: data.familyNotes, communicationNotes: data.communicationNotes }, update: { learningProfile: data.learningProfile, familyNotes: data.familyNotes, communicationNotes: data.communicationNotes } });
    await this.audit(user, 'UPDATE', 'StudentArchive', archive.id, data); return archive;
  }

  async courses() {
    return this.prisma.course.findMany({ include: { teacher: true }, orderBy: [{ grade: 'asc' }, { subject: 'asc' }] });
  }

  async todos(query: JsonMap, user: AuthUser) {
    const page = Math.max(1, number(query.page) || 1), pageSize = Math.min(100, Math.max(1, number(query.pageSize) || 20));
    const where: any = { ownerUserId: user.sub };
    if (query.status === 'pending') where.completedAt = null;
    if (query.status === 'completed') where.completedAt = { not: null };
    if (query.scope === 'today') { const end = new Date(); end.setHours(24, 0, 0, 0); where.dueAt = { lt: end }; }
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00`), end = new Date(start); end.setDate(end.getDate() + 1);
      where.dueAt = { gte: start, lt: end };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.todoTask.findMany({ where, include: { student: { select: { id: true, name: true } } }, orderBy: [{ completedAt: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.todoTask.count({ where }),
    ]);
    return { data: rows, meta: { page, pageSize, total } };
  }

  async saveTodo(data: JsonMap, user: AuthUser, id?: string) {
    if (data.studentId) await this.student(data.studentId, user);
    const payload = { title: data.title, category: data.category || '其他', priority: data.priority || TodoPriority.MEDIUM, dueAt: new Date(data.dueAt), studentId: data.studentId || null, relatedPath: data.relatedPath || null };
    const row = id
      ? await this.prisma.todoTask.update({ where: { id, ownerUserId: user.sub }, data: payload })
      : await this.prisma.todoTask.create({ data: { ...payload, ownerUserId: user.sub } });
    await this.audit(user, id ? 'UPDATE' : 'CREATE', 'TodoTask', row.id, data); return row;
  }

  async setTodoCompleted(id: string, completed: boolean, user: AuthUser) {
    const row = await this.prisma.todoTask.update({ where: { id, ownerUserId: user.sub }, data: { completedAt: completed ? new Date() : null } });
    await this.audit(user, completed ? 'COMPLETE' : 'REOPEN', 'TodoTask', id); return row;
  }

  async deleteTodo(id: string, user: AuthUser) {
    await this.prisma.todoTask.delete({ where: { id, ownerUserId: user.sub } });
    await this.audit(user, 'DELETE', 'TodoTask', id);
  }

  async plans(studentId?: string) { return this.prisma.teachingPlan.findMany({ where: studentId ? { studentId } : {}, include: { student: true, teacher: true }, orderBy: { createdAt: 'desc' } }); }
  async savePlan(data: JsonMap, user: AuthUser) { const teacher = data.teacherId ? { id: data.teacherId } : await this.prisma.teacher.findFirstOrThrow(); const row = await this.prisma.teachingPlan.create({ data: { title: data.title, studentId: data.studentId, teacherId: teacher.id, subject: data.subject, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), goals: data.goals || '', status: data.status || WorkflowStatus.DRAFT, term: data.term, fileName: data.fileName, objectKey: data.objectKey, fileSize: data.fileSize, uploaderName: user.name } }); await this.audit(user, 'CREATE', 'TeachingPlan', row.id, data); return row; }
  async scoreBatches(studentId: string, user: AuthUser) {
    await this.student(studentId, user);
    return this.prisma.scoreBatch.findMany({ where: { studentId }, include: { scores: { orderBy: { subject: 'asc' } } }, orderBy: { examDate: 'desc' } });
  }
  async saveScoreBatch(data: JsonMap, user: AuthUser) {
    await this.student(data.studentId, user);
    const examDate = new Date(data.examDate || Date.now());
    const row = await this.prisma.scoreBatch.upsert({ where: { studentId_name_examDate: { studentId: data.studentId, name: data.name, examDate } }, create: { studentId: data.studentId, type: data.type || 'OTHER', name: data.name, examDate }, update: { type: data.type || 'OTHER' } });
    await this.audit(user, 'UPSERT', 'ScoreBatch', row.id, data); return row;
  }
  async scores(studentId?: string, batchId?: string) { return this.prisma.score.findMany({ where: { ...(studentId ? { studentId } : {}), ...(batchId ? { batchId } : {}) }, include: { batch: true }, orderBy: [{ examDate: 'desc' }, { subject: 'asc' }] }); }
  async saveScore(data: JsonMap, user: AuthUser) {
    await this.student(data.studentId, user);
    let batchId = data.batchId as string | undefined;
    if (!batchId) batchId = (await this.saveScoreBatch({ studentId: data.studentId, type: data.examType || 'OTHER', name: data.examName, examDate: data.examDate || new Date().toISOString() }, user)).id;
    const batch = await this.prisma.scoreBatch.findFirstOrThrow({ where: { id: batchId, studentId: data.studentId } });
    const row = await this.prisma.score.upsert({ where: { studentId_batchId_subject: { studentId: data.studentId, batchId, subject: data.subject } }, create: { studentId: data.studentId, batchId, teacherId: data.teacherId || null, examName: batch.name, subject: data.subject, score: number(data.score), totalScore: number(data.totalScore || 100), examDate: batch.examDate, note: data.note }, update: { teacherId: data.teacherId || undefined, score: number(data.score), totalScore: number(data.totalScore || 100), note: data.note, examName: batch.name, examDate: batch.examDate } });
    await this.audit(user, 'UPSERT', 'Score', row.id, data); return row;
  }
  async deleteScore(id: string, user: AuthUser) { await this.prisma.score.delete({ where: { id } }); await this.audit(user, 'DELETE', 'Score', id); }
  async lessons(query: JsonMap, user: AuthUser) {
    const scope = await this.studentScope(user), where: any = { student: scope as any };
    if (query.studentId) where.studentId = query.studentId;
    if (query.start || query.end) where.startsAt = { ...(query.start ? { gte: new Date(query.start) } : {}), ...(query.end ? { lt: new Date(query.end) } : {}) };
    return this.prisma.lesson.findMany({ where, include: { student: true, course: { include: { teacher: true } } }, orderBy: { startsAt: 'asc' } });
  }
  async createLesson(data: JsonMap, user: AuthUser) {
    const student = await this.student(data.studentId, user);
    let course = data.courseId ? await this.prisma.course.findUnique({ where: { id: data.courseId } }) : null;
    const teacherName = String(data.teacherName || '').trim();
    if (!course) course = await this.prisma.course.findFirst({ where: { name: `${student.name}${data.subject}一对一`, subject: data.subject, grade: student.grade, teacherName } });
    if (!course) course = await this.prisma.course.create({ data: { name: `${student.name}${data.subject}一对一`, subject: data.subject, grade: student.grade, teacherName, pricePerHour: 0 } });
    const startsAt = new Date(data.startsAt), repeatUntil = data.repeatUntil ? new Date(data.repeatUntil) : startsAt;
    const recurrenceGroupId = data.recurrence === 'WEEKLY' ? randomUUID() : null;
    const dates = buildWeeklyLessonDates(startsAt, repeatUntil, !!recurrenceGroupId);
    const durationMinutes = number(data.durationMinutes) || 120;
    const consumedHours = lessonHours(durationMinutes, data.consumedHours);
    const status = data.status || WorkflowStatus.PENDING;
    const appliedHours = status === WorkflowStatus.COMPLETED ? consumedHours : 0;
    const rows = await this.prisma.$transaction(async tx => {
      const account = await tx.student.findUniqueOrThrow({ where: { id: data.studentId } });
      const debit = appliedHours * dates.length;
      if (number(account.remainingHours) < debit) throw new BadRequestException(`剩余课时不足，需要 ${debit} 课时`);
      if (debit) await tx.student.update({ where: { id: data.studentId }, data: { remainingHours: { decrement: debit } } });
      const created = [];
      let balance = number(account.remainingHours);
      for (const date of dates) {
        const row = await tx.lesson.create({ data: { courseId: course!.id, studentId: data.studentId, startsAt: date, durationMinutes, consumedHours, appliedHours, status, note: data.note || null, recurrenceGroupId }, include: { student: true, course: { include: { teacher: true } } } });
        created.push(row);
        if (appliedHours) {
          balance -= appliedHours;
          await tx.hourLedger.create({ data: { studentId: data.studentId, lessonId: row.id, type: 'LESSON_CONSUME', amount: -appliedHours, balanceAfter: balance, note: `${data.subject}课程完成`, operatorName: user.name } });
        }
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(user, 'CREATE', 'Lesson', rows[0]?.id, { ...data, count: rows.length }); return rows;
  }
  async updateLesson(id: string, data: JsonMap, user: AuthUser) {
    const current = await this.prisma.lesson.findUniqueOrThrow({ where: { id }, include: { course: { select: { subject: true } } } }); await this.student(current.studentId, user);
    if (data.teacherName !== undefined) await this.prisma.course.update({ where: { id: current.courseId }, data: { teacherName: String(data.teacherName || '').trim(), teacherId: null } });
    const targets = data.scope === 'FUTURE' && current.recurrenceGroupId ? await this.prisma.lesson.findMany({ where: { recurrenceGroupId: current.recurrenceGroupId, startsAt: { gte: current.startsAt } } }) : [current];
    const nextStart = data.startsAt ? new Date(data.startsAt) : undefined, delta = nextStart ? nextStart.getTime() - current.startsAt.getTime() : 0;
    await this.prisma.$transaction(async tx => {
      const account = await tx.student.findUniqueOrThrow({ where: { id: current.studentId } });
      const changes = targets.map(row => {
        const durationMinutes = data.durationMinutes ?? row.durationMinutes;
        const consumedHours = data.consumedHours !== undefined
          ? lessonHours(durationMinutes, data.consumedHours)
          : data.durationMinutes !== undefined
            ? lessonHours(durationMinutes)
            : number(row.consumedHours) || lessonHours(durationMinutes);
        const status = data.status ?? row.status;
        const accounting = lessonAccountingChange(row.appliedHours, status, durationMinutes, consumedHours);
        return { row, durationMinutes, consumedHours, status, ...accounting };
      });
      const totalDebit = changes.reduce((sum, item) => sum + item.delta, 0);
      if (number(account.remainingHours) < totalDebit) throw new BadRequestException(`剩余课时不足，需要再扣 ${totalDebit} 课时`);
      if (totalDebit) await tx.student.update({ where: { id: current.studentId }, data: { remainingHours: number(account.remainingHours) - totalDebit } });
      let balance = number(account.remainingHours);
      for (const item of changes) {
        await tx.lesson.update({ where: { id: item.row.id }, data: { startsAt: nextStart ? new Date(item.row.startsAt.getTime() + delta) : undefined, durationMinutes: item.durationMinutes, status: item.status, consumedHours: item.consumedHours, appliedHours: item.appliedHours, feedback: data.feedback, note: data.note } });
        if (item.delta) {
          balance -= item.delta;
          await tx.hourLedger.create({ data: { studentId: current.studentId, lessonId: item.row.id, type: item.delta > 0 ? 'LESSON_CONSUME' : 'LESSON_REFUND', amount: -item.delta, balanceAfter: balance, note: item.delta > 0 ? `${current.course.subject}课程完成自动扣减` : `${current.course.subject}课程撤销完成自动退回`, operatorName: user.name } });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(user, 'UPDATE', 'Lesson', id, data); return this.prisma.lesson.findUnique({ where: { id }, include: { student: true, course: { include: { teacher: true } } } });
  }
  async deleteLesson(id: string, scope: string, user: AuthUser) {
    const current = await this.prisma.lesson.findUniqueOrThrow({ where: { id }, include: { course: { select: { subject: true } } } }); await this.student(current.studentId, user);
    const targets = scope === 'FUTURE' && current.recurrenceGroupId ? await this.prisma.lesson.findMany({ where: { recurrenceGroupId: current.recurrenceGroupId, startsAt: { gte: current.startsAt } } }) : [current];
    await this.prisma.$transaction(async tx => {
      const account = await tx.student.findUniqueOrThrow({ where: { id: current.studentId } });
      let balance = number(account.remainingHours);
      const refund = targets.reduce((sum, row) => sum + number(row.appliedHours), 0);
      if (refund) await tx.student.update({ where: { id: current.studentId }, data: { remainingHours: { increment: refund } } });
      for (const row of targets) if (number(row.appliedHours)) {
        balance += number(row.appliedHours);
        await tx.hourLedger.create({ data: { studentId: current.studentId, lessonId: row.id, type: 'LESSON_REFUND', amount: number(row.appliedHours), balanceAfter: balance, note: `删除已完成${current.course.subject}课程退回课时`, operatorName: user.name } });
      }
      if (scope === 'FUTURE' && current.recurrenceGroupId) await tx.lesson.deleteMany({ where: { recurrenceGroupId: current.recurrenceGroupId, startsAt: { gte: current.startsAt } } }); else await tx.lesson.delete({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(user, 'DELETE', 'Lesson', id, { scope });
  }
  async reports(studentId?: string) { return this.prisma.learningReport.findMany({ where: studentId ? { studentId } : {}, include: { student: true, teacher: true }, orderBy: { createdAt: 'desc' } }); }
  async generateReport(data: JsonMap) { const student = await this.prisma.student.findUniqueOrThrow({ where: { id: data.studentId }, include: { scores: { orderBy: { examDate: 'desc' } }, lessons: { include: { course: true }, orderBy: { startsAt: 'desc' } }, archive: true } }); const content = { lessonCount: student.lessons.length, subjects: student.subjects, scores: student.scores.slice(0, 10), weakPoints: (student.archive?.learningProfile as JsonMap)?.weakPoints || '', suggestions: '保持当前学习节奏，针对薄弱知识点进行专项训练，并定期复盘错题。' }; const teacher = await this.prisma.teacher.findFirst(); return this.prisma.learningReport.create({ data: { studentId: student.id, teacherId: teacher?.id, title: data.title || `${student.name}${data.kind || '月度学情报告'}`, periodStart: new Date(data.periodStart), periodEnd: new Date(data.periodEnd), content, status: WorkflowStatus.COMPLETED } }); }

  async meetings(studentId?: string) { return this.prisma.parentMeeting.findMany({ where: studentId ? { studentId } : {}, include: { student: true, teacher: true }, orderBy: { meetingDate: 'desc' } }); }
  async saveMeeting(data: JsonMap, user: AuthUser, id?: string) { const teacher = data.teacherId ? { id: data.teacherId } : await this.prisma.teacher.findFirst(); const payload = { studentId: data.studentId, teacherId: teacher?.id, meetingDate: new Date(data.meetingDate), feedback: data.feedback || {}, parentSuggestion: data.parentSuggestion || '', recorder: data.recorder || user.name }; const row = id ? await this.prisma.parentMeeting.update({ where: { id }, data: payload }) : await this.prisma.parentMeeting.create({ data: payload as any }); await this.audit(user, id ? 'UPDATE' : 'CREATE', 'ParentMeeting', row.id, data); return row; }
  async deleteMeeting(id: string, user: AuthUser) { await this.prisma.parentMeeting.delete({ where: { id } }); await this.audit(user, 'DELETE', 'ParentMeeting', id); }
  async renewals(studentId?: string) { return this.prisma.renewal.findMany({ where: studentId ? { studentId } : {}, include: { student: true }, orderBy: { createdAt: 'desc' } }); }
  calculateRenewal(data: JsonMap) { const original = number(data.price), normal = number(data.normalHours), half = number(data.halfHours), gifts = number(data.giftHours), activities = (data.activities || []) as JsonMap[]; const paid = original * normal + original * 0.5 * half + activities.reduce((sum, row) => sum + number(row.amount), 0); const totalHours = normal + half + gifts + activities.reduce((sum, row) => sum + number(row.hours), 0); return { paid, totalHours, averagePrice: totalHours ? Math.round(paid / totalHours * 100) / 100 : 0 }; }
  async saveRenewal(data: JsonMap, user: AuthUser) {
    const calc = this.calculateRenewal(data), status = data.status || WorkflowStatus.PENDING;
    const row = await this.prisma.$transaction(async tx => {
      const renewal = await tx.renewal.create({ data: { studentId: data.studentId, hours: calc.totalHours, appliedHours: status === WorkflowStatus.COMPLETED ? calc.totalHours : 0, amount: calc.paid, status, followUpAt: data.followUpAt ? new Date(data.followUpAt) : null, note: JSON.stringify(data) } });
      if (status === WorkflowStatus.COMPLETED && calc.totalHours > 0) {
        const student = await tx.student.update({ where: { id: data.studentId }, data: { totalHours: { increment: calc.totalHours }, remainingHours: { increment: calc.totalHours } } });
        await tx.hourLedger.create({ data: { studentId: data.studentId, renewalId: renewal.id, type: 'RENEWAL_ADD', amount: calc.totalHours, balanceAfter: student.remainingHours, note: `续费入账 ${calc.totalHours} 课时`, operatorName: user.name } });
      }
      return renewal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(user, 'CREATE', 'Renewal', row.id, data); return row;
  }
  async hourLedgers(studentId: string, user: AuthUser) {
    await this.student(studentId, user);
    return this.prisma.hourLedger.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async business(type?: string) { return this.prisma.businessApplication.findMany({ where: type ? { type } : {}, include: { student: true }, orderBy: { createdAt: 'desc' } }); }
  async saveBusiness(data: JsonMap, user: AuthUser) { const row = await this.prisma.businessApplication.create({ data: { code: `${data.type}-${Date.now()}`, studentId: data.studentId, type: data.type, reason: data.reason || '', amount: data.amount, status: data.status || WorkflowStatus.COMPLETED } }); await this.audit(user, 'CREATE', 'BusinessApplication', row.id, data); return row; }
  async deleteBusiness(id: string, user: AuthUser) { await this.prisma.businessApplication.delete({ where: { id } }); await this.audit(user, 'DELETE', 'BusinessApplication', id); }
  async recommendations(month?: string) { const rows = await this.prisma.recommendation.findMany({ orderBy: { createdAt: 'desc' } }); return month ? rows.filter(x => x.createdAt.toISOString().startsWith(month)) : rows; }
  async saveRecommendation(data: JsonMap, user: AuthUser, id?: string) { const payload = { studentName: data.studentName, grade: data.grade || '', subject: data.subject || '', referrer: data.referrer || '', status: data.status || WorkflowStatus.PENDING, trialAt: data.trialAt ? new Date(data.trialAt) : null, hasContact: data.hasContact, trialSubjects: data.trialSubjects, trialTeachers: data.trialTeachers, month: data.month }; const row = id ? await this.prisma.recommendation.update({ where: { id }, data: payload }) : await this.prisma.recommendation.create({ data: payload }); await this.audit(user, id ? 'UPDATE' : 'CREATE', 'Recommendation', row.id, data); return row; }
  async deleteRecommendation(id: string, user: AuthUser) { await this.prisma.recommendation.delete({ where: { id } }); await this.audit(user, 'DELETE', 'Recommendation', id); }
  async trainingModules() { return this.prisma.trainingModule.findMany({ include: { materials: true }, orderBy: { createdAt: 'asc' } }); }
  async saveTrainingModule(data: JsonMap, user: AuthUser, id?: string) { const row = id ? await this.prisma.trainingModule.update({ where: { id }, data: { name: data.name, description: data.description, color: data.color } }) : await this.prisma.trainingModule.create({ data: { name: data.name, description: data.description || '', color: data.color || 'blue' } }); await this.audit(user, id ? 'UPDATE' : 'CREATE', 'TrainingModule', row.id, data); return row; }
  async deleteTrainingModule(id: string, user: AuthUser) { await this.prisma.trainingModule.delete({ where: { id } }); await this.audit(user, 'DELETE', 'TrainingModule', id); }
  async uploadUrl(name: string, type: string) { if (!name) throw new BadRequestException('缺少文件名'); const key = `training/${Date.now()}-${name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')}`; const url = await getSignedUrl(this.publicS3, new PutObjectCommand({ Bucket: process.env.S3_BUCKET || 'edu-materials', Key: key, ContentType: type }), { expiresIn: 600 }); return { url, key }; }
  async completeUpload(data: JsonMap, user: AuthUser) { return this.prisma.trainingMaterial.create({ data: { moduleId: data.moduleId, name: data.name, objectKey: data.key, mimeType: data.mimeType || 'application/octet-stream', size: number(data.size), uploaderId: user.sub } }); }
  async downloadUrl(key: string) { return { url: await getSignedUrl(this.publicS3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET || 'edu-materials', Key: key }), { expiresIn: 600 }) }; }
  async deleteMaterial(id: string, user: AuthUser) { const row = await this.prisma.trainingMaterial.delete({ where: { id } }); await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET || 'edu-materials', Key: row.objectKey })); await this.audit(user, 'DELETE', 'TrainingMaterial', id); }
  async analytics() { const [students, lessons, renewals, meetings, reports] = await Promise.all([this.prisma.student.findMany(), this.prisma.lesson.findMany(), this.prisma.renewal.findMany(), this.prisma.parentMeeting.findMany(), this.prisma.learningReport.findMany()]); const subjectDistribution = new Map<string, number>(); students.flatMap(x => x.subjects).forEach(x => subjectDistribution.set(x, (subjectDistribution.get(x) || 0) + 1)); return { summary: { students: students.length, lessonHours: lessons.reduce((n, x) => n + number(x.consumedHours), 0), renewals: renewals.length, meetings: meetings.length, reports: reports.length }, subjectDistribution: [...subjectDistribution].map(([name, value]) => ({ name, value })) }; }
  async profile(user: AuthUser) { const row = await this.prisma.user.findUnique({ where: { id: user.sub }, include: { teacher: true, auditLogs: { take: 20, orderBy: { createdAt: 'desc' } } } }); if (!row) throw new NotFoundException('用户不存在'); return { id: row.id, name: row.name, email: row.email, role: row.role, avatarUrl: row.avatarUrl, teacher: row.teacher, notificationSettings: row.notificationSettings, auditLogs: row.auditLogs }; }
  async updateProfile(data: JsonMap, user: AuthUser) { const row = await this.prisma.user.update({ where: { id: user.sub }, data: { name: data.name, notificationSettings: data.notificationSettings, avatarUrl: data.avatarUrl } }); await this.audit(user, 'UPDATE', 'User', user.sub, data); return row; }
  async audit(user: AuthUser, action: string, entity: string, entityId?: string, payload?: unknown) { await this.prisma.auditLog.create({ data: { userId: user.sub, action, entity, entityId, payload: payload as any } }); }

  async importStudents(buffer: Buffer, user: AuthUser) {
    if (!buffer) throw new BadRequestException('请选择 Excel 文件');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer); const sheet = workbook.worksheets[0]; if (!sheet) throw new BadRequestException('Excel 中没有工作表');
    const errors: string[] = [], rows: Array<{ name: string; grade: string; school: string; guardianPhone: string }> = [];
    sheet.eachRow((row, n) => { if (n === 1) return; const name = String(row.getCell(1).value || '').trim(), grade = String(row.getCell(2).value || '').trim(); if (!name || !grade) { errors.push(`第 ${n} 行：姓名和年级为必填项`); return; } rows.push({ name, grade, school: String(row.getCell(3).value || ''), guardianPhone: String(row.getCell(4).value || '') }); });
    const names = new Set<string>(); rows.forEach((row, index) => { if (names.has(row.name)) errors.push(`第 ${index + 2} 行：学生姓名重复`); names.add(row.name); });
    if (errors.length) return { imported: 0, errors };
    await this.prisma.$transaction(rows.map(row => this.prisma.student.create({ data: { ...row, status: StudentStatus.ACTIVE } })));
    await this.audit(user, 'IMPORT', 'Student', undefined, { count: rows.length }); return { imported: rows.length, errors: [] };
  }

  async importTemplate(kind: string) {
    const headers: Record<string, string[]> = { students: ['姓名','年级','学校','家长电话'], courses: ['课程名称','科目','年级','课时单价'], scores: ['学生姓名','考试名称','科目','成绩','满分','考试日期'], renewals: ['学生姓名','课时数','金额','备注'] };
    if (!headers[kind]) throw new BadRequestException('不支持的导入类型');
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('导入模板'); sheet.addRow(headers[kind]); sheet.getRow(1).font = { bold: true }; sheet.columns.forEach(column => { column.width = 20; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importLedger(kind: string, buffer: Buffer, user: AuthUser) {
    if (kind === 'students') return this.importStudents(buffer, user);
    if (!buffer) throw new BadRequestException('请选择 Excel 文件');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer); const sheet = workbook.worksheets[0]; if (!sheet) throw new BadRequestException('Excel 中没有工作表');
    const rows: string[][] = []; sheet.eachRow((row, index) => { if (index > 1) { const values = Array.isArray(row.values) ? row.values : []; rows.push(values.slice(1).map(value => String(value || '').trim())); } });
    const errors: string[] = [];
    if (kind === 'courses') {
      rows.forEach((row,index)=>{if(!row[0]||!row[1]||!row[2])errors.push(`第 ${index+2} 行：课程名称、科目、年级必填`)}); if(errors.length)return{imported:0,errors};
      await this.prisma.$transaction(rows.map(row=>this.prisma.course.create({data:{name:row[0],subject:row[1],grade:row[2],pricePerHour:number(row[3])}})));
    } else if (kind === 'scores' || kind === 'renewals') {
      const studentRows = await Promise.all(rows.map(row=>this.prisma.student.findFirst({where:{name:row[0]}}))); studentRows.forEach((student,index)=>{if(!student)errors.push(`第 ${index+2} 行：找不到学生 ${rows[index][0]}`)}); if(errors.length)return{imported:0,errors};
      if(kind==='scores') await this.prisma.$transaction(async tx => { for (const [index,row] of rows.entries()) { const studentId=studentRows[index]!.id, examDate=new Date(row[5]||Date.now()); const batch=await tx.scoreBatch.upsert({where:{studentId_name_examDate:{studentId,name:row[1],examDate}},create:{studentId,name:row[1],type:'OTHER',examDate},update:{}}); await tx.score.upsert({where:{studentId_batchId_subject:{studentId,batchId:batch.id,subject:row[2]}},create:{studentId,batchId:batch.id,examName:row[1],subject:row[2],score:number(row[3]),totalScore:number(row[4]||100),examDate},update:{score:number(row[3]),totalScore:number(row[4]||100)}}); } });
      else await this.prisma.$transaction(rows.map((row,index)=>this.prisma.renewal.create({data:{studentId:studentRows[index]!.id,hours:number(row[1]),amount:number(row[2]),note:row[3],status:WorkflowStatus.COMPLETED}})));
    } else throw new BadRequestException('不支持的导入类型');
    await this.audit(user,'IMPORT',kind,undefined,{count:rows.length}); return { imported: rows.length, errors: [] };
  }
}
