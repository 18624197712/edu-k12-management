import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  EnrollmentType,
  Prisma,
  Role,
  StudentStatus,
  TodoPriority,
  WorkflowStatus,
} from "@prisma/client";
import * as ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import type { AuthUser } from "../auth/auth.guard";
import { PrismaService } from "./prisma.service";

type JsonMap = Record<string, any>;
const number = (value: unknown) => Number(value || 0);
export function buildWeeklyLessonDates(
  startsAt: Date,
  repeatUntil: Date,
  recurring: boolean,
) {
  if (!recurring) return [new Date(startsAt)];
  const dates: Date[] = [];
  for (
    let cursor = new Date(startsAt);
    cursor <= repeatUntil;
    cursor = new Date(cursor.getTime() + 7 * 86400000)
  )
    dates.push(new Date(cursor));
  return dates;
}
export function lessonHours(durationMinutes: number, consumedHours?: unknown) {
  const explicit = number(consumedHours);
  return explicit > 0
    ? explicit
    : Math.round((durationMinutes / 60) * 100) / 100;
}
export function lessonAccountingChange(
  previousApplied: unknown,
  status: WorkflowStatus,
  durationMinutes: number,
  consumedHours?: unknown,
) {
  const appliedHours =
    status === WorkflowStatus.COMPLETED
      ? lessonHours(durationMinutes, consumedHours)
      : 0;
  return { appliedHours, delta: appliedHours - number(previousApplied) };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const nonNegative = (value: unknown, label: string) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new BadRequestException(`${label}不能小于 0`);
  return parsed;
};

export function calculateEnrollmentQuote(data: JsonMap, currentBalance = 0) {
  const price = nonNegative(data.price, "原价单价");
  const normalHours = nonNegative(data.normalHours, "正价课时");
  const halfHours = nonNegative(data.halfHours, "半价课时");
  const giftHours = nonNegative(data.giftHours, "赠送课时");
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const activityAmount = activities.reduce(
    (sum: number, row: JsonMap) => sum + nonNegative(row.amount, "活动金额"),
    0,
  );
  const activityHours = activities.reduce(
    (sum: number, row: JsonMap) => sum + nonNegative(row.hours, "活动课时"),
    0,
  );
  const weeklyFrequency = Number(data.weeklyFrequency ?? 2);
  const sessionHours = Number(data.sessionHours ?? 2);
  if (!Number.isInteger(weeklyFrequency) || weeklyFrequency < 1)
    throw new BadRequestException("每周上课次数必须是大于 0 的整数");
  if (!Number.isFinite(sessionHours) || sessionHours <= 0)
    throw new BadRequestException("单次消耗课时必须大于 0");
  const projectionStart = new Date(data.projectionStart || Date.now());
  if (Number.isNaN(projectionStart.getTime()))
    throw new BadRequestException("起算日期无效");
  const paid = round2(
    price * normalHours + price * 0.5 * halfHours + activityAmount,
  );
  const totalHours = round2(
    normalHours + halfHours + giftHours + activityHours,
  );
  const originalAmount = round2(price * totalHours);
  const savedAmount = round2(originalAmount - paid);
  const balanceBefore = round2(nonNegative(currentBalance, "当前剩余课时"));
  const balanceAfter = round2(balanceBefore + totalHours);
  const weeklyConsumption = round2(weeklyFrequency * sessionHours);
  const currentWeeks =
    balanceBefore > 0 ? Math.ceil(balanceBefore / weeklyConsumption) : 0;
  const projectedWeeks =
    balanceAfter > 0 ? Math.ceil(balanceAfter / weeklyConsumption) : 0;
  const endAt = (weeks: number) =>
    weeks > 0
      ? new Date(projectionStart.getTime() + weeks * 7 * 86400000).toISOString()
      : null;
  return {
    originalAmount,
    paid,
    savedAmount,
    discountRate: originalAmount ? round2((paid / originalAmount) * 10) : 0,
    totalHours,
    averagePrice: totalHours ? round2(paid / totalHours) : 0,
    balanceBefore,
    balanceAfter,
    weeklyConsumption,
    currentWeeks,
    projectedWeeks,
    currentEstimatedEndAt: endAt(currentWeeks),
    estimatedEndAt: endAt(projectedWeeks),
  };
}

