import { PrismaClient, Role, StudentStatus, WorkflowStatus } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const students = [
  ['张明轩','初三','东莞市东华初级中学',['数学','物理'],23,100,'张先生','139****1234','周六 09:00-11:00','二次函数、圆的综合题',85],
  ['李思雨','高二','东莞市第一中学',['英语'],24,80,'李女士','138****5678','周日 14:00-16:00','阅读理解、完形填空',92],
  ['王浩然','初一','东莞市实验中学',['语文','数学'],17,70,'王先生','137****9012','周六 14:00-16:00','文言文翻译、作文立意',78],
  ['赵欣怡','高三','东莞高级中学',['物理','化学'],36,90,'赵先生','136****3456','周日 09:00-11:00','电磁感应、力学综合',88],
  ['陈子涵','小学五年级','中心小学',['数学'],32,48,'陈女士','135****7890','周六 10:00-12:00','分数运算、应用题',82],
  ['刘雨桐','初二','外国语学校',['英语'],3,40,'刘先生','134****2345','周日 10:00-12:00','语法填空、写作',75],
  ['孙嘉豪','高一','东莞中学',['化学','数学'],40,100,'孙女士','133****6789','周六 15:00-17:00','化学方程式、实验题',80],
  ['周梦琪','小学六年级','阳光小学',['语文'],28,48,'周先生','132****0123','周日 15:00-17:00','阅读理解、古诗词',86],
  ['吴俊杰','初三','东华初级中学',['物理'],12,50,'吴女士','131****4567','周六 08:00-10:00','电学基础、欧姆定律',72],
  ['郑雅文','高二','第一中学',['数学','物理'],24,120,'郑先生','130****8901','周日 08:00-10:00','导数、数列综合',90],
  ['黄天宇','初一','实验中学',['英语'],20,40,'黄女士','159****2345','周六 16:00-18:00','词汇、听力',79],
  ['林晓燕','高三','高级中学',['语文'],10,50,'林先生','158****6789','周日 16:00-18:00','现代文阅读、作文',84],
] as const;

async function upsertUser(email: string, name: string, role: Role, passwordHash: string) {
  return prisma.user.upsert({ where: { email }, update: { name, role, passwordHash }, create: { email, name, role, passwordHash } });
}

async function main() {
  const initialPassword = process.env.ADMIN_PASSWORD || 'hy20250221';
  const adminEmail = process.env.ADMIN_EMAIL || '1092855199@qq.com';
  const passwordHash = await argon2.hash(initialPassword);
  const adminUser = await upsertUser(adminEmail, '系统管理员', Role.ADMIN, passwordHash);
  const headUser = await upsertUser('head@edu.local', '李雯', Role.HEAD_TEACHER, passwordHash);
  const subjectUser = await upsertUser('teacher@edu.local', '王建国', Role.SUBJECT_TEACHER, passwordHash);

  const headTeacher = await prisma.teacher.upsert({ where: { userId: headUser.id }, update: { name: '李雯', subjects: ['班主任'] }, create: { name: '李雯', phone: '13800005678', subjects: ['班主任'], userId: headUser.id } });
  const subjectTeacher = await prisma.teacher.upsert({ where: { userId: subjectUser.id }, update: { name: '王建国', subjects: ['数学','物理'] }, create: { name: '王建国', phone: '13800001234', subjects: ['数学','物理'], userId: subjectUser.id } });

  for (let index = 0; index < students.length; index++) {
    const [name, grade, school, subjects, remainingHours, totalHours, guardianName, phone, schedule, weakPoints, recentScore] = students[index];
    let student = await prisma.student.findFirst({ where: { name } });
    if (!student) student = await prisma.student.create({ data: { name, grade, school, subjects: [...subjects], totalHours, remainingHours, guardianPhone: phone, status: StudentStatus.ACTIVE, headTeacherId: headTeacher.id } });
    for (const subject of subjects) await prisma.studentSubjectTeacher.upsert({ where: { studentId_subject: { studentId: student.id, subject } }, update: { teacherId: subjectTeacher.id }, create: { studentId: student.id, subject, teacherId: subjectTeacher.id } });
    await prisma.studentArchive.upsert({ where: { studentId: student.id }, update: {}, create: { studentId: student.id, learningProfile: { guardianName, gender: index % 3 === 1 ? '女' : '男', address: '东莞市南城区鸿福路88号', schedule, weakPoints, recentScore }, familyNotes: '家长希望孩子稳步提升成绩并形成良好的学习习惯。', communicationNotes: [{ date: '2026-09-15', type: '电话回访', title: '月度学习情况同步', content: '与家长沟通本月学习进展和下阶段重点。' }] } });
    let course = await prisma.course.findFirst({ where: { name: `${name}${subjects[0]}一对一` } });
    if (!course) course = await prisma.course.create({ data: { name: `${name}${subjects[0]}一对一`, subject: subjects[0], grade, pricePerHour: 185, teacherId: subjectTeacher.id } });
    if (await prisma.lesson.count({ where: { studentId: student.id } }) === 0) {
      for (let lessonIndex = 0; lessonIndex < 3; lessonIndex++) await prisma.lesson.create({ data: { courseId: course.id, studentId: student.id, startsAt: new Date(2026, 8, 17 - lessonIndex * 7, 9, 0), durationMinutes: 120, status: WorkflowStatus.COMPLETED, consumedHours: 2 } });
    }
    if (await prisma.score.count({ where: { studentId: student.id } }) === 0) {
      const examDate = new Date(2026, 8, 1);
      const batch = await prisma.scoreBatch.upsert({ where: { studentId_name_examDate: { studentId: student.id, name: '入学成绩', examDate } }, update: {}, create: { studentId: student.id, type: 'ENTRANCE', name: '入学成绩', examDate } });
      for (const [offset, subject] of subjects.entries()) await prisma.score.create({ data: { studentId: student.id, batchId: batch.id, teacherId: subjectTeacher.id, examName: '入学成绩', subject, score: Number(recentScore) - offset * 2, totalScore: 100, examDate } });
    }
  }

  for (const ownerUserId of [headUser.id, adminUser.id]) if (await prisma.todoTask.count({ where: { ownerUserId } }) === 0) {
    const firstStudents = await prisma.student.findMany({ take: 4, orderBy: { createdAt: 'asc' } });
    const due = new Date(); due.setHours(12, 0, 0, 0);
    const tasks = [
      ['填写课后学情反馈', '课程相关', 'HIGH', '/courses'],
      ['回复家长续费咨询', '家校工作', 'HIGH', '/renewals'],
      ['审核调课申请', '课程相关', 'MEDIUM', '/courses'],
      ['完成新生建档', '学生管理', 'MEDIUM', '/archives'],
    ] as const;
    for (const [index, task] of tasks.entries()) await prisma.todoTask.create({ data: { ownerUserId, studentId: firstStudents[index]?.id, title: task[0], category: task[1], priority: task[2], dueAt: new Date(due.getTime() + index * 2 * 3600000), relatedPath: task[3] } });
  }

  for (const [name, description, color] of [['教学技能培训','提升教师课堂教学能力与授课技巧','blue'],['班主任工作规范','班主任日常工作流程与标准规范','green'],['家校沟通技巧','与家长有效沟通的方法与话术','orange']]) {
    if (!await prisma.trainingModule.findFirst({ where: { name } })) await prisma.trainingModule.create({ data: { name, description, color } });
  }
}

main().finally(() => prisma.$disconnect());
