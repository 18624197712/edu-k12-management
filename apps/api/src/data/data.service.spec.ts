import {
  EnrollmentType,
  Role,
  StudentStatus,
  WorkflowStatus,
} from "@prisma/client";
import {
  buildWeeklyLessonDates,
  calculateEnrollmentQuote,
  DataService,
  lessonAccountingChange,
  lessonHours,
  parseFixedSchedule,
} from "./data.service";

describe("DataService business rules", () => {
  const service = new DataService({} as never);

  it("calculates normal, half-price, activity and gift lessons", () => {
    expect(
      service.calculateRenewal({
        price: 200,
        normalHours: 20,
        halfHours: 4,
        giftHours: 3,
        activities: [{ amount: 300, hours: 2 }],
      }),
    ).toMatchObject({ paid: 4700, totalHours: 29, averagePrice: 162.07 });
  });

  it("returns a zero average when no lessons are purchased", () => {
    expect(service.calculateRenewal({ price: 200 })).toMatchObject({
      paid: 0,
      totalHours: 0,
      averagePrice: 0,
    });
  });

  it("projects the current and post-purchase balances with ceiling weeks", () => {
    expect(
      calculateEnrollmentQuote(
        {
          price: 185,
          normalHours: 6,
          halfHours: 0,
          giftHours: 0,
          activities: [],
          weeklyFrequency: 2,
          sessionHours: 2,
          projectionStart: "2026-09-29T00:00:00.000Z",
        },
        5,
      ),
    ).toEqual({
      originalAmount: 1110,
      paid: 1110,
      savedAmount: 0,
      discountRate: 10,
      totalHours: 6,
      averagePrice: 185,
      balanceBefore: 5,
      balanceAfter: 11,
      weeklyConsumption: 4,
      currentWeeks: 2,
      projectedWeeks: 3,
      currentEstimatedEndAt: "2026-10-13T00:00:00.000Z",
      estimatedEndAt: "2026-10-20T00:00:00.000Z",
    });
  });

  it("rejects invalid frequency and negative pricing inputs", () => {
    expect(() =>
      calculateEnrollmentQuote({
        price: 100,
        weeklyFrequency: 0,
        sessionHours: 2,
      }),
    ).toThrow("每周上课次数必须是大于 0 的整数");
    expect(() =>
      calculateEnrollmentQuote({
        price: -1,
        weeklyFrequency: 2,
        sessionHours: 2,
      }),
    ).toThrow("原价单价不能小于 0");
  });

  it("generates the four supported Excel templates", async () => {
    for (const kind of ["students", "courses", "scores", "renewals"])
      expect((await service.importTemplate(kind)).byteLength).toBeGreaterThan(
        100,
      );
  });

  it("creates one-off and weekly lesson dates without exceeding the end date", () => {
    const start = new Date("2026-09-21T09:00:00.000Z");
    expect(
      buildWeeklyLessonDates(
        start,
        new Date("2026-10-12T09:00:00.000Z"),
        false,
      ),
    ).toHaveLength(1);
    expect(
      buildWeeklyLessonDates(
        start,
        new Date("2026-10-12T09:00:00.000Z"),
        true,
      ).map((date) => date.toISOString()),
    ).toEqual([
      "2026-09-21T09:00:00.000Z",
      "2026-09-28T09:00:00.000Z",
      "2026-10-05T09:00:00.000Z",
      "2026-10-12T09:00:00.000Z",
    ]);
  });

  it("converts lesson duration to billable hours unless an explicit value is provided", () => {
    expect(lessonHours(90)).toBe(1.5);
    expect(lessonHours(120, 1)).toBe(1);
  });

  it("parses fixed archive schedules for future lesson synchronization", () => {
    expect(parseFixedSchedule("周六 09:00-11:00")).toEqual({
      weekday: 6,
      hour: 9,
      minute: 0,
      durationMinutes: 120,
    });
    expect(parseFixedSchedule("未设置")).toBeNull();
  });

  it("only applies the accounting difference when lesson completion changes", () => {
    expect(lessonAccountingChange(0, WorkflowStatus.COMPLETED, 120)).toEqual({
      appliedHours: 2,
      delta: 2,
    });
    expect(lessonAccountingChange(2, WorkflowStatus.COMPLETED, 120)).toEqual({
      appliedHours: 2,
      delta: 0,
    });
    expect(lessonAccountingChange(2, WorkflowStatus.PENDING, 120)).toEqual({
      appliedHours: 0,
      delta: -2,
    });
    expect(lessonAccountingChange(2, WorkflowStatus.COMPLETED, 180)).toEqual({
      appliedHours: 3,
      delta: 1,
    });
  });

  it("saves a first-enrollment estimate as pending without changing student hours", async () => {
    const createdAt = new Date("2026-09-29T08:00:00.000Z");
    const studentUpdate = jest.fn();
        const prisma = {
      renewal: {
        create: jest.fn(async ({ data }: any) => ({
          id: "quote-1",
          ...data,
          student: null,
          createdAt,
          updatedAt: createdAt,
        })),
      },
      student: { update: studentUpdate },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const scopedService = new DataService(prisma as never);
    const quote = await scopedService.saveRenewal(
      {
        type: EnrollmentType.FIRST_ENROLLMENT,
        prospectName: "新同学",
        prospectPhone: "13800000000",
        price: 200,
        normalHours: 10,
        halfHours: 0,
        giftHours: 2,
        activities: [],
        weeklyFrequency: 2,
        sessionHours: 2,
        projectionStart: "2026-09-29",
      },
      { sub: "admin-1", role: Role.ADMIN, name: "管理员" },
    );

    expect(quote).toMatchObject({
      status: WorkflowStatus.PENDING,
      totalHours: 12,
      paid: 2000,
      balanceBefore: 0,
      balanceAfter: 12,
    });
    expect(studentUpdate).not.toHaveBeenCalled();
  });

  it("confirms a quote once and writes one shared-hour ledger entry", async () => {
    const createdAt = new Date("2026-09-29T08:00:00.000Z");
    let status: WorkflowStatus = WorkflowStatus.PENDING;
    const quote = {
      id: "quote-1",
      type: EnrollmentType.RENEWAL,
      studentId: "student-1",
      prospectName: "学生甲",
      prospectPhone: "13800000000",
      unitPrice: 200,
      normalHours: 10,
      halfHours: 0,
      giftHours: 0,
      giftType: null,
      activities: [],
      hours: 10,
      appliedHours: 0,
      amount: 2000,
      balanceBefore: 5,
      balanceAfter: 15,
      weeklyFrequency: 2,
      sessionHours: 2,
      projectionStart: createdAt,
      currentEstimatedEndAt: null,
      estimatedEndAt: null,
      followUpAt: null,
      confirmedAt: null,
      createdById: "admin-1",
      createdByName: "管理员",
      note: null,
      createdAt,
      updatedAt: createdAt,
    };
    const studentRow = {
      id: "student-1",
      name: "学生甲",
      grade: "初一",
      school: "",
      guardianPhone: "",
      subjects: [],
      totalHours: 20,
      remainingHours: 5,
      status: "ACTIVE",
      headTeacherId: null,
      headTeacher: null,
      archive: null,
      subjectTeachers: [],
      _count: { lessons: 0 },
    };
    const ledgerCreate = jest.fn(async () => ({}));
    const studentUpdate = jest.fn(async () => ({
      ...studentRow,
      totalHours: 30,
      remainingHours: 15,
    }));
    const tx = {
      renewal: {
        findUniqueOrThrow: jest.fn(async ({ include }: any) =>
          include
            ? {
                ...quote,
                status,
                appliedHours: status === WorkflowStatus.COMPLETED ? 10 : 0,
                student: studentRow,
                confirmedAt: createdAt,
              }
            : { ...quote, status },
        ),
        updateMany: jest.fn(async () => {
          status = WorkflowStatus.COMPLETED;
          return { count: 1 };
        }),
      },
      student: {
        findUniqueOrThrow: jest.fn(async () => studentRow),
        update: studentUpdate,
        create: jest.fn(),
      },
      teacher: { findUnique: jest.fn() },
      hourLedger: { create: ledgerCreate },
    };
    const prisma = {
      renewal: { findFirst: jest.fn(async () => ({ ...quote, status })) },
      student: { findFirst: jest.fn(async () => studentRow) },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const scopedService = new DataService(prisma as never);
    const user = { sub: "admin-1", role: Role.ADMIN, name: "管理员" };

    const completed = await scopedService.confirmRenewal("quote-1", {}, user);
    expect(completed).toMatchObject({
      status: WorkflowStatus.COMPLETED,
      balanceBefore: 5,
      balanceAfter: 15,
    });
    expect(studentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          totalHours: { increment: 10 },
          remainingHours: { increment: 10 },
        },
      }),
    );
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RENEWAL_ADD",
          amount: 10,
          balanceAfter: 15,
        }),
      }),
    );
    await expect(
      scopedService.confirmRenewal("quote-1", {}, user),
    ).rejects.toThrow("该报价已处理，不能重复入账");
    expect(ledgerCreate).toHaveBeenCalledTimes(1);
  });

  it("deletes a student only when no business history exists", async () => {
    const studentDelete = jest.fn(async () => ({}));
    const prisma = {
      student: {
        findFirst: jest.fn(async () => ({
          id: "student-empty",
          name: "无历史学生",
          status: StudentStatus.ACTIVE,
          _count: {
            lessons: 0,
            plans: 0,
            scores: 0,
            reports: 0,
            meetings: 0,
            renewals: 0,
            applications: 0,
            recommendations: 0,
            scoreBatches: 0,
            hourLedgers: 0,
          },
        })),
        delete: studentDelete,
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const scopedService = new DataService(prisma as never);

    await scopedService.deleteStudent("student-empty", {
      sub: "admin-1",
      role: Role.ADMIN,
      name: "管理员",
    });

    expect(studentDelete).toHaveBeenCalledWith({
      where: { id: "student-empty" },
    });
  });

  it("rejects deleting a student with retained business history", async () => {
    const studentDelete = jest.fn();
    const prisma = {
      student: {
        findFirst: jest.fn(async () => ({
          id: "student-history",
          name: "有历史学生",
          status: StudentStatus.ACTIVE,
          _count: {
            lessons: 1,
            plans: 0,
            scores: 0,
            reports: 0,
            meetings: 0,
            renewals: 0,
            applications: 0,
            recommendations: 0,
            scoreBatches: 0,
            hourLedgers: 0,
          },
        })),
        delete: studentDelete,
      },
    };
    const scopedService = new DataService(prisma as never);

    await expect(
      scopedService.deleteStudent("student-history", {
        sub: "admin-1",
        role: Role.ADMIN,
        name: "管理员",
      }),
    ).rejects.toThrow("不能直接删除");
    expect(studentDelete).not.toHaveBeenCalled();
  });

  it("cleans all linked records before deleting a graduated student", async () => {
    const cleanup = {
      hourLedger: { deleteMany: jest.fn(async () => ({})) },
      lesson: { deleteMany: jest.fn(async () => ({})) },
      scoreBatch: { deleteMany: jest.fn(async () => ({})) },
      teachingPlan: { deleteMany: jest.fn(async () => ({})) },
      learningReport: { deleteMany: jest.fn(async () => ({})) },
      parentMeeting: { deleteMany: jest.fn(async () => ({})) },
      businessApplication: { deleteMany: jest.fn(async () => ({})) },
      renewal: { deleteMany: jest.fn(async () => ({})) },
      recommendation: { updateMany: jest.fn(async () => ({})) },
      todoTask: { updateMany: jest.fn(async () => ({})) },
      studentSubjectTeacher: { deleteMany: jest.fn(async () => ({})) },
      studentArchive: { deleteMany: jest.fn(async () => ({})) },
      student: { delete: jest.fn(async () => ({})) },
    };
    const prisma = {
      student: {
        findFirst: jest.fn(async () => ({
          id: "student-graduated",
          name: "已结业学生",
          status: StudentStatus.GRADUATED,
          _count: {
            lessons: 2,
            plans: 1,
            scores: 3,
            reports: 1,
            meetings: 1,
            renewals: 1,
            applications: 1,
            recommendations: 1,
            scoreBatches: 2,
            hourLedgers: 4,
          },
        })),
      },
      $transaction: jest.fn(async (callback: (client: typeof cleanup) => unknown) =>
        callback(cleanup),
      ),
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const scopedService = new DataService(prisma as never);

    await scopedService.deleteStudent("student-graduated", {
      sub: "admin-1",
      role: Role.ADMIN,
      name: "管理员",
    });

    expect(cleanup.hourLedger.deleteMany).toHaveBeenCalledWith({
      where: { studentId: "student-graduated" },
    });
    expect(cleanup.lesson.deleteMany).toHaveBeenCalledWith({
      where: { studentId: "student-graduated" },
    });
    expect(cleanup.recommendation.updateMany).toHaveBeenCalledWith({
      where: { enrolledStudentId: "student-graduated" },
      data: { enrolledStudentId: null },
    });
    expect(cleanup.todoTask.updateMany).toHaveBeenCalledWith({
      where: { studentId: "student-graduated" },
      data: { studentId: null },
    });
    expect(cleanup.student.delete).toHaveBeenCalledWith({
      where: { id: "student-graduated" },
    });
  });

  it.each([WorkflowStatus.PENDING, WorkflowStatus.CANCELLED])(
    "deletes a non-posted quote in %s status",
    async (status) => {
      const renewalDelete = jest.fn(async () => ({}));
      const prisma = {
        renewal: {
          findFirst: jest.fn(async () => ({
            id: "quote-removable",
            status,
            appliedHours: 0,
          })),
          delete: renewalDelete,
        },
        auditLog: { create: jest.fn(async () => ({})) },
      };
      const scopedService = new DataService(prisma as never);

      await scopedService.deleteRenewal("quote-removable", {
        sub: "admin-1",
        role: Role.ADMIN,
        name: "管理员",
      });

      expect(renewalDelete).toHaveBeenCalledWith({
        where: { id: "quote-removable" },
      });
    },
  );

  it("rejects deleting a completed quote linked to hour accounting", async () => {
    const renewalDelete = jest.fn();
    const prisma = {
      renewal: {
        findFirst: jest.fn(async () => ({
          id: "quote-completed",
          status: WorkflowStatus.COMPLETED,
          appliedHours: 10,
        })),
        delete: renewalDelete,
      },
    };
    const scopedService = new DataService(prisma as never);

    await expect(
      scopedService.deleteRenewal("quote-completed", {
        sub: "admin-1",
        role: Role.ADMIN,
        name: "管理员",
      }),
    ).rejects.toThrow("已入账记录关联课时流水，不能删除");
    expect(renewalDelete).not.toHaveBeenCalled();
  });

  it("deletes a score batch after validating the student scope", async () => {
    const scoreBatchDelete = jest.fn(async () => ({}));
    const prisma = {
      scoreBatch: {
        findUnique: jest.fn(async () => ({
          id: "batch-1",
          studentId: "student-1",
          name: "9月月考",
        })),
        delete: scoreBatchDelete,
      },
      student: {
        findFirst: jest.fn(async () => ({
          id: "student-1",
          name: "学生甲",
          grade: "初一",
          school: "",
          guardianPhone: "",
          subjects: ["数学"],
          totalHours: 10,
          remainingHours: 5,
          status: "ACTIVE",
          headTeacher: null,
          archive: null,
          subjectTeachers: [],
          _count: { lessons: 0 },
        })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const scopedService = new DataService(prisma as never);

    await scopedService.deleteScoreBatch("batch-1", {
      sub: "admin-1",
      role: Role.ADMIN,
      name: "管理员",
    });

    expect(scoreBatchDelete).toHaveBeenCalledWith({ where: { id: "batch-1" } });
  });
});