@Injectable()
export class DataService {
  private readonly s3Options = {
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "minio",
      secretAccessKey: process.env.S3_SECRET_KEY || "minio123",
    },
  };
  private s3 = new S3Client({
    ...this.s3Options,
    endpoint: process.env.S3_ENDPOINT,
  });
  private publicS3 = new S3Client({
    ...this.s3Options,
    endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT,
  });
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const bucket = process.env.S3_BUCKET || "edu-materials";
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch {
        console.warn(
          "Object storage unavailable; signed uploads are disabled until MinIO is ready.",
        );
      }
    }
  }

  private async studentScope(user: AuthUser) {
    if (user.role === Role.ADMIN) return {};
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: user.sub },
    });
    if (!teacher) return { id: "__none__" };
    if (user.role === Role.HEAD_TEACHER) return { headTeacherId: teacher.id };
    return { lessons: { some: { course: { teacherId: teacher.id } } } };
  }

  private async renewalScope(user: AuthUser) {
    if (user.role === Role.ADMIN) return {};
    const studentScope = await this.studentScope(user);
    return {
      OR: [{ createdById: user.sub }, { student: { is: studentScope } }],
    };
  }

  private mapStudent(row: any) {
    const profile = (row.archive?.learningProfile || {}) as JsonMap;
    const assignments = row.subjectTeachers || [];
    return {
      id: row.id,
      name: row.name,
      grade: row.grade,
      school: row.school,
      subjects: row.subjects,
      remainingHours: number(row.remainingHours),
      consumedHours: round2(number(row.totalHours) - number(row.remainingHours)),
      status: row.status,
      phone: row.guardianPhone,
      guardianName: profile.guardianName || "-",
      gender: profile.gender || "-",
      address: profile.address || "-",
      schedule: profile.schedule || "-",
      totalHours: number(row.totalHours),
      headTeacher: profile.headTeacherName || row.headTeacher?.name || "-",
      teachers: assignments.length
        ? assignments
            .map((item: any) => item.teacherName || item.teacher?.name)
            .filter(Boolean)
        : profile.teachers ||
          [profile.headTeacherName || row.headTeacher?.name].filter(Boolean),
      subjectTeachers: assignments.map((item: any) => ({
        subject: item.subject,
        teacherName: item.teacherName || item.teacher?.name || "",
        schedule: item.schedule || "",
      })),
      weakPoints: profile.weakPoints || "",
      completedLessons: row._count?.lessons || 0,
      familyNotes: row.archive?.familyNotes || "",
      communicationNotes: row.archive?.communicationNotes || [],
    };
  }

  async dashboard(user: AuthUser) {
    const scope = await this.studentScope(user);
    const renewalScope = await this.renewalScope(user);
    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const [
      students,
      lessons,
      renewals,
      reports,
      newStudents,
      meetings,
      pendingFeedback,
      todos,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { ...scope, status: StudentStatus.ACTIVE } as any,
      }),
      this.prisma.lesson.findMany({
        where: { student: scope as any },
        include: { course: true, student: true },
        orderBy: { startsAt: "desc" },
      }),
      this.prisma.renewal.count({
        where: { ...renewalScope, status: WorkflowStatus.PENDING } as any,
      }),
      this.prisma.learningReport.count({
        where: {
          student: scope as any,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      this.prisma.student.count({
        where: { ...scope, createdAt: { gte: monthStart } } as any,
      }),
      this.prisma.parentMeeting.count({
        where: {
          student: scope as any,
          meetingDate: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.lesson.count({
        where: {
          student: scope as any,
          status: WorkflowStatus.COMPLETED,
          feedback: { equals: Prisma.DbNull },
        },
      }),
      this.prisma.todoTask.count({
        where: {
          ownerUserId: user.sub,
          completedAt: null,
          dueAt: { lt: dayEnd },
        },
      }),
    ]);
    const monthLessons = lessons.filter(
      (x) => x.startsAt.getMonth() === new Date().getMonth(),
    );
    return {
      students,
      lessonsToday: lessons.filter(
        (x) => x.startsAt >= dayStart && x.startsAt < dayEnd,
      ).length,
      lessonsThisMonth: monthLessons.reduce(
        (n, x) => n + number(x.consumedHours),
        0,
      ),
      pendingRenewals: renewals,
      reportsThisMonth: reports,
      newStudentsThisMonth: newStudents,
      familyContactsToday: meetings,
      pendingFeedback,
      pendingTodos: todos,
    };
  }

  async students(query: JsonMap, user: AuthUser) {
    const page = Math.max(1, number(query.page) || 1),
      pageSize = Math.min(100, Math.max(1, number(query.pageSize) || 20));
    const scope = await this.studentScope(user),
      where: any = { ...scope };
    if (query.search)
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { school: { contains: query.search, mode: "insensitive" } },
      ];
    if (query.status) where.status = query.status;
    if (query.grade) where.grade = { contains: query.grade };
    if (query.subject) where.subjects = { has: query.subject };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        include: {
          headTeacher: true,
          archive: true,
          subjectTeachers: { include: { teacher: true } },
          _count: {
            select: {
              lessons: { where: { status: WorkflowStatus.COMPLETED } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.mapStudent(row)),
      meta: { page, pageSize, total },
    };
  }

  async student(id: string, user: AuthUser) {
    const scope = await this.studentScope(user);
    const row = await this.prisma.student.findFirst({
      where: { id, ...scope } as any,
      include: {
        headTeacher: true,
        archive: true,
        subjectTeachers: { include: { teacher: true } },
        _count: {
          select: { lessons: { where: { status: WorkflowStatus.COMPLETED } } },
        },
      },
    });
    if (!row) throw new NotFoundException("学生不存在或无权查看");
    return this.mapStudent(row);
  }

  async createStudent(data: JsonMap, user: AuthUser) {
    const subjects = Array.from(
      new Set<string>((data.subjects || []).filter(Boolean)),
    );
    const assignmentBySubject = new Map<string, JsonMap>(
      (data.subjectTeachers || []).map((item: JsonMap) => [
        item.subject,
        item,
      ]),
    );
    const totalHours = number(
      data.totalHours ?? data.profile?.totalHours ?? data.remainingHours,
    );
    const row = await this.prisma.student.create({
      data: {
        name: data.name,
        grade: data.grade,
        school: data.school || "",
        guardianPhone: data.phone || "",
        subjects,
        totalHours,
        remainingHours: number(data.remainingHours ?? totalHours),
        status: data.status || StudentStatus.ACTIVE,
        archive: {
          create: {
            learningProfile: data.profile || {},
            familyNotes: data.familyNotes || "",
          },
        },
        subjectTeachers: {
          create: subjects.map((subject: string) => ({
            subject,
            teacherName: String(assignmentBySubject.get(subject)?.teacherName || "").trim() || null,
            schedule: String(assignmentBySubject.get(subject)?.schedule || "").trim() || null,
          })),
        },
      },
      include: {
        archive: true,
        headTeacher: true,
        subjectTeachers: { include: { teacher: true } },
        _count: {
          select: { lessons: { where: { status: WorkflowStatus.COMPLETED } } },
        },
      },
    });
    await this.audit(user, "CREATE", "Student", row.id, data);
    return this.mapStudent(row);
  }

  async updateStudent(id: string, data: JsonMap, user: AuthUser) {
    const current = await this.student(id, user);
    const subjects =
      data.subjects === undefined
        ? current.subjects
        : Array.from(new Set((data.subjects || []).filter(Boolean)));
    const profile = data.profile
      ? {
          guardianName: current.guardianName,
          gender: current.gender,
          address: current.address,
          schedule: current.schedule,
          weakPoints: current.weakPoints,
          ...data.profile,
        }
      : undefined;
    if (profile) delete profile.totalHours;
    const hasHourEdit = data.totalHours !== undefined || data.remainingHours !== undefined || data.consumedHours !== undefined;
    const totalHours = data.totalHours !== undefined ? nonNegative(data.totalHours, "报读总课时") : current.totalHours;
    const consumedHours = data.consumedHours !== undefined
      ? nonNegative(data.consumedHours, "消耗课时")
      : data.remainingHours !== undefined
        ? round2(totalHours - nonNegative(data.remainingHours, "剩余课时"))
        : current.consumedHours;
    const remainingHours = data.remainingHours !== undefined
      ? nonNegative(data.remainingHours, "剩余课时")
      : round2(totalHours - consumedHours);
    if (totalHours < 0 || consumedHours < 0 || remainingHours < 0)
      throw new BadRequestException("课时必须为非负数");
    if (!Number.isFinite(totalHours) || !Number.isFinite(consumedHours) || !Number.isFinite(remainingHours))
      throw new BadRequestException("课时数值无效");
    if (round2(consumedHours + remainingHours) !== round2(totalHours))
      throw new BadRequestException("报读总课时必须等于已消耗课时与剩余课时之和");
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.student.findUniqueOrThrow({
        where: { id },
        select: { totalHours: true, remainingHours: true },
      });
      const studentData: Prisma.StudentUpdateInput = {};
      if (data.name !== undefined) studentData.name = data.name;
      if (data.grade !== undefined) studentData.grade = data.grade;
      if (data.school !== undefined) studentData.school = data.school;
      if (data.phone !== undefined) studentData.guardianPhone = data.phone;
      if (data.status !== undefined) studentData.status = data.status;
      if (hasHourEdit) {
        studentData.totalHours = totalHours;
        studentData.remainingHours = remainingHours;
      }
      await tx.student.update({
        where: { id },
        data: { ...studentData, ...(data.subjects !== undefined ? { subjects } : {}) },
      });
      if (profile || data.familyNotes !== undefined) {
        const archiveUpdate: Prisma.StudentArchiveUpdateInput = {};
        if (profile) archiveUpdate.learningProfile = profile;
        if (data.familyNotes !== undefined)
          archiveUpdate.familyNotes = data.familyNotes;
        await tx.studentArchive.upsert({
          where: { studentId: id },
          create: {
            studentId: id,
            learningProfile: profile || {},
            familyNotes: data.familyNotes || "",
          },
          update: archiveUpdate,
        });
      }
      if (data.subjects !== undefined || data.subjectTeachers !== undefined) {
        const assignmentBySubject = new Map<string, JsonMap>(
          (data.subjectTeachers || []).map((item: JsonMap) => [
            item.subject,
            item,
          ]),
        );
        await tx.studentSubjectTeacher.deleteMany({ where: { studentId: id } });
        if (subjects.length)
          await tx.studentSubjectTeacher.createMany({
            data: subjects.map((subject: string) => ({
              studentId: id,
              subject,
              teacherName: String(assignmentBySubject.get(subject)?.teacherName || "").trim() || null,
              schedule: String(assignmentBySubject.get(subject)?.schedule || "").trim() || null,
            })),
          });
      }
      if (
        hasHourEdit &&
        (round2(remainingHours - number(before.remainingHours)) !== 0 ||
          round2(totalHours - number(before.totalHours)) !== 0)
      ) {
        await tx.hourLedger.create({
          data: {
            studentId: id,
            type: "MANUAL_ADJUSTMENT",
            amount: round2(remainingHours - number(before.remainingHours)),
            balanceAfter: remainingHours,
            note: `人工调整课时：报读 ${totalHours}，消耗 ${consumedHours}，剩余 ${remainingHours}`,
            operatorName: user.name,
          },
        });
      }
    });
    await this.audit(user, "UPDATE", "Student", id, data);
    return this.student(id, user);
  }

  async deleteStudent(id: string, user: AuthUser) {
    const scope = await this.studentScope(user);
    const row = await this.prisma.student.findFirst({
      where: { id, ...scope } as any,
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: {
            lessons: true,
            plans: true,
            scores: true,
            reports: true,
            meetings: true,
            renewals: true,
            applications: true,
            recommendations: true,
            scoreBatches: true,
            hourLedgers: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException("学生不存在或无权删除");
    const dependencies = Object.values(row._count).reduce(
      (sum, value) => sum + Number(value),
      0,
    );
    if (dependencies > 0 && row.status !== StudentStatus.GRADUATED)
      throw new ConflictException(
        "该学生已有课程、成绩、课时或业务历史，不能直接删除。请将学生状态改为“结业”后再删档",
      );
    if (row.status === StudentStatus.GRADUATED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.hourLedger.deleteMany({ where: { studentId: id } });
        await tx.lesson.deleteMany({ where: { studentId: id } });
        await tx.scoreBatch.deleteMany({ where: { studentId: id } });
        await tx.teachingPlan.deleteMany({ where: { studentId: id } });
        await tx.learningReport.deleteMany({ where: { studentId: id } });
        await tx.parentMeeting.deleteMany({ where: { studentId: id } });
        await tx.businessApplication.deleteMany({ where: { studentId: id } });
        await tx.renewal.deleteMany({ where: { studentId: id } });
        await tx.recommendation.updateMany({
          where: { enrolledStudentId: id },
          data: { enrolledStudentId: null },
        });
        await tx.todoTask.updateMany({
          where: { studentId: id },
          data: { studentId: null },
        });
        await tx.studentSubjectTeacher.deleteMany({ where: { studentId: id } });
        await tx.studentArchive.deleteMany({ where: { studentId: id } });
        await tx.student.delete({ where: { id } });
      });
    } else {
      await this.prisma.student.delete({ where: { id } });
    }
    await this.audit(user, "DELETE", "Student", id, { name: row.name });
  }

  async updateArchive(id: string, data: JsonMap, user: AuthUser) {
    await this.student(id, user);
    const archive = await this.prisma.studentArchive.upsert({
      where: { studentId: id },
      create: {
        studentId: id,
        learningProfile: data.learningProfile || {},
        familyNotes: data.familyNotes,
        communicationNotes: data.communicationNotes,
      },
      update: {
        learningProfile: data.learningProfile,
        familyNotes: data.familyNotes,
        communicationNotes: data.communicationNotes,
      },
    });
    await this.audit(user, "UPDATE", "StudentArchive", archive.id, data);
    return archive;
  }

  async courses() {
    return this.prisma.course.findMany({
      include: { teacher: true },
      orderBy: [{ grade: "asc" }, { subject: "asc" }],
    });
  }

  async todos(query: JsonMap, user: AuthUser) {
    const page = Math.max(1, number(query.page) || 1),
      pageSize = Math.min(100, Math.max(1, number(query.pageSize) || 20));
    const where: any = { ownerUserId: user.sub };
    if (query.status === "pending") where.completedAt = null;
    if (query.status === "completed") where.completedAt = { not: null };
    if (query.scope === "today") {
      const end = new Date();
      end.setHours(24, 0, 0, 0);
      where.dueAt = { lt: end };
    }
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00`),
        end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.dueAt = { gte: start, lt: end };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.todoTask.findMany({
        where,
        include: { student: { select: { id: true, name: true } } },
        orderBy: [
          { completedAt: "asc" },
          { priority: "desc" },
          { dueAt: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.todoTask.count({ where }),
    ]);
    return { data: rows, meta: { page, pageSize, total } };
  }

  async saveTodo(data: JsonMap, user: AuthUser, id?: string) {
    if (data.studentId) await this.student(data.studentId, user);
    const payload = {
      title: data.title,
      category: data.category || "其他",
      priority: data.priority || TodoPriority.MEDIUM,
      dueAt: new Date(data.dueAt),
      studentId: data.studentId || null,
      relatedPath: data.relatedPath || null,
    };
    const row = id
      ? await this.prisma.todoTask.update({
          where: { id, ownerUserId: user.sub },
          data: payload,
        })
      : await this.prisma.todoTask.create({
          data: { ...payload, ownerUserId: user.sub },
        });
    await this.audit(user, id ? "UPDATE" : "CREATE", "TodoTask", row.id, data);
    return row;
  }

  async setTodoCompleted(id: string, completed: boolean, user: AuthUser) {
    const row = await this.prisma.todoTask.update({
      where: { id, ownerUserId: user.sub },
      data: { completedAt: completed ? new Date() : null },
    });
    await this.audit(user, completed ? "COMPLETE" : "REOPEN", "TodoTask", id);
    return row;
  }

  async deleteTodo(id: string, user: AuthUser) {
    await this.prisma.todoTask.delete({ where: { id, ownerUserId: user.sub } });
    await this.audit(user, "DELETE", "TodoTask", id);
  }

  async plans(studentId?: string) {
    return this.prisma.teachingPlan.findMany({
      where: studentId ? { studentId } : {},
      include: { student: true, teacher: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async savePlan(data: JsonMap, user: AuthUser) {
    const teacher = data.teacherId
      ? { id: data.teacherId }
      : await this.prisma.teacher.findFirstOrThrow();
    const row = await this.prisma.teachingPlan.create({
      data: {
        title: data.title,
        studentId: data.studentId,
        teacherId: teacher.id,
        subject: data.subject,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        goals: data.goals || "",
        status: data.status || WorkflowStatus.DRAFT,
        term: data.term,
        fileName: data.fileName,
        objectKey: data.objectKey,
        fileSize: data.fileSize,
        uploaderName: user.name,
      },
    });
    await this.audit(user, "CREATE", "TeachingPlan", row.id, data);
    return row;
  }
  async deletePlan(id: string, user: AuthUser) {
    const row = await this.prisma.teachingPlan.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("教学计划不存在");
    await this.student(row.studentId, user);
    await this.prisma.teachingPlan.delete({ where: { id } });
    if (row.objectKey) {
      try {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET || "edu-materials",
            Key: row.objectKey,
          }),
        );
      } catch {
        console.warn(`Failed to remove teaching-plan object ${row.objectKey}`);
      }
    }
    await this.audit(user, "DELETE", "TeachingPlan", id, {
      fileName: row.fileName,
    });
  }
  async scoreBatches(studentId: string, user: AuthUser) {
    await this.student(studentId, user);
    return this.prisma.scoreBatch.findMany({
      where: { studentId },
      include: { scores: { orderBy: { subject: "asc" } } },
      orderBy: { examDate: "desc" },
    });
  }
  async saveScoreBatch(data: JsonMap, user: AuthUser) {
    await this.student(data.studentId, user);
    const examDate = new Date(data.examDate || Date.now());
    const row = await this.prisma.scoreBatch.upsert({
      where: {
        studentId_name_examDate: {
          studentId: data.studentId,
          name: data.name,
          examDate,
        },
      },
      create: {
        studentId: data.studentId,
        type: data.type || "OTHER",
        name: data.name,
        examDate,
      },
      update: { type: data.type || "OTHER" },
    });
    await this.audit(user, "UPSERT", "ScoreBatch", row.id, data);
    return row;
  }
  async deleteScoreBatch(id: string, user: AuthUser) {
    const row = await this.prisma.scoreBatch.findUnique({
      where: { id },
      select: { id: true, studentId: true, name: true },
    });
    if (!row) throw new NotFoundException("成绩批次不存在");
    await this.student(row.studentId, user);
    await this.prisma.scoreBatch.delete({ where: { id } });
    await this.audit(user, "DELETE", "ScoreBatch", id, { name: row.name });
  }
  async scores(studentId?: string, batchId?: string) {
    return this.prisma.score.findMany({
      where: {
        ...(studentId ? { studentId } : {}),
        ...(batchId ? { batchId } : {}),
      },
      include: { batch: true },
      orderBy: [{ examDate: "desc" }, { subject: "asc" }],
    });
  }
  async saveScore(data: JsonMap, user: AuthUser) {
    await this.student(data.studentId, user);
    let batchId = data.batchId as string | undefined;
    if (!batchId)
      batchId = (
        await this.saveScoreBatch(
          {
            studentId: data.studentId,
            type: data.examType || "OTHER",
            name: data.examName,
            examDate: data.examDate || new Date().toISOString(),
          },
          user,
        )
      ).id;
    const batch = await this.prisma.scoreBatch.findFirstOrThrow({
      where: { id: batchId, studentId: data.studentId },
    });
    const row = await this.prisma.score.upsert({
      where: {
        studentId_batchId_subject: {
          studentId: data.studentId,
          batchId,
          subject: data.subject,
        },
      },
      create: {
        studentId: data.studentId,
        batchId,
        teacherId: data.teacherId || null,
        examName: batch.name,
        subject: data.subject,
        score: number(data.score),
        totalScore: number(data.totalScore || 100),
        examDate: batch.examDate,
        note: data.note,
      },
      update: {
        teacherId: data.teacherId || undefined,
        score: number(data.score),
        totalScore: number(data.totalScore || 100),
        note: data.note,
        examName: batch.name,
        examDate: batch.examDate,
      },
    });
    await this.audit(user, "UPSERT", "Score", row.id, data);
    return row;
  }
  async deleteScore(id: string, user: AuthUser) {
    await this.prisma.score.delete({ where: { id } });
    await this.audit(user, "DELETE", "Score", id);
  }
  async lessons(query: JsonMap, user: AuthUser) {
    const scope = await this.studentScope(user),
      where: any = { student: scope as any };
    if (query.studentId) where.studentId = query.studentId;
    if (query.start || query.end)
      where.startsAt = {
        ...(query.start ? { gte: new Date(query.start) } : {}),
        ...(query.end ? { lt: new Date(query.end) } : {}),
      };
    return this.prisma.lesson.findMany({
      where,
      include: { student: true, course: { include: { teacher: true } } },
      orderBy: { startsAt: "asc" },
    });
  }
  async createLesson(data: JsonMap, user: AuthUser) {
    const student = await this.student(data.studentId, user);
    let course = data.courseId
      ? await this.prisma.course.findUnique({ where: { id: data.courseId } })
      : null;
    const teacherName = String(data.teacherName || "").trim();
    if (!course)
      course = await this.prisma.course.findFirst({
        where: {
          name: `${student.name}${data.subject}一对一`,
          subject: data.subject,
          grade: student.grade,
          teacherName,
        },
      });
    if (!course)
      course = await this.prisma.course.create({
        data: {
          name: `${student.name}${data.subject}一对一`,
          subject: data.subject,
          grade: student.grade,
          teacherName,
          pricePerHour: 0,
        },
      });
    const startsAt = new Date(data.startsAt),
      repeatUntil = data.repeatUntil ? new Date(data.repeatUntil) : startsAt;
    const recurrenceGroupId =
      data.recurrence === "WEEKLY" ? randomUUID() : null;
    const dates = buildWeeklyLessonDates(
      startsAt,
      repeatUntil,
      !!recurrenceGroupId,
    );
    const durationMinutes = number(data.durationMinutes) || 120;
    const consumedHours = lessonHours(durationMinutes, data.consumedHours);
    const status = data.status || WorkflowStatus.PENDING;
    const appliedHours =
      status === WorkflowStatus.COMPLETED ? consumedHours : 0;
    const rows = await this.prisma.$transaction(
      async (tx) => {
        const account = await tx.student.findUniqueOrThrow({
          where: { id: data.studentId },
        });
        const debit = appliedHours * dates.length;
        if (number(account.remainingHours) < debit)
          throw new BadRequestException(`剩余课时不足，需要 ${debit} 课时`);
        if (debit)
          await tx.student.update({
            where: { id: data.studentId },
            data: { remainingHours: { decrement: debit } },
          });
        if (data.syncSchedule && data.subject) {
          const weekday = ["日", "一", "二", "三", "四", "五", "六"][startsAt.getDay()];
          const endAt = new Date(startsAt.getTime() + durationMinutes * 60000);
          const pad = (value: number) => String(value).padStart(2, "0");
          await tx.studentSubjectTeacher.updateMany({
            where: { studentId: data.studentId, subject: String(data.subject) },
            data: {
              schedule: `周${weekday} ${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}-${pad(endAt.getHours())}:${pad(endAt.getMinutes())}`,
            },
          });
        }
        const created = [];
        let balance = number(account.remainingHours);
        for (const date of dates) {
          const row = await tx.lesson.create({
            data: {
              courseId: course!.id,
              studentId: data.studentId,
              startsAt: date,
              durationMinutes,
              consumedHours,
              appliedHours,
              status,
              note: data.note || null,
              recurrenceGroupId,
            },
            include: { student: true, course: { include: { teacher: true } } },
          });
          created.push(row);
          if (appliedHours) {
            balance -= appliedHours;
            await tx.hourLedger.create({
              data: {
                studentId: data.studentId,
                lessonId: row.id,
                type: "LESSON_CONSUME",
                amount: -appliedHours,
                balanceAfter: balance,
                note: `${data.subject}课程完成`,
                operatorName: user.name,
              },
            });
          }
        }
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit(user, "CREATE", "Lesson", rows[0]?.id, {
      ...data,
      count: rows.length,
    });
    return rows;
  }
  async updateLesson(id: string, data: JsonMap, user: AuthUser) {
    const current = await this.prisma.lesson.findUniqueOrThrow({
      where: { id },
      include: { course: { select: { subject: true } } },
    });
    await this.student(current.studentId, user);
    if (data.teacherName !== undefined)
      await this.prisma.course.update({
        where: { id: current.courseId },
        data: {
          teacherName: String(data.teacherName || "").trim(),
          teacherId: null,
        },
      });
    const targets =
      data.scope === "FUTURE" && current.recurrenceGroupId
        ? await this.prisma.lesson.findMany({
            where: {
              recurrenceGroupId: current.recurrenceGroupId,
              startsAt: { gte: current.startsAt },
            },
          })
        : [current];
    const nextStart = data.startsAt ? new Date(data.startsAt) : undefined,
      delta = nextStart ? nextStart.getTime() - current.startsAt.getTime() : 0;
    await this.prisma.$transaction(
      async (tx) => {
        const account = await tx.student.findUniqueOrThrow({
          where: { id: current.studentId },
        });
        const changes = targets.map((row) => {
          const durationMinutes = data.durationMinutes ?? row.durationMinutes;
          const consumedHours =
            data.consumedHours !== undefined
              ? lessonHours(durationMinutes, data.consumedHours)
              : data.durationMinutes !== undefined
                ? lessonHours(durationMinutes)
                : number(row.consumedHours) || lessonHours(durationMinutes);
          const status = data.status ?? row.status;
          const accounting = lessonAccountingChange(
            row.appliedHours,
            status,
            durationMinutes,
            consumedHours,
          );
          return { row, durationMinutes, consumedHours, status, ...accounting };
        });
        const totalDebit = changes.reduce((sum, item) => sum + item.delta, 0);
        if (number(account.remainingHours) < totalDebit)
          throw new BadRequestException(
            `剩余课时不足，需要再扣 ${totalDebit} 课时`,
          );
        if (totalDebit)
          await tx.student.update({
            where: { id: current.studentId },
            data: {
              remainingHours: number(account.remainingHours) - totalDebit,
            },
          });
        let balance = number(account.remainingHours);
        for (const item of changes) {
          await tx.lesson.update({
            where: { id: item.row.id },
            data: {
              startsAt: nextStart
                ? new Date(item.row.startsAt.getTime() + delta)
                : undefined,
              durationMinutes: item.durationMinutes,
              status: item.status,
              consumedHours: item.consumedHours,
              appliedHours: item.appliedHours,
              feedback: data.feedback,
              note: data.note,
            },
          });
          if (item.delta) {
            balance -= item.delta;
            await tx.hourLedger.create({
              data: {
                studentId: current.studentId,
                lessonId: item.row.id,
                type: item.delta > 0 ? "LESSON_CONSUME" : "LESSON_REFUND",
                amount: -item.delta,
                balanceAfter: balance,
                note:
                  item.delta > 0
                    ? `${current.course.subject}课程完成自动扣减`
                    : `${current.course.subject}课程撤销完成自动退回`,
                operatorName: user.name,
              },
            });
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit(user, "UPDATE", "Lesson", id, data);
    return this.prisma.lesson.findUnique({
      where: { id },
      include: { student: true, course: { include: { teacher: true } } },
    });
  }
  async deleteLesson(id: string, scope: string, user: AuthUser) {
    const current = await this.prisma.lesson.findUniqueOrThrow({
      where: { id },
      include: { course: { select: { subject: true } } },
    });
    await this.student(current.studentId, user);
    const targets =
      scope === "FUTURE" && current.recurrenceGroupId
        ? await this.prisma.lesson.findMany({
            where: {
              recurrenceGroupId: current.recurrenceGroupId,
              startsAt: { gte: current.startsAt },
            },
          })
        : [current];
    await this.prisma.$transaction(
      async (tx) => {
        const account = await tx.student.findUniqueOrThrow({
          where: { id: current.studentId },
        });
        let balance = number(account.remainingHours);
        const refund = targets.reduce(
          (sum, row) => sum + number(row.appliedHours),
          0,
        );
        if (refund)
          await tx.student.update({
            where: { id: current.studentId },
            data: { remainingHours: { increment: refund } },
          });
        for (const row of targets)
          if (number(row.appliedHours)) {
            balance += number(row.appliedHours);
            await tx.hourLedger.create({
              data: {
                studentId: current.studentId,
                lessonId: row.id,
                type: "LESSON_REFUND",
                amount: number(row.appliedHours),
                balanceAfter: balance,
                note: `删除已完成${current.course.subject}课程退回课时`,
                operatorName: user.name,
              },
            });
          }
        if (scope === "FUTURE" && current.recurrenceGroupId)
          await tx.lesson.deleteMany({
            where: {
              recurrenceGroupId: current.recurrenceGroupId,
              startsAt: { gte: current.startsAt },
            },
          });
        else await tx.lesson.delete({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit(user, "DELETE", "Lesson", id, { scope });
  }
  async reports(studentId?: string) {
    return this.prisma.learningReport.findMany({
      where: studentId ? { studentId } : {},
      include: { student: true, teacher: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async generateReport(data: JsonMap) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: data.studentId },
      include: {
        scores: { orderBy: { examDate: "desc" } },
        lessons: { include: { course: true }, orderBy: { startsAt: "desc" } },
        archive: true,
      },
    });
    const content = {
      lessonCount: student.lessons.length,
      subjects: student.subjects,
      scores: student.scores.slice(0, 10),
      weakPoints:
        (student.archive?.learningProfile as JsonMap)?.weakPoints || "",
      suggestions:
        "保持当前学习节奏，针对薄弱知识点进行专项训练，并定期复盘错题。",
    };
    const teacher = await this.prisma.teacher.findFirst();
    return this.prisma.learningReport.create({
      data: {
        studentId: student.id,
        teacherId: teacher?.id,
        title: data.title || `${student.name}${data.kind || "月度学情报告"}`,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        content,
        status: WorkflowStatus.COMPLETED,
      },
    });
  }
  async deleteLearningReport(id: string, user: AuthUser) {
    const row = await this.prisma.learningReport.findUnique({
      where: { id },
      select: { id: true, studentId: true, title: true },
    });
    if (!row) throw new NotFoundException("学情报告不存在");
    await this.student(row.studentId, user);
    await this.prisma.learningReport.delete({ where: { id } });
    await this.audit(user, "DELETE", "LearningReport", id, {
      title: row.title,
    });
  }

  async meetings(studentId?: string) {
    return this.prisma.parentMeeting.findMany({
      where: studentId ? { studentId } : {},
      include: { student: true, teacher: true },
      orderBy: { meetingDate: "desc" },
    });
  }
  async saveMeeting(data: JsonMap, user: AuthUser, id?: string) {
    const teacher = data.teacherId
      ? { id: data.teacherId }
      : await this.prisma.teacher.findFirst();
    const payload = {
      studentId: data.studentId,
      teacherId: teacher?.id,
      meetingDate: new Date(data.meetingDate),
      feedback: data.feedback || {},
      parentSuggestion: data.parentSuggestion || "",
      recorder: data.recorder || user.name,
    };
    const row = id
      ? await this.prisma.parentMeeting.update({ where: { id }, data: payload })
      : await this.prisma.parentMeeting.create({ data: payload as any });
    await this.audit(
      user,
      id ? "UPDATE" : "CREATE",
      "ParentMeeting",
      row.id,
      data,
    );
    return row;
  }
  async deleteMeeting(id: string, user: AuthUser) {
    await this.prisma.parentMeeting.delete({ where: { id } });
    await this.audit(user, "DELETE", "ParentMeeting", id);
  }
  private mapRenewal(row: any) {
    const weeklyConsumption = round2(
      row.weeklyFrequency * number(row.sessionHours),
    );
    const balanceBefore = number(row.balanceBefore),
      balanceAfter = number(row.balanceAfter);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      studentId: row.studentId || undefined,
      student: row.student
        ? {
            id: row.student.id,
            name: row.student.name,
            grade: row.student.grade,
          }
        : undefined,
      prospectName: row.prospectName || row.student?.name || undefined,
      prospectPhone: row.prospectPhone || undefined,
      unitPrice: number(row.unitPrice),
      normalHours: number(row.normalHours),
      halfHours: number(row.halfHours),
      giftHours: number(row.giftHours),
      giftType: row.giftType || undefined,
      activities: Array.isArray(row.activities) ? row.activities : [],
      originalAmount: round2(number(row.unitPrice) * number(row.hours)),
      paid: number(row.amount),
      savedAmount: round2(
        number(row.unitPrice) * number(row.hours) - number(row.amount),
      ),
      discountRate:
        number(row.unitPrice) && number(row.hours)
          ? round2(
              (number(row.amount) /
                (number(row.unitPrice) * number(row.hours))) *
                10,
            )
          : 0,
      totalHours: number(row.hours),
      averagePrice: number(row.hours)
        ? round2(number(row.amount) / number(row.hours))
        : 0,
      balanceBefore,
      balanceAfter,
      weeklyFrequency: row.weeklyFrequency,
      sessionHours: number(row.sessionHours),
      weeklyConsumption,
      currentWeeks:
        weeklyConsumption && balanceBefore > 0
          ? Math.ceil(balanceBefore / weeklyConsumption)
          : 0,
      projectedWeeks:
        weeklyConsumption && balanceAfter > 0
          ? Math.ceil(balanceAfter / weeklyConsumption)
          : 0,
      projectionStart: row.projectionStart.toISOString(),
      currentEstimatedEndAt: row.currentEstimatedEndAt?.toISOString() || null,
      estimatedEndAt: row.estimatedEndAt?.toISOString() || null,
      followUpAt: row.followUpAt?.toISOString(),
      confirmedAt: row.confirmedAt?.toISOString(),
      createdByName: row.createdByName || undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  calculateRenewal(data: JsonMap, currentBalance = 0) {
    return calculateEnrollmentQuote(data, currentBalance);
  }

  async calculateRenewalForUser(data: JsonMap, user: AuthUser) {
    let currentBalance = 0;
    if (data.type === EnrollmentType.RENEWAL) {
      if (!data.studentId)
        throw new BadRequestException("续费补充必须选择学生");
      currentBalance = (await this.student(data.studentId, user))
        .remainingHours;
    }
    return this.calculateRenewal(data, currentBalance);
  }

  async renewals(query: JsonMap, user: AuthUser) {
    const scope = await this.renewalScope(user);
    const where: any = { ...scope };
    if (query.studentId) where.studentId = query.studentId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.q)
      where.AND = [
        {
          OR: [
            { prospectName: { contains: query.q, mode: "insensitive" } },
            { prospectPhone: { contains: query.q } },
            {
              student: {
                is: { name: { contains: query.q, mode: "insensitive" } },
              },
            },
          ],
        },
      ];
    const rows = await this.prisma.renewal.findMany({
      where,
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => this.mapRenewal(row));
  }

  private async renewalCalculation(data: JsonMap, user: AuthUser) {
    const type =
      data.type === EnrollmentType.FIRST_ENROLLMENT
        ? EnrollmentType.FIRST_ENROLLMENT
        : EnrollmentType.RENEWAL;
    let student: any;
    if (type === EnrollmentType.RENEWAL) {
      if (!data.studentId)
        throw new BadRequestException("续费补充必须选择学生");
      student = await this.student(data.studentId, user);
    } else {
      if (data.studentId) await this.student(data.studentId, user);
      if (!String(data.prospectName || "").trim() && !data.studentId)
        throw new BadRequestException("首次报读请填写学生姓名");
    }
    const calculation = this.calculateRenewal(
      data,
      student?.remainingHours || 0,
    );
    if (calculation.totalHours <= 0)
      throw new BadRequestException("新增课时必须大于 0");
    return { type, student, calculation };
  }

  private renewalData(
    data: JsonMap,
    user: AuthUser,
    context: Awaited<ReturnType<DataService["renewalCalculation"]>>,
  ) {
    const { type, student, calculation } = context;
    return {
      type,
      studentId:
        type === EnrollmentType.RENEWAL ? student.id : data.studentId || null,
      prospectName:
        String(data.prospectName || student?.name || "").trim() || null,
      prospectPhone:
        String(data.prospectPhone || student?.phone || "").trim() || null,
      unitPrice: number(data.price),
      normalHours: number(data.normalHours),
      halfHours: number(data.halfHours),
      giftHours: number(data.giftHours),
      giftType: data.giftType || null,
      activities: (Array.isArray(data.activities)
        ? data.activities
        : []) as Prisma.InputJsonValue,
      hours: calculation.totalHours,
      appliedHours: 0,
      amount: calculation.paid,
      balanceBefore: calculation.balanceBefore,
      balanceAfter: calculation.balanceAfter,
      weeklyFrequency: number(data.weeklyFrequency || 2),
      sessionHours: number(data.sessionHours || 2),
      projectionStart: new Date(data.projectionStart),
      currentEstimatedEndAt: calculation.currentEstimatedEndAt
        ? new Date(calculation.currentEstimatedEndAt)
        : null,
      estimatedEndAt: calculation.estimatedEndAt
        ? new Date(calculation.estimatedEndAt)
        : null,
      followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
      createdById: user.sub,
      createdByName: user.name,
      note: data.note || null,
    };
  }

  async saveRenewal(data: JsonMap, user: AuthUser) {
    const context = await this.renewalCalculation(data, user);
    const row = await this.prisma.renewal.create({
      data: {
        ...this.renewalData(data, user, context),
        status: WorkflowStatus.PENDING,
      },
      include: { student: true },
    });
    await this.audit(user, "CREATE_QUOTE", "Renewal", row.id, data);
    return this.mapRenewal(row);
  }

  async updateRenewal(id: string, data: JsonMap, user: AuthUser) {
    const scope = await this.renewalScope(user);
    const existing = await this.prisma.renewal.findFirst({
      where: { id, ...scope, status: WorkflowStatus.PENDING } as any,
    });
    if (!existing) throw new NotFoundException("待确认报价不存在或不可编辑");
    const context = await this.renewalCalculation(data, user);
    const payload = {
      ...this.renewalData(data, user, context),
      createdById: existing.createdById,
      createdByName: existing.createdByName,
    };
    const row = await this.prisma.renewal.update({
      where: { id },
      data: payload,
      include: { student: true },
    });
    await this.audit(user, "UPDATE_QUOTE", "Renewal", id, data);
    return this.mapRenewal(row);
  }

  async cancelRenewal(id: string, user: AuthUser) {
    const scope = await this.renewalScope(user);
    const result = await this.prisma.renewal.updateMany({
      where: { id, ...scope, status: WorkflowStatus.PENDING } as any,
      data: { status: WorkflowStatus.CANCELLED },
    });
    if (!result.count)
      throw new ConflictException("报价不存在、已取消或已经完成");
    await this.audit(user, "CANCEL_QUOTE", "Renewal", id);
    return { success: true };
  }

  async deleteRenewal(id: string, user: AuthUser) {
    const scope = await this.renewalScope(user);
    const row = await this.prisma.renewal.findFirst({
      where: { id, ...scope } as any,
    });
    if (!row) throw new NotFoundException("报价不存在或无权删除");
    if (row.status === WorkflowStatus.COMPLETED || number(row.appliedHours) > 0)
      throw new ConflictException("已入账记录关联课时流水，不能删除");
    await this.prisma.renewal.delete({ where: { id } });
    await this.audit(user, "DELETE_QUOTE", "Renewal", id, {
      status: row.status,
    });
  }

  async confirmRenewal(id: string, data: JsonMap, user: AuthUser) {
    const scope = await this.renewalScope(user);
    const quote = await this.prisma.renewal.findFirst({
      where: { id, ...scope } as any,
    });
    if (!quote) throw new NotFoundException("报价不存在或无权查看");
    if (
      quote.status !== WorkflowStatus.PENDING ||
      number(quote.appliedHours) > 0
    )
      throw new ConflictException("该报价已处理，不能重复入账");

    let existingStudentId = quote.studentId || data.studentId;
    if (existingStudentId) await this.student(existingStudentId, user);
    if (!existingStudentId && quote.type !== EnrollmentType.FIRST_ENROLLMENT)
      throw new BadRequestException("续费报价缺少关联学生");
    if (
      !existingStudentId &&
      (!data.createStudent?.name || !data.createStudent?.grade)
    )
      throw new BadRequestException("请绑定已有学生，或填写新学生姓名和年级");

    const result = await this.prisma.$transaction(
      async (tx) => {
        const current = await tx.renewal.findUniqueOrThrow({ where: { id } });
        if (
          current.status !== WorkflowStatus.PENDING ||
          number(current.appliedHours) > 0
        )
          throw new ConflictException("该报价已处理，不能重复入账");
        if (!existingStudentId) {
          let headTeacherId: string | null = null;
          if (user.role === Role.HEAD_TEACHER)
            headTeacherId =
              (await tx.teacher.findUnique({ where: { userId: user.sub } }))
                ?.id || null;
          const created = await tx.student.create({
            data: {
              name: String(data.createStudent.name).trim(),
              grade: String(data.createStudent.grade).trim(),
              school: String(data.createStudent.school || "").trim(),
              guardianPhone: String(
                data.createStudent.phone || current.prospectPhone || "",
              ).trim(),
              subjects: [],
              totalHours: 0,
              remainingHours: 0,
              status: StudentStatus.ACTIVE,
              headTeacherId,
              archive: { create: { learningProfile: {}, familyNotes: "" } },
            },
          });
          existingStudentId = created.id;
        }
        const student = await tx.student.findUniqueOrThrow({
          where: { id: existingStudentId },
        });
        const freshCalculation = this.calculateRenewal(
          {
            price: number(current.unitPrice),
            normalHours: number(current.normalHours),
            halfHours: number(current.halfHours),
            giftHours: number(current.giftHours),
            activities: current.activities,
            weeklyFrequency: current.weeklyFrequency,
            sessionHours: number(current.sessionHours),
            projectionStart: current.projectionStart.toISOString(),
          },
          number(student.remainingHours),
        );
        const claimed = await tx.renewal.updateMany({
          where: { id, status: WorkflowStatus.PENDING, appliedHours: 0 },
          data: {
            studentId: existingStudentId,
            status: WorkflowStatus.COMPLETED,
            appliedHours: number(current.hours),
            balanceBefore: freshCalculation.balanceBefore,
            balanceAfter: freshCalculation.balanceAfter,
            currentEstimatedEndAt: freshCalculation.currentEstimatedEndAt
              ? new Date(freshCalculation.currentEstimatedEndAt)
              : null,
            estimatedEndAt: freshCalculation.estimatedEndAt
              ? new Date(freshCalculation.estimatedEndAt)
              : null,
            confirmedAt: new Date(),
          },
        });
        if (!claimed.count)
          throw new ConflictException("该报价已处理，不能重复入账");
        const updatedStudent = await tx.student.update({
          where: { id: existingStudentId },
          data: {
            totalHours: { increment: number(current.hours) },
            remainingHours: { increment: number(current.hours) },
          },
        });
        await tx.hourLedger.create({
          data: {
            studentId: existingStudentId,
            renewalId: id,
            type:
              current.type === EnrollmentType.FIRST_ENROLLMENT
                ? "FIRST_ENROLLMENT_ADD"
                : "RENEWAL_ADD",
            amount: number(current.hours),
            balanceAfter: updatedStudent.remainingHours,
            note: `${current.type === EnrollmentType.FIRST_ENROLLMENT ? "首次报读" : "续费"}入账 ${number(current.hours)} 课时`,
            operatorName: user.name,
          },
        });
        return tx.renewal.findUniqueOrThrow({
          where: { id },
          include: { student: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit(user, "CONFIRM_PAYMENT", "Renewal", id, {
      studentId: existingStudentId,
    });
    return this.mapRenewal(result);
  }
  async hourLedgers(studentId: string, user: AuthUser) {
    await this.student(studentId, user);
    return this.prisma.hourLedger.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  async business(type?: string) {
    return this.prisma.businessApplication.findMany({
      where: type ? { type } : {},
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
  }
  async saveBusiness(data: JsonMap, user: AuthUser) {
    const row = await this.prisma.businessApplication.create({
      data: {
        code: `${data.type}-${Date.now()}`,
        studentId: data.studentId,
        type: data.type,
        reason: data.reason || "",
        amount: data.amount,
        status: data.status || WorkflowStatus.COMPLETED,
      },
    });
    await this.audit(user, "CREATE", "BusinessApplication", row.id, data);
    return row;
  }
  async deleteBusiness(id: string, user: AuthUser) {
    await this.prisma.businessApplication.delete({ where: { id } });
    await this.audit(user, "DELETE", "BusinessApplication", id);
  }
  async recommendations(month?: string) {
    const rows = await this.prisma.recommendation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return month
      ? rows.filter((x) => x.createdAt.toISOString().startsWith(month))
      : rows;
  }
  async saveRecommendation(data: JsonMap, user: AuthUser, id?: string) {
    const payload = {
      studentName: data.studentName,
      grade: data.grade || "",
      subject: data.subject || "",
      referrer: data.referrer || "",
      status: data.status || WorkflowStatus.PENDING,
      trialAt: data.trialAt ? new Date(data.trialAt) : null,
      hasContact: data.hasContact,
      trialSubjects: data.trialSubjects,
      trialTeachers: data.trialTeachers,
      month: data.month,
    };
    const row = id
      ? await this.prisma.recommendation.update({
          where: { id },
          data: payload,
        })
      : await this.prisma.recommendation.create({ data: payload });
    await this.audit(
      user,
      id ? "UPDATE" : "CREATE",
      "Recommendation",
      row.id,
      data,
    );
    return row;
  }
  async deleteRecommendation(id: string, user: AuthUser) {
    await this.prisma.recommendation.delete({ where: { id } });
    await this.audit(user, "DELETE", "Recommendation", id);
  }
  async trainingModules() {
    return this.prisma.trainingModule.findMany({
      include: { materials: true },
      orderBy: { createdAt: "asc" },
    });
  }
  async saveTrainingModule(data: JsonMap, user: AuthUser, id?: string) {
    const row = id
      ? await this.prisma.trainingModule.update({
          where: { id },
          data: {
            name: data.name,
            description: data.description,
            color: data.color,
          },
        })
      : await this.prisma.trainingModule.create({
          data: {
            name: data.name,
            description: data.description || "",
            color: data.color || "blue",
          },
        });
    await this.audit(
      user,
      id ? "UPDATE" : "CREATE",
      "TrainingModule",
      row.id,
      data,
    );
    return row;
  }
  async deleteTrainingModule(id: string, user: AuthUser) {
    await this.prisma.trainingModule.delete({ where: { id } });
    await this.audit(user, "DELETE", "TrainingModule", id);
  }
  async uploadUrl(name: string, type: string) {
    if (!name) throw new BadRequestException("缺少文件名");
    const key = `training/${Date.now()}-${name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
    const url = await getSignedUrl(
      this.publicS3,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || "edu-materials",
        Key: key,
        ContentType: type,
      }),
      { expiresIn: 600 },
    );
    return { url, key };
  }
  async completeUpload(data: JsonMap, user: AuthUser) {
    return this.prisma.trainingMaterial.create({
      data: {
        moduleId: data.moduleId,
        name: data.name,
        objectKey: data.key,
        mimeType: data.mimeType || "application/octet-stream",
        size: number(data.size),
        uploaderId: user.sub,
      },
    });
  }
  async downloadUrl(key: string) {
    return {
      url: await getSignedUrl(
        this.publicS3,
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET || "edu-materials",
          Key: key,
        }),
        { expiresIn: 600 },
      ),
    };
  }
  async deleteMaterial(id: string, user: AuthUser) {
    const row = await this.prisma.trainingMaterial.delete({ where: { id } });
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET || "edu-materials",
        Key: row.objectKey,
      }),
    );
    await this.audit(user, "DELETE", "TrainingMaterial", id);
  }
  async analytics() {
    const [students, lessons, renewals, meetings, reports] = await Promise.all([
      this.prisma.student.findMany(),
      this.prisma.lesson.findMany(),
      this.prisma.renewal.findMany(),
      this.prisma.parentMeeting.findMany(),
      this.prisma.learningReport.findMany(),
    ]);
    const subjectDistribution = new Map<string, number>();
    students
      .flatMap((x) => x.subjects)
      .forEach((x) =>
        subjectDistribution.set(x, (subjectDistribution.get(x) || 0) + 1),
      );
    return {
      summary: {
        students: students.length,
        lessonHours: lessons.reduce((n, x) => n + number(x.consumedHours), 0),
        renewals: renewals.length,
        meetings: meetings.length,
        reports: reports.length,
      },
      subjectDistribution: [...subjectDistribution].map(([name, value]) => ({
        name,
        value,
      })),
    };
  }
  async profile(user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        teacher: true,
        auditLogs: { take: 20, orderBy: { createdAt: "desc" } },
      },
    });
    if (!row) throw new NotFoundException("用户不存在");
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatarUrl: row.avatarUrl,
      teacher: row.teacher,
      notificationSettings: row.notificationSettings,
      auditLogs: row.auditLogs,
    };
  }
  async updateProfile(data: JsonMap, user: AuthUser) {
    const row = await this.prisma.user.update({
      where: { id: user.sub },
      data: {
        name: data.name,
        notificationSettings: data.notificationSettings,
        avatarUrl: data.avatarUrl,
      },
    });
    await this.audit(user, "UPDATE", "User", user.sub, data);
    return row;
  }
  async audit(
    user: AuthUser,
    action: string,
    entity: string,
    entityId?: string,
    payload?: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.sub,
        action,
        entity,
        entityId,
        payload: payload as any,
      },
    });
  }

  async importStudents(buffer: Buffer, user: AuthUser) {
    if (!buffer) throw new BadRequestException("请选择 Excel 文件");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException("Excel 中没有工作表");
    const errors: string[] = [], rows: JsonMap[] = [];
    const split = (value: unknown) => String(value || "").split(/[;,；]/).map((item) => item.trim()).filter(Boolean);
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const textCell = (index: number) => {
          const value = row.getCell(index).value;
          const text = value === undefined || value === null ? "" : String(value).trim();
          return text || undefined;
        },
        numberCell = (index: number) => {
          const value = row.getCell(index).value;
          return value === undefined || value === null || value === "" ? undefined : value;
        },
        name = textCell(1),
        gender = textCell(2),
        grade = textCell(3);
      if (!name || !grade) {
        errors.push(`第 ${n} 行：姓名和年级为必填项`);
        return;
      }
      rows.push({
        name,
        gender,
        grade,
        school: textCell(4),
        status: textCell(5),
        guardianName: textCell(6),
        phone: textCell(7),
        address: textCell(8),
        subjects: textCell(9) ? split(row.getCell(9).value) : undefined,
        teacherNames: textCell(10) ? split(row.getCell(10).value) : undefined,
        schedules: textCell(11) ? split(row.getCell(11).value) : undefined,
        totalHours: numberCell(12),
        consumedHours: numberCell(13),
        remainingHours: numberCell(14),
        weakPoints: textCell(15),
        familyNotes: textCell(16),
      });
    });
    const keys = new Set<string>();
    rows.forEach((row, index) => {
      const key = row.phone ? `phone:${row.phone}` : `name:${row.name}:${row.grade}`;
      if (keys.has(key)) errors.push(`第 ${index + 2} 行：重复的联系电话或姓名+年级`);
      keys.add(key);
      if (row.status && !['ACTIVE', 'PAUSED', 'GRADUATED'].includes(row.status)) errors.push(`第 ${index + 2} 行：学生状态无效`);
      for (const [label, value] of [['报读总课时', row.totalHours], ['已消耗课时', row.consumedHours], ['剩余课时', row.remainingHours]] as const) {
        if (value !== undefined && value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`第 ${index + 2} 行：${label}必须为非负数字`);
      }
      if (row.totalHours !== undefined && row.remainingHours !== undefined && Number(row.remainingHours) > Number(row.totalHours)) errors.push(`第 ${index + 2} 行：剩余课时不能大于报读总课时`);
      if (row.totalHours !== undefined && row.consumedHours !== undefined && Number(row.consumedHours) > Number(row.totalHours)) errors.push(`第 ${index + 2} 行：已消耗课时不能大于报读总课时`);
      if (row.totalHours !== undefined && row.consumedHours !== undefined && row.remainingHours !== undefined && round2(Number(row.consumedHours) + Number(row.remainingHours)) !== round2(Number(row.totalHours))) errors.push(`第 ${index + 2} 行：报读总课时必须等于已消耗课时与剩余课时之和`);
    });
    if (errors.length) return { imported: 0, errors };
    let created = 0, updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const inputTotal = row.totalHours === undefined || row.totalHours === '' ? undefined : number(row.totalHours);
        const inputConsumed = row.consumedHours === undefined || row.consumedHours === '' ? undefined : number(row.consumedHours);
        const inputRemaining = row.remainingHours === undefined || row.remainingHours === '' ? undefined : number(row.remainingHours);
        const where = row.phone ? { guardianPhone: row.phone } : { name: row.name, grade: row.grade };
        const existing = await tx.student.findFirst({ where, include: { archive: true, subjectTeachers: true } });
        const existingConsumed = existing ? round2(number(existing.totalHours) - number(existing.remainingHours)) : 0;
        const totalHours = inputTotal ?? (existing ? number(existing.totalHours) : round2((inputConsumed || 0) + (inputRemaining || 0)));
        const consumedHours = inputConsumed ?? (inputRemaining !== undefined ? round2(totalHours - inputRemaining) : existingConsumed);
        const remainingHours = inputRemaining ?? round2(totalHours - consumedHours);
        if (totalHours < 0 || consumedHours < 0 || remainingHours < 0 || round2(consumedHours + remainingHours) !== round2(totalHours))
          throw new BadRequestException(`第 ${rows.indexOf(row) + 2} 行：课时合计不一致`);
        if (existing) {
          const profile = (existing.archive?.learningProfile || {}) as JsonMap;
          const learningProfile = {
            ...profile,
            ...(row.gender !== undefined ? { gender: row.gender } : {}),
            ...(row.guardianName !== undefined ? { guardianName: row.guardianName } : {}),
            ...(row.address !== undefined ? { address: row.address } : {}),
            ...(row.weakPoints !== undefined ? { weakPoints: row.weakPoints } : {}),
          };
          await tx.student.update({ where: { id: existing.id }, data: {
            name: row.name, grade: row.grade,
            ...(row.school ? { school: row.school } : {}), ...(row.phone ? { guardianPhone: row.phone } : {}),
            ...(row.status ? { status: row.status as StudentStatus } : {}),
            ...(row.totalHours !== undefined || row.consumedHours !== undefined || row.remainingHours !== undefined ? { totalHours, remainingHours } : {}),
            ...(row.subjects !== undefined ? { subjects: row.subjects as string[] } : {}),
          }});
          await tx.studentArchive.upsert({ where: { studentId: existing.id }, create: { studentId: existing.id, learningProfile, familyNotes: row.familyNotes || "" }, update: { learningProfile, ...(row.familyNotes !== undefined ? { familyNotes: row.familyNotes } : {}) } });
          if (row.subjects !== undefined) {
            const subjects = row.subjects as string[];
            const assignments = subjects.map((subject, index) => ({ subject, teacherName: row.teacherNames?.[index] || null, schedule: row.schedules?.[index] || null }));
            await tx.studentSubjectTeacher.deleteMany({ where: { studentId: existing.id } });
            if (assignments.length) await tx.studentSubjectTeacher.createMany({ data: assignments.map((item) => ({ studentId: existing.id, ...item })) });
          }
          updated++;
        } else {
          const subjects = (row.subjects || []) as string[];
          const assignments = subjects.map((subject, index) => ({ subject, teacherName: row.teacherNames?.[index] || null, schedule: row.schedules?.[index] || null }));
          await tx.student.create({ data: { name: row.name, grade: row.grade, school: row.school || "", guardianPhone: row.phone || "", subjects, totalHours, remainingHours, status: (row.status || "ACTIVE") as StudentStatus, archive: { create: { learningProfile: { guardianName: row.guardianName || "", gender: row.gender || "", address: row.address || "", weakPoints: row.weakPoints || "" }, familyNotes: row.familyNotes || "" } }, subjectTeachers: { create: assignments } } });
          created++;
        }
      }
    });
    await this.audit(user, "IMPORT", "Student", undefined, {
      count: rows.length,
    });
    return { imported: created + updated, created, updated, errors: [] };
  }

  async importTemplate(kind: string) {
    const headers: Record<string, string[]> = {
      students: ["姓名", "性别", "年级", "学校", "学生状态", "家长姓名", "联系电话", "家庭地址", "辅导科目（；分隔）", "科目教师（；分隔）", "科目固定上课时间（；分隔）", "报读总课时", "已消耗课时", "剩余课时", "学生需求", "家长期望"],
      courses: ["课程名称", "科目", "年级", "课时单价"],
      scores: ["学生姓名", "考试名称", "科目", "成绩", "满分", "考试日期"],
      renewals: ["学生姓名", "课时数", "金额", "备注"],
    };
    if (!headers[kind]) throw new BadRequestException("不支持的导入类型");
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("导入模板");
    sheet.addRow(headers[kind]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 20;
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importLedger(kind: string, buffer: Buffer, user: AuthUser) {
    if (kind === "students") return this.importStudents(buffer, user);
    if (!buffer) throw new BadRequestException("请选择 Excel 文件");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException("Excel 中没有工作表");
    const rows: string[][] = [];
    sheet.eachRow((row, index) => {
      if (index > 1) {
        const values = Array.isArray(row.values) ? row.values : [];
        rows.push(values.slice(1).map((value) => String(value || "").trim()));
      }
    });
    const errors: string[] = [];
    if (kind === "courses") {
      rows.forEach((row, index) => {
        if (!row[0] || !row[1] || !row[2])
          errors.push(`第 ${index + 2} 行：课程名称、科目、年级必填`);
      });
      if (errors.length) return { imported: 0, errors };
      await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.course.create({
            data: {
              name: row[0],
              subject: row[1],
              grade: row[2],
              pricePerHour: number(row[3]),
            },
          }),
        ),
      );
    } else if (kind === "scores" || kind === "renewals") {
      const studentRows = await Promise.all(
        rows.map((row) =>
          this.prisma.student.findFirst({ where: { name: row[0] } }),
        ),
      );
      studentRows.forEach((student, index) => {
        if (!student)
          errors.push(`第 ${index + 2} 行：找不到学生 ${rows[index][0]}`);
      });
      if (errors.length) return { imported: 0, errors };
      if (kind === "scores")
        await this.prisma.$transaction(async (tx) => {
          for (const [index, row] of rows.entries()) {
            const studentId = studentRows[index]!.id,
              examDate = new Date(row[5] || Date.now());
            const batch = await tx.scoreBatch.upsert({
              where: {
                studentId_name_examDate: { studentId, name: row[1], examDate },
              },
              create: { studentId, name: row[1], type: "OTHER", examDate },
              update: {},
            });
            await tx.score.upsert({
              where: {
                studentId_batchId_subject: {
                  studentId,
                  batchId: batch.id,
                  subject: row[2],
                },
              },
              create: {
                studentId,
                batchId: batch.id,
                examName: row[1],
                subject: row[2],
                score: number(row[3]),
                totalScore: number(row[4] || 100),
                examDate,
              },
              update: {
                score: number(row[3]),
                totalScore: number(row[4] || 100),
              },
            });
          }
        });
      else
        await this.prisma.$transaction(
          rows.map((row, index) =>
            this.prisma.renewal.create({
              data: {
                studentId: studentRows[index]!.id,
                hours: number(row[1]),
                amount: number(row[2]),
                note: row[3],
                status: WorkflowStatus.COMPLETED,
              },
            }),
          ),
        );
    } else throw new BadRequestException("不支持的导入类型");
    await this.audit(user, "IMPORT", kind, undefined, { count: rows.length });
    return { imported: rows.length, errors: [] };
  }
}
